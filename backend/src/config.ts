import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const config = {
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),

  databaseUrl: requireEnv('DATABASE_URL'),

  jwtSecret: requireEnv('JWT_SECRET'),
  jwtAccessExpiry: optionalEnv('JWT_ACCESS_EXPIRY', '15m'),
  jwtRefreshExpiry: optionalEnv('JWT_REFRESH_EXPIRY', '7d'),

  adminUsername: optionalEnv('ADMIN_USERNAME', 'admin'),
  adminPassword: optionalEnv('ADMIN_PASSWORD', 'admin123'),

  encryptionMode: optionalEnv('ENCRYPTION_MODE', 'local') as 'local' | 'kms',
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  kmsKeyArn: process.env.KMS_KEY_ARN || '',

  allowedOrigins: optionalEnv('ALLOWED_ORIGINS', 'http://localhost:5173').split(','),

  rateLimitProxy: parseInt(optionalEnv('RATE_LIMIT_PROXY', '100'), 10),
  rateLimitApi: parseInt(optionalEnv('RATE_LIMIT_API', '120'), 10),
  rateLimitLogin: parseInt(optionalEnv('RATE_LIMIT_LOGIN', '5'), 10),

  logLevel: optionalEnv('LOG_LEVEL', 'info'),
  logRetentionDays: parseInt(optionalEnv('LOG_RETENTION_DAYS', '30'), 10),
} as const;
