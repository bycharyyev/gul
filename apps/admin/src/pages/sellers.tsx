import { useEffect, useState } from "react";
import type { CreateSellerInput, SellerAdminDto } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const emptyDraft: CreateSellerInput = {
  phone: "",
  password: "",
  fullName: "",
  handle: "",
  shopName: "",
  description: "",
};

export default function SellersPage() {
  const { t } = useTranslation();
  const [sellers, setSellers] = useState<SellerAdminDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<CreateSellerInput>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    api
      .listSellers()
      .then(setSellers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function createSeller(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.createSeller(draft);
      setSellers((prev) => [created, ...prev]);
      setDraft(emptyDraft);
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("admin.sellers.createError"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(seller: SellerAdminDto) {
    const updated = await api.updateSellerAdmin(seller.id, { isEnabled: !seller.isEnabled });
    setSellers((prev) => prev.map((s) => (s.id === seller.id ? { ...s, ...updated } : s)));
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.sellers.title")}</h1>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? t("common.cancel") : t("admin.sellers.newSeller")}
        </Button>
      </div>

      {showCreate && (
        <Card className="p-5">
          <form onSubmit={createSeller} className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.sellers.phoneLabel")}</label>
              <Input
                value={draft.phone}
                onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                placeholder={t("admin.sellers.phonePlaceholder")}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.sellers.passwordLabel")}</label>
              <Input
                type="password"
                value={draft.password}
                onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.sellers.contactNameLabel")}</label>
              <Input
                value={draft.fullName ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                {t("admin.sellers.usernameLabel")}
              </label>
              <Input
                value={draft.handle}
                onChange={(e) => setDraft((d) => ({ ...d, handle: e.target.value.replace(/^@/, "") }))}
                placeholder={t("admin.sellers.usernamePlaceholder")}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.sellers.shopNameLabel")}</label>
              <Input
                value={draft.shopName}
                onChange={(e) => setDraft((d) => ({ ...d, shopName: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">{t("admin.sellers.descriptionLabel")}</label>
              <Input
                value={draft.description ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
            {error && <p className="col-span-2 text-sm text-rose-600">{error}</p>}
            <Button className="col-span-2" type="submit" disabled={busy}>
              {busy ? t("admin.sellers.creating") : t("admin.sellers.createSubmit")}
            </Button>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("admin.sellers.colShop")}</th>
              <th className="px-4 py-3">{t("admin.sellers.colUsername")}</th>
              <th className="px-4 py-3">{t("admin.sellers.colPhone")}</th>
              <th className="px-4 py-3">{t("admin.sellers.colBalance")}</th>
              <th className="px-4 py-3">{t("admin.sellers.colStatus")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sellers.map((seller) => (
              <tr key={seller.id}>
                <td className="px-4 py-3 font-medium">
                  {seller.shopName}
                  {/* What the shop has built, on the row rather than behind a click: the point of
                      this table is to see the shape of every shop at once. */}
                  {(seller.storefronts?.length ?? 0) > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {seller.storefronts!.map((section) => (
                        <span
                          key={section.id}
                          title={t("admin.sellers.sectionProducts", {
                            count: String(section._count.products),
                          })}
                          className={
                            section.isEnabled
                              ? "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300"
                              : "rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-400 dark:border-white/15"
                          }
                        >
                          {section.name} · {section._count.products}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-brand-600">@{seller.handle}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{seller.user.phone}</td>
                <td className="px-4 py-3">{seller.balanceTmt} TMT</td>
                <td className="px-4 py-3">
                  {seller.isEnabled ? (
                    <span className="text-xs font-medium text-emerald-600">{t("admin.sellers.statusActive")}</span>
                  ) : (
                    <span className="text-xs font-medium text-rose-600">{t("admin.sellers.statusDisabled")}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="secondary" size="sm" onClick={() => toggleEnabled(seller)}>
                    {seller.isEnabled ? t("admin.sellers.disable") : t("admin.sellers.enable")}
                  </Button>
                </td>
              </tr>
            ))}
            {!loading && sellers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {t("admin.sellers.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
