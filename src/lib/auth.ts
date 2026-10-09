/**
 * Mock Cognito seam.
 *
 * NO live backend: there is no real Cognito pool wired to this console.
 * This module mirrors the seam the real client will use — a JWT in
 * localStorage whose payload carries `custom:tenant_id` and
 * `cognito:groups` (the exact claims minted by infra/stacks/api.py) —
 * and parses it client-side for tenant-scoped rendering only. It is
 * NOT authentication: nothing here verifies a signature, and the UI
 * labels the tenant switcher as DEMO everywhere it appears.
 */

export const TOKEN_KEY = 'evidia.mock.jwt';

export interface JwtPayload {
  sub?: string;
  email?: string;
  'custom:tenant_id'?: string;
  'cognito:groups'?: string[];
  [claim: string]: unknown;
}

function base64UrlDecode(segment: string): string {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
  return atob(padded);
}

/** Parse the payload of a JWT (no signature verification — mock seam). */
export function parseJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1])) as JwtPayload;
  } catch {
    return null;
  }
}

/** Build a structurally-valid fake JWT for the demo tenant switcher. */
export function makeFakeJwt(tenantId: string, groups: string[]): string {
  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const header = encode({ alg: 'none', typ: 'JWT' });
  const payload = encode({
    sub: 'mock-user-0001',
    email: 'demo@evidia.example',
    'custom:tenant_id': tenantId,
    'cognito:groups': groups,
  });
  return `${header}.${payload}.mock-signature`;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function currentPayload(): JwtPayload | null {
  const token = getToken();
  return token ? parseJwtPayload(token) : null;
}

/** Tenant the UI is scoped to, from the `custom:tenant_id` claim. */
export function currentTenant(): string | null {
  return currentPayload()?.['custom:tenant_id'] ?? null;
}

export function currentGroups(): string[] {
  return currentPayload()?.['cognito:groups'] ?? [];
}

/** Seed a demo token on first load so the console renders tenant-scoped. */
export function ensureDemoToken(defaultTenant = 'acme_rare'): void {
  if (!getToken()) {
    setToken(makeFakeJwt(defaultTenant, [`tenant-${defaultTenant}`]));
  }
}

/** DEMO-ONLY tenant switch: re-mints the fake JWT for another tenant. */
export function switchTenantDemo(tenantId: string): void {
  setToken(makeFakeJwt(tenantId, [`tenant-${tenantId}`]));
}
