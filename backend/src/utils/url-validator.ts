import { config } from '../config';
import dns from 'dns';
import { promisify } from 'util';
import net from 'net';

const dnsResolve = promisify(dns.resolve4);

// Private/reserved IP ranges that should never be targets
const BLOCKED_IP_RANGES = [
  // Loopback
  { start: '127.0.0.0', end: '127.255.255.255' },
  // Private class A
  { start: '10.0.0.0', end: '10.255.255.255' },
  // Private class B
  { start: '172.16.0.0', end: '172.31.255.255' },
  // Private class C
  { start: '192.168.0.0', end: '192.168.255.255' },
  // Link-local
  { start: '169.254.0.0', end: '169.254.255.255' },
  // Current network
  { start: '0.0.0.0', end: '0.255.255.255' },
];

// Cloud metadata endpoints (AWS, GCP, Azure)
const BLOCKED_HOSTNAMES = [
  'metadata.google.internal',
  'metadata.goog',
];

const MAX_URL_LENGTH = 2048;

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isPrivateIp(ip: string): boolean {
  if (!net.isIPv4(ip)) return false;
  const ipInt = ipToInt(ip);
  return BLOCKED_IP_RANGES.some(
    (range) => ipInt >= ipToInt(range.start) && ipInt <= ipToInt(range.end)
  );
}

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a URL for use as an upstream proxy target.
 * Blocks private IPs, cloud metadata endpoints, and non-HTTPS in production.
 */
export function validateUpstreamUrl(url: string): UrlValidationResult {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  if (url.length > MAX_URL_LENGTH) {
    return { valid: false, error: `URL must not exceed ${MAX_URL_LENGTH} characters` };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Enforce HTTPS in production, allow HTTP in development
  const allowedProtocols = config.nodeEnv === 'development'
    ? ['https:', 'http:']
    : ['https:'];

  if (!allowedProtocols.includes(parsed.protocol)) {
    return { valid: false, error: 'Only HTTPS URLs are allowed' };
  }

  // Block cloud metadata endpoints
  if (BLOCKED_HOSTNAMES.includes(parsed.hostname.toLowerCase())) {
    return { valid: false, error: 'This hostname is not allowed' };
  }

  // Block if hostname is a private IP literal
  if (net.isIPv4(parsed.hostname) && isPrivateIp(parsed.hostname)) {
    return { valid: false, error: 'Private/internal IP addresses are not allowed' };
  }

  // Block localhost variants
  if (parsed.hostname === 'localhost' || parsed.hostname === '[::1]') {
    return { valid: false, error: 'Localhost URLs are not allowed' };
  }

  // Block userinfo in URL (potential SSRF bypass)
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URLs with credentials are not allowed' };
  }

  return { valid: true };
}

/**
 * Async DNS-based validation: resolves hostname and checks if it points to a private IP.
 * Call this after the synchronous check for defense-in-depth against DNS rebinding.
 */
export async function validateUpstreamUrlDns(url: string): Promise<UrlValidationResult> {
  // Run synchronous checks first
  const syncResult = validateUpstreamUrl(url);
  if (!syncResult.valid) return syncResult;

  const parsed = new URL(url);

  // Skip DNS check for IP literals (already checked in sync validation)
  if (net.isIPv4(parsed.hostname)) return { valid: true };

  try {
    const addresses = await dnsResolve(parsed.hostname);
    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        return { valid: false, error: 'URL resolves to a private/internal IP address' };
      }
    }
  } catch {
    return { valid: false, error: 'Unable to resolve hostname' };
  }

  return { valid: true };
}
