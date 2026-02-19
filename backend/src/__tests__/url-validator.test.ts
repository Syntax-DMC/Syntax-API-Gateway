/**
 * Tests for C-1: SSRF via User-Controlled URLs
 * Verifies URL validation blocks private IPs, cloud metadata,
 * non-HTTPS in production, localhost, and credential-embedded URLs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config before importing the module under test
vi.mock('../config', () => ({
  config: {
    nodeEnv: 'production',
    port: 3000,
    databaseUrl: 'postgres://localhost/test',
    jwtSecret: 'test-secret',
    jwtAccessExpiry: '15m',
    jwtRefreshExpiry: '7d',
    adminUsername: 'admin',
    adminPassword: 'admin123',
    encryptionMode: 'local',
    encryptionKey: '',
    kmsKeyArn: '',
    allowedOrigins: ['http://localhost:5173'],
    rateLimitProxy: 100,
    rateLimitApi: 30,
    rateLimitLogin: 5,
    logLevel: 'info',
    logRetentionDays: 30,
  },
}));

// Mock dns to avoid real DNS lookups in tests
vi.mock('dns', () => ({
  default: {
    resolve4: vi.fn(),
  },
  resolve4: vi.fn(),
}));

import dns from 'dns';
import { config } from '../config';

// We need to dynamically import to get the mocked module
const { validateUpstreamUrl, validateUpstreamUrlDns } = await import('../utils/url-validator');

describe('C-1: SSRF Protection - validateUpstreamUrl', () => {
  it('accepts valid HTTPS URLs', () => {
    const result = validateUpstreamUrl('https://api.sap.com/dm/v1');
    expect(result.valid).toBe(true);
  });

  it('rejects empty URL', () => {
    const result = validateUpstreamUrl('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('required');
  });

  it('rejects malformed URLs', () => {
    const result = validateUpstreamUrl('not-a-url');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid URL format');
  });

  it('rejects HTTP URLs in production', () => {
    const result = validateUpstreamUrl('http://api.example.com/endpoint');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('HTTPS');
  });

  it('rejects URLs exceeding max length', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2100);
    const result = validateUpstreamUrl(longUrl);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('2048');
  });

  // --- Private IP blocking ---

  it('blocks loopback addresses (127.x.x.x)', () => {
    const result = validateUpstreamUrl('https://127.0.0.1/api');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Private');
  });

  it('blocks private class A (10.x.x.x)', () => {
    const result = validateUpstreamUrl('https://10.0.0.1/api');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Private');
  });

  it('blocks private class B (172.16-31.x.x)', () => {
    const result = validateUpstreamUrl('https://172.16.0.1/api');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Private');
  });

  it('allows non-private 172.x (172.32.0.1)', () => {
    const result = validateUpstreamUrl('https://172.32.0.1/api');
    expect(result.valid).toBe(true);
  });

  it('blocks private class C (192.168.x.x)', () => {
    const result = validateUpstreamUrl('https://192.168.1.1/api');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Private');
  });

  it('blocks link-local (169.254.x.x) — AWS metadata range', () => {
    const result = validateUpstreamUrl('https://169.254.169.254/latest/meta-data');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Private');
  });

  it('blocks 0.0.0.0', () => {
    const result = validateUpstreamUrl('https://0.0.0.0/api');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Private');
  });

  // --- Cloud metadata hostname blocking ---

  it('blocks metadata.google.internal', () => {
    const result = validateUpstreamUrl('https://metadata.google.internal/computeMetadata/v1/');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not allowed');
  });

  // --- Localhost blocking ---

  it('blocks localhost', () => {
    const result = validateUpstreamUrl('https://localhost/api');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Localhost');
  });

  it('blocks [::1] (IPv6 loopback)', () => {
    const result = validateUpstreamUrl('https://[::1]/api');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Localhost');
  });

  // --- Credential-embedded URLs ---

  it('blocks URLs with userinfo (user:pass@host)', () => {
    const result = validateUpstreamUrl('https://admin:secret@evil.com/api');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('credentials');
  });

  // --- FTP / other protocols ---

  it('rejects FTP protocol', () => {
    const result = validateUpstreamUrl('ftp://files.example.com/data');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('HTTPS');
  });
});

describe('C-1: SSRF Protection - validateUpstreamUrlDns', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('passes when DNS resolves to public IP', async () => {
    const resolve4 = dns.resolve4 as unknown as ReturnType<typeof vi.fn>;
    resolve4.mockImplementation(
      (_hostname: string, callback: (err: Error | null, addresses: string[]) => void) => {
        callback(null, ['203.0.113.1']);
      }
    );

    const result = await validateUpstreamUrlDns('https://api.example.com/endpoint');
    expect(result.valid).toBe(true);
  });

  it('blocks when DNS resolves to private IP', async () => {
    const resolve4 = dns.resolve4 as unknown as ReturnType<typeof vi.fn>;
    resolve4.mockImplementation(
      (_hostname: string, callback: (err: Error | null, addresses: string[]) => void) => {
        callback(null, ['10.0.0.1']);
      }
    );

    const result = await validateUpstreamUrlDns('https://evil-rebind.com/api');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('private');
  });

  it('blocks when DNS resolution fails', async () => {
    const resolve4 = dns.resolve4 as unknown as ReturnType<typeof vi.fn>;
    resolve4.mockImplementation(
      (_hostname: string, callback: (err: Error | null, addresses: string[]) => void) => {
        callback(new Error('ENOTFOUND'), []);
      }
    );

    const result = await validateUpstreamUrlDns('https://nonexistent.invalid/api');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('resolve');
  });

  it('skips DNS check for IP literals (already validated)', async () => {
    const resolve4 = dns.resolve4 as unknown as ReturnType<typeof vi.fn>;
    // Clear call history from previous tests
    resolve4.mockClear();

    const result = await validateUpstreamUrlDns('https://203.0.113.50/api');
    expect(result.valid).toBe(true);
    // Should NOT have called dns.resolve4 for IP literals
    expect(resolve4).not.toHaveBeenCalled();
  });
});

describe('C-1 + H-3: HTTPS enforcement in production', () => {
  it('rejects HTTP in production mode', () => {
    // config.nodeEnv is already mocked as 'production'
    const result = validateUpstreamUrl('http://api.example.com/test');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('HTTPS');
  });
});
