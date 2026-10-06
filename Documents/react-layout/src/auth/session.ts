import { decodeJwt, getTokenEmail, getTokenExpiryTime, getTokenFullName, getTokenRoles } from './jwt';
import { MANAGE_ROLES, PLANNER_ROLES } from './types';
import type { AuthSession, StoredAuthTokens } from './types';

/** Reconstructs an AuthSession purely by decoding accessToken's claims — same
 *  approach as AuthSessionService.readPersistedSessionFrom in the Angular app. */
export function toAuthSession(tokens: StoredAuthTokens): AuthSession | null {
  const claims = decodeJwt(tokens.accessToken);
  const roles = getTokenRoles(claims);
  const role = roles[0];
  const tokenExpiryTime = getTokenExpiryTime(claims);

  if (!role || !tokenExpiryTime) {
    return null;
  }

  return {
    email: getTokenEmail(claims),
    role,
    roles,
    fullName: getTokenFullName(claims) || undefined,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenExpiryTime,
  };
}

export function isExpired(session: Pick<AuthSession, 'tokenExpiryTime'>): boolean {
  return Date.parse(session.tokenExpiryTime) <= Date.now();
}

/** Same gate as the Angular route's layoutPlannerRoles — keep PLANNER_ROLES in sync. */
export function hasPlannerAccess(session: Pick<AuthSession, 'roles'>): boolean {
  return PLANNER_ROLES.some((role) => session.roles.includes(role));
}

/** True for everyone except sales_person — see MANAGE_ROLES' doc comment. */
export function canManageLayout(session: Pick<AuthSession, 'roles'>): boolean {
  return MANAGE_ROLES.some((role) => session.roles.includes(role));
}
