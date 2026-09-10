import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api, storeCurrentUser } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.login({ phone, password });
      if (!["ADMIN", "MANAGER", "SUPPORT"].includes(res.user.role)) {
        api.logout();
        throw new Error(t("admin.login.noAccess"));
      }
      storeCurrentUser(res.user);
      navigate("/");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? translateError(t, err.message)
          : err instanceof Error
            ? err.message
            : t("admin.login.genericError"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-hero-gradient flex min-h-screen items-center justify-center">
      <form onSubmit={onSubmit} className="w-full max-w-sm">
        <Card className="p-8">
          <div className="mb-6 flex items-center gap-2 text-lg font-extrabold">
            <span className="bg-gradient-brand flex h-9 w-9 items-center justify-center rounded-lg text-sm text-white">
              Gu
            </span>
            <span className="text-gradient">Gulyaly Admin</span>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("admin.login.username")}</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("admin.login.username")} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("admin.login.password")}</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? t("admin.login.submitting") : t("admin.login.submit")}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
