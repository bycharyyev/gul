import type {
  AuthResponse,
  ChangePasswordInput,
  EmailStatusDto,
  LocaleInput,
  LoginInput,
  RegisterInput,
  SessionDto,
  UpdateMeInput,
} from "@topup-hub/types";
import type { ApiRequest } from "../core/request.js";

export interface AuthTokenStore {
  setTokens(accessToken: string, refreshToken: string): void;
  clear(): void;
}

export class AuthResource {
  constructor(private readonly request: ApiRequest, private readonly tokens: AuthTokenStore) {}

  async register(input: RegisterInput) {
    const result = await this.request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(input), auth: false });
    this.tokens.setTokens(result.accessToken, result.refreshToken);
    return result;
  }

  async login(input: LoginInput) {
    const result = await this.request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(input), auth: false });
    this.tokens.setTokens(result.accessToken, result.refreshToken);
    return result;
  }

  logout() { this.tokens.clear(); }
  getMe() { return this.request<AuthResponse["user"]>("/auth/me"); }
  updateMe(input: UpdateMeInput) { return this.request<AuthResponse["user"]>("/auth/me", { method: "PATCH", body: JSON.stringify(input) }); }
  updateLocale(locale: LocaleInput) { return this.request<AuthResponse["user"]>("/auth/me/locale", { method: "PATCH", body: JSON.stringify({ locale }) }); }
  changePassword(input: ChangePasswordInput) { return this.request<void>("/auth/change-password", { method: "POST", body: JSON.stringify(input) }); }
  listSessions() { return this.request<SessionDto[]>("/auth/sessions"); }
  revokeSession(id: string) { return this.request<void>(`/auth/sessions/${id}`, { method: "DELETE" }); }
  logoutAllSessions() { return this.request<void>("/auth/logout-all", { method: "POST" }); }
  requestPasswordReset(email: string) { return this.request<{ sent: boolean; expiresInMinutes: number }>("/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }), auth: false }); }
  confirmPasswordReset(input: { email: string; code: string; newPassword: string }) { return this.request<{ reset: boolean }>("/auth/password-reset/confirm", { method: "POST", body: JSON.stringify(input), auth: false }); }
  getEmailStatus() { return this.request<EmailStatusDto>("/account/email"); }
  requestEmailVerification(email: string) { return this.request<{ expiresInMinutes: number }>("/account/email/request", { method: "POST", body: JSON.stringify({ email }) }); }
  confirmEmailVerification(code: string) { return this.request<{ email: string; emailVerified: boolean }>("/account/email/confirm", { method: "POST", body: JSON.stringify({ code }) }); }
}
