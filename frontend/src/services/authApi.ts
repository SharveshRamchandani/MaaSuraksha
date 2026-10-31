// ---------------------------------------------------------------------------
// Real backend auth client (Phase 6 Part 3).
//
// Talks to the actual MaaSuraksha Express/Postgres backend — distinct from
// the rest of this app's mock service layer (hospitalService.ts,
// adminService.ts, the various *MockData.ts files), which remains
// mock-only. Only identity (login + current-user) is wired to the real
// backend here; all other domain data (appointments, vaccinations, patient
// rosters, ...) stays exactly as-is, per this part's explicit scope.
// ---------------------------------------------------------------------------

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'https://maasuraksha-09wm.onrender.com/api';

// Shared with useMockAuth.ts (where the token is written on login) and every
// domain service's getToken() (motherService.ts, doctorService.ts,
// hospitalService.ts, adminService.ts, messageService.ts), so every consumer
// of the persisted JWT agrees on one storage key. Persisted in
// sessionStorage, not localStorage — sessionStorage is per-tab (each tab/
// window gets its own copy, even for the same origin) but still survives a
// same-tab refresh, which is exactly what lets four different roles stay
// signed in simultaneously across four tabs without one login overwriting
// another, while a page reload still doesn't log the tab out.
export const TOKEN_STORAGE_KEY = 'maasuraksha_auth_token';

export type RealUserRole = 'mother' | 'doctor' | 'hospital' | 'admin';

export interface RealAuthUser {
  id: string;
  email: string;
  name: string;
  role: RealUserRole;
  phone: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export class AuthApiError extends Error {}

// Thrown specifically when the backend could not be reached at all (fetch
// itself rejected), as opposed to a reachable backend responding with an
// error (bad credentials, validation, etc). Callers use this distinction to
// decide whether it's safe to fall back to mock auth.
export class AuthNetworkError extends AuthApiError {}

async function parseAuthResponse(res: Response): Promise<Record<string, unknown>> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // validateRegister/validateLogin etc. return { message: 'Validation
    // failed', errors: [...] } — surfacing the per-field errors (when
    // present) instead of the generic wrapper message is what makes a 400
    // actually actionable for the person filling out the form.
    const errors = Array.isArray(body.errors) ? body.errors.filter((e: unknown): e is string => typeof e === 'string') : [];
    const message =
      errors.length > 0
        ? errors.join(' ')
        : typeof body.message === 'string'
        ? body.message
        : `Request failed with status ${res.status}.`;
    throw new AuthApiError(message);
  }
  return body;
}

export async function loginWithBackend(email: string, password: string): Promise<{ user: RealAuthUser; token: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new AuthNetworkError('Unable to reach the MaaSuraksha server. Please make sure the backend is running.');
  }
  const body = await parseAuthResponse(res);
  return { user: body.user as RealAuthUser, token: body.token as string };
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  role: RealUserRole;
  phone?: string;
  // Only ever populated for roles whose profile has a required field
  // (currently just hospital's facilityName — see validateHospitalProfile).
  // mother/doctor/admin have no required registration-time profile fields.
  profile?: Record<string, unknown>;
}

// Deliberately does NOT persist a token or return a signed-in session, even
// though POST /auth/register does return one — registration only creates the
// account. Signing in is a separate, explicit step through the real login
// flow (loginWithBackend/loginWithCredentials), never automatic here.
export async function registerWithBackend(input: RegisterInput): Promise<{ user: RealAuthUser }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    throw new AuthNetworkError('Unable to reach the MaaSuraksha server. Please make sure the backend is running.');
  }
  const body = await parseAuthResponse(res);
  return { user: body.user as RealAuthUser };
}

export async function fetchCurrentUser(token: string): Promise<RealAuthUser> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new AuthNetworkError('Unable to reach the MaaSuraksha server.');
  }
  const body = await parseAuthResponse(res);
  return body.user as RealAuthUser;
}
