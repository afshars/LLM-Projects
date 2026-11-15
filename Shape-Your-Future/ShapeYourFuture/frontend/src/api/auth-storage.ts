/**
 * Small abstraction over where the bearer token lives, so nothing else
 * in the app touches localStorage directly (Phase 4 requirement).
 * MVP-appropriate: no refresh tokens, just a single persisted string.
 */
const TOKEN_KEY = "maketime_access_token";

export const authStorage = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  },
  isAuthenticated(): boolean {
    return !!localStorage.getItem(TOKEN_KEY);
  },
};
