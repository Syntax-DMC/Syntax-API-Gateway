import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { pool } from './pool';
import { config } from '../config';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const PLATFORM_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000002';

async function runMigrations(): Promise<void> {
  // Create migrations tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Get already executed migrations
  const { rows: executed } = await pool.query('SELECT name FROM _migrations ORDER BY name');
  const executedNames = new Set(executed.map((r) => r.name));

  // Read and sort migration files
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (executedNames.has(file)) {
      console.log(`  skip: ${file} (already executed)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    console.log(`  run:  ${file}`);
    await pool.query(sql);
    await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
  }
}

async function ensureAdminUser(): Promise<void> {
  const { rows } = await pool.query(
    'SELECT id, is_superadmin FROM users WHERE username = $1',
    [config.adminUsername]
  );

  if (rows.length === 0) {
    const passwordHash = await bcrypt.hash(config.adminPassword, 12);
    const { rows: newRows } = await pool.query(
      `INSERT INTO users (username, password_hash, is_superadmin) VALUES ($1, $2, true) RETURNING id`,
      [config.adminUsername, passwordHash]
    );
    const userId = newRows[0].id;

    // Add to Platform + Default tenants as admin
    await pool.query(
      `INSERT INTO user_tenants (user_id, tenant_id, role) VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING`,
      [userId, PLATFORM_TENANT_ID]
    );
    await pool.query(
      `INSERT INTO user_tenants (user_id, tenant_id, role) VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING`,
      [userId, DEFAULT_TENANT_ID]
    );

    console.log(`  Admin user "${config.adminUsername}" created (superadmin, Platform + Default tenants).`);
  } else {
    // Ensure existing admin is superadmin and in both tenants
    const userId = rows[0].id;
    if (!rows[0].is_superadmin) {
      await pool.query('UPDATE users SET is_superadmin = true WHERE id = $1', [userId]);
    }
    await pool.query(
      `INSERT INTO user_tenants (user_id, tenant_id, role) VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING`,
      [userId, PLATFORM_TENANT_ID]
    );
    await pool.query(
      `INSERT INTO user_tenants (user_id, tenant_id, role) VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING`,
      [userId, DEFAULT_TENANT_ID]
    );
    console.log(`  Admin user "${config.adminUsername}" already exists.`);
  }
}

export async function migrate(): Promise<void> {
  console.log('Running migrations...');
  await runMigrations();
  console.log('Ensuring admin user...');
  await ensureAdminUser();
  console.log('Database ready.');
}

// Allow running directly: npx tsx src/db/migrate.ts
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
