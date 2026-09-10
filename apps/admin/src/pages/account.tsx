import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SessionDto } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api, getCurrentUser, storeCurrentUser } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AccountPage() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [me, setMe] = useState(getCurrentUser());
  const [sessions, setSessions] = useState<SessionDto[]>([]);

  const [editingProfile, setEditingProfile] = useState(false);
  const [fullName, setFullName] = useState(me?.fullName ?? "");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileError(null);
    try {
      const updated = await api.updateMe({ fullName });
      storeCurrentUser(updated);
      setMe(updated);
      setEditingProfile(false);
    } catch (err) {
      setProfileError(err instanceof ApiError ? translateError(t, err.message) : t("admin.account.profileSaveError"));
    } finally {
      setProfileBusy(false);
    }
  }

  function loadSessions() {
    api.listSessions().then(setSessions).catch(() => {});
  }

  useEffect(loadSessions, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setPwError(null);
    setPwSuccess(false);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setPwSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPwError(err instanceof ApiError ? translateError(t, err.message) : t("admin.account.passwordError"));
    } finally {
      setBusy(false);
    }
  }

  async function revokeSession(id: string) {
    await api.revokeSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  async function logoutAll() {
    if (!confirm(t("admin.account.logoutAllConfirm"))) return;
    await api.logoutAllSessions();
    api.logout();
    navigate("/login");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t("admin.account.title")}</h1>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-500">{t("admin.account.profileTitle")}</h2>
          {!editingProfile && (
            <Button variant="secondary" size="sm" onClick={() => setEditingProfile(true)}>
              {t("common.edit")}
            </Button>
          )}
        </div>

        {editingProfile ? (
          <form onSubmit={saveProfile} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.account.nameLabel")}</label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            {profileError && <p className="text-sm text-rose-600">{profileError}</p>}
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={profileBusy}>
                {profileBusy ? t("common.saving") : t("common.save")}
              </Button>
              <Button size="sm" type="button" variant="ghost" onClick={() => setEditingProfile(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <p className="font-medium">{me?.fullName ?? "—"}</p>
            <p className="text-sm text-slate-500">{me?.phone}</p>
            <p className="text-sm text-slate-500">{t("admin.account.roleLabel", { role: me?.role ?? "" })}</p>
          </>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("admin.account.passwordTitle")}</h2>
        <form onSubmit={changePassword} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              {t("admin.account.currentPasswordLabel")}
            </label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.account.newPasswordLabel")}</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          {pwError && <p className="text-sm text-rose-600">{pwError}</p>}
          {pwSuccess && <p className="text-sm text-emerald-600">{t("admin.account.passwordUpdated")}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? t("common.saving") : t("admin.account.changePasswordButton")}
          </Button>
        </form>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-500">{t("admin.account.sessionsTitle")}</h2>
          <Button variant="danger" size="sm" onClick={logoutAll}>
            {t("admin.account.logoutAllButton")}
          </Button>
        </div>
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                {t("admin.account.sessionLine", {
                  created: new Date(s.createdAt).toLocaleString(LOCALE_BCP47[locale]),
                  expires: new Date(s.expiresAt).toLocaleDateString(LOCALE_BCP47[locale]),
                })}
              </span>
              <Button variant="secondary" size="sm" onClick={() => revokeSession(s.id)}>
                {t("admin.account.revokeButton")}
              </Button>
            </div>
          ))}
          {sessions.length === 0 && <p className="text-sm text-slate-400">{t("admin.account.noSessions")}</p>}
        </div>
      </Card>
    </div>
  );
}
