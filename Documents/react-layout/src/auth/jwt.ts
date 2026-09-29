// Ports AuthSessionService's private JWT-reading methods from the Angular app
// (src/app/core/services/auth/auth-session.service.ts) so both apps extract
// identical roles/email/expiry from the same token.
import type { AppRole } from './types';

export type JwtClaims = Record<string, unknown>;

const ROLE_PRIORITY: readonly AppRole[] = [
  'super_admin',
  'admin',
  'sales_head',
  'sales_person',
  'food_admin',
  'finance',
];

/** Same base64url decode Angular's readJwtClaims uses — no signature verification
 *  happens (or is needed) client-side; the backend verifies it on every API call. */
export function decodeJwt(token: string): JwtClaims | null {
  const [, payload] = token.split('.');

  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded = window.atob(padded);
    const json = decodeURIComponent(
      Array.from(decoded)
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
    const claims = JSON.parse(json) as unknown;

    return claims && typeof claims === 'object' && !Array.isArray(claims) ? (claims as JwtClaims) : null;
  } catch {
    return null;
  }
}

/** Ports authorization.config.ts's normalizeAppRoleName exactly. */
export function normalizeAppRoleName(value: string | null | undefined): AppRole | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const compact = normalized.replace(/[^a-z]/g, '');

  switch (compact) {
    case 'superadmin':
      return 'super_admin';
    case 'admin':
      return 'admin';
    case 'saleshead':
      return 'sales_head';
    case 'salesperson':
    case 'salesexecutive':
    case 'salesuser':
      return 'sales_person';
    case 'foodadmin':
      return 'food_admin';
    case 'finance':
      return 'finance';
    default:
      return compact.includes('finance') ? 'finance' : null;
  }
}

export function getTokenRoles(claims: JwtClaims | null): AppRole[] {
  if (!claims) {
    return [];
  }

  const roleClaim =
    claims['role'] ?? claims['roles'] ?? claims['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'];
  const rawRoles = Array.isArray(roleClaim)
    ? roleClaim.filter((role): role is string => typeof role === 'string')
    : typeof roleClaim === 'string'
      ? [roleClaim]
      : [];

  const unique = new Set<AppRole>();
  for (const raw of rawRoles) {
    const role = normalizeAppRoleName(raw);
    if (role) {
      unique.add(role);
    }
  }

  return ROLE_PRIORITY.filter((role) => unique.has(role));
}

export function getTokenExpiryTime(claims: JwtClaims | null): string | null {
  const exp = claims?.['exp'];
  const seconds = typeof exp === 'number' ? exp : typeof exp === 'string' ? Number(exp) : NaN;

  if (!Number.isFinite(seconds)) {
    return null;
  }

  return new Date(seconds * 1000).toISOString();
}

export function getTokenEmail(claims: JwtClaims | null): string {
  if (!claims) {
    return '';
  }

  const email = claims['email'] ?? claims['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'];
  return typeof email === 'string' ? email.trim() : '';
}

export function getTokenFullName(claims: JwtClaims | null): string {
  if (!claims) {
    return '';
  }

  const fullName =
    claims['full_name'] ??
    claims['fullName'] ??
    claims['name'] ??
    claims['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'];

  return typeof fullName === 'string' ? fullName.trim() : '';
}
