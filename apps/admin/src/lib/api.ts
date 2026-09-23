import { ApiClient, type TokenStore } from "@topup-hub/api-client";
import type { AuthResponse } from "@topup-hub/types";

const ACCESS_KEY = "th_admin_access_token";
const REFRESH_KEY = "th_admin_refresh_token";
const USER_KEY = "th_admin_user";

class BrowserTokenStore implements TokenStore {
  getAccessToken() {
    return window.localStorage.getItem(ACCESS_KEY);
  }
  getRefreshToken() {
    return window.localStorage.getItem(REFRESH_KEY);
  }
  setTokens(accessToken: string, refreshToken: string) {
    window.localStorage.setItem(ACCESS_KEY, accessToken);
    window.localStorage.setItem(REFRESH_KEY, refreshToken);
  }
  clear() {
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    window.localStorage.removeItem(USER_KEY);
  }
}

export const api = new ApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api",
  tokenStore: new BrowserTokenStore(),
  onSessionExpired: () => {
    if (window.location.pathname === "/login") return;
    window.location.href = "/login";
  },
});

export function isAuthenticated() {
  return !!window.localStorage.getItem(ACCESS_KEY);
}

export const USER_UPDATED_EVENT = "th-admin-user-updated";

export function storeCurrentUser(user: AuthResponse["user"]) {
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(USER_UPDATED_EVENT));
}

export function getCurrentUser(): AuthResponse["user"] | null {
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
