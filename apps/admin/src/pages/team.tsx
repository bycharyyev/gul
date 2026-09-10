import { useEffect, useState } from "react";
import type { CreateStaffUserInput, StaffUserDto, UserRole } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api, getCurrentUser } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";

const ROLES: UserRole[] = ["SUPPORT", "MANAGER", "ADMIN"];

const emptyDraft: CreateStaffUserInput = { phone: "", password: "", fullName: "", role: "SUPPORT" };

export default function TeamPage() {
  const { t } = useTranslation();
  const me = getCurrentUser();
  const [staff, setStaff] = useState<StaffUserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<CreateStaffUserInput>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    api
      .listStaff()
      .then(setStaff)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function createStaff(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.createStaffUser(draft);
      setStaff((prev) => [...prev, created]);
      setDraft(emptyDraft);
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.team.createError"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlocked(user: StaffUserDto) {
    const updated = await api.updateStaffUser(user.id, { isBlocked: !user.isBlocked });
    setStaff((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
  }

  async function changeRole(user: StaffUserDto, role: UserRole) {
    const updated = await api.updateStaffUser(user.id, { role });
    setStaff((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
  }

  async function removeUser(user: StaffUserDto) {
    if (!confirm(t("admin.team.deleteConfirm", { phone: user.phone }))) return;
    try {
      await api.deleteStaffUser(user.id);
      setStaff((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      alert(err instanceof ApiError ? translateError(t, err.message) : t("admin.team.deleteError"));
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.team.title")}</h1>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? t("common.cancel") : t("admin.team.newStaff")}
        </Button>
      </div>

      {showCreate && (
        <Card className="p-5">
          <form onSubmit={createStaff} className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.team.phoneLabel")}</label>
              <Input
                value={draft.phone}
                onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                placeholder="+70000000001"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.team.nameLabel")}</label>
              <Input
                value={draft.fullName ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.team.passwordLabel")}</label>
              <Input
                type="password"
                value={draft.password}
                onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.team.roleLabel")}</label>
              <Select
                value={draft.role}
                onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as UserRole }))}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </div>
            {error && <p className="col-span-2 text-sm text-rose-600">{error}</p>}
            <Button className="col-span-2" type="submit" disabled={busy}>
              {busy ? t("admin.team.creating") : t("admin.team.createButton")}
            </Button>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("admin.team.phoneLabel")}</th>
              <th className="px-4 py-3">{t("admin.team.nameLabel")}</th>
              <th className="px-4 py-3">{t("admin.team.roleLabel")}</th>
              <th className="px-4 py-3">{t("admin.team.statusLabel")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {staff.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3 font-medium">{user.phone}</td>
                <td className="px-4 py-3">{user.fullName ?? "—"}</td>
                <td className="px-4 py-3">
                  {user.id === me?.id ? (
                    <StatusBadge status={user.role} />
                  ) : (
                    <Select
                      className="h-8 w-32 text-xs"
                      value={user.role}
                      onChange={(e) => changeRole(user, e.target.value as UserRole)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  )}
                </td>
                <td className="px-4 py-3">
                  {user.isBlocked ? (
                    <span className="text-xs font-medium text-rose-600">{t("admin.team.statusBlocked")}</span>
                  ) : (
                    <span className="text-xs font-medium text-emerald-600">{t("admin.team.statusActive")}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {user.id !== me?.id && (
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => toggleBlocked(user)}>
                        {user.isBlocked ? t("admin.team.unblock") : t("admin.team.block")}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => removeUser(user)}>
                        {t("common.delete")}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!loading && staff.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  {t("admin.team.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
