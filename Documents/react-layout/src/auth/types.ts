// Mirrors the Angular app's src/app/core/auth/auth.models.ts field-for-field —
// both apps decode the same backend JWT, so the shapes must stay identical.

export type AppRole = 'super_admin' | 'admin' | 'sales_head' | 'sales_person' | 'food_admin' | 'finance';

/** Only 'super_admin' may open the layout planner (see authorization.config.ts's
 *  protectedRouteRoles entry for appRouteUrls.stallLayoutPlanner). Keep this in sync
 *  with that entry — the two are meant to gate the exact same set of roles. */
export const PLANNER_ROLES: readonly AppRole[] = ['super_admin'];

/** Shape persisted under the shared storage key — matches Angular's StoredAuthTokens. */
export interface StoredAuthTokens {
  accessToken: string;
  refreshToken: string;
  isRecovery?: boolean;
  imageUrl?: string;
}

/** The session this app actually works with, derived by decoding accessToken's claims. */
export interface AuthSession {
  email: string;
  role: AppRole;
  roles: AppRole[];
  fullName?: string;
  accessToken: string;
  refreshToken: string;
  /** ISO timestamp, decoded from the token's `exp` claim. */
  tokenExpiryTime: string;
}

export interface RefreshTokenRequest {
  token: string;
  refreshToken: string;
}

/** Matches the Angular app's LoginResponse — also what POST /refresh-token returns. */
export interface LoginResponse {
  token: string;
  refreshToken: string;
  tokenExpiryTime: string;
  email: string;
  fullName: string;
  imageUrl?: string;
  roles: string[];
  isRecovery?: boolean;
  IsRecovery?: boolean;
}
