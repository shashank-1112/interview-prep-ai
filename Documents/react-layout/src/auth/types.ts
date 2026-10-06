// Mirrors the Angular app's src/app/core/auth/auth.models.ts field-for-field —
// both apps decode the same backend JWT, so the shapes must stay identical.

export type AppRole = 'super_admin' | 'admin' | 'sales_head' | 'sales_person' | 'food_admin' | 'finance';

/** Matches the Angular app's authorization.config.ts's layoutPlannerRoles (its
 *  protectedRouteRoles entry for appRouteUrls.stallLayoutPlanner) and the .NET
 *  LayoutController's ViewRoles — SuperAdmin/Admin/SalesHead/SalesPerson may all open the
 *  planner; per-action restrictions (e.g. SalesPerson can't edit ground/hangar/stall geometry)
 *  are enforced by the backend, not here. Keep this in sync with authorization.config.ts —
 *  the two are meant to gate the exact same set of roles. */
export const PLANNER_ROLES: readonly AppRole[] = ['super_admin', 'admin', 'sales_head', 'sales_person'];

/** Matches the .NET LayoutController's ManageRoles — everyone in PLANNER_ROLES except
 *  'sales_person', who can view and book/reserve but not edit ground/hangar/stall geometry.
 *  The backend already enforces this (a disallowed call gets a 403) — gating the UI too means
 *  sales_person never sees a control that would just fail, rather than relying on the error. */
export const MANAGE_ROLES: readonly AppRole[] = ['super_admin', 'admin', 'sales_head'];

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
