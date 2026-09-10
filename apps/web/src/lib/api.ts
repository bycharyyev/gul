"use client";

import { ApiClient, type TokenStore } from "@topup-hub/api-client";

const ACCESS_KEY = "th_access_token";
const REFRESH_KEY = "th_refresh_token";

class BrowserTokenStore implements TokenStore {
  getAccessToken() {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACCESS_KEY);
  }
  getRefreshToken() {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(REFRESH_KEY);
  }
  setTokens(accessToken: string, refreshToken: string) {
    window.localStorage.setItem(ACCESS_KEY, accessToken);
    window.localStorage.setItem(REFRESH_KEY, refreshToken);
  }
  clear() {
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
  }
}

export const api = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api",
  tokenStore: new BrowserTokenStore(),
  onSessionExpired: () => {
    if (typeof window === "undefined") return;
    if (window.location.pathname === "/login") return;
    window.location.href = "/login";
  },
});

export function isAuthenticated() {
  return typeof window !== "undefined" && !!window.localStorage.getItem(ACCESS_KEY);
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
/** Origin the API is served from, without the trailing /api -- avatarUrl etc. come back
 *  from the backend as a path already prefixed with /api, meant to be resolved against this. */
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");
