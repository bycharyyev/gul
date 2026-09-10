"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderDto, DocumentDto, EmailStatusDto, EmailPreferenceDto, MyReferralInfoDto } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import {
  Check,
  Copy,
  DownloadSimple,
  EnvelopeSimple,
  File,
  FileDoc,
  FileImage,
  FilePdf,
  PencilSimple,
  TelegramLogo,
  Trash,
  UserCircle,
  Users,
  WhatsappLogo,
} from "@phosphor-icons/react/dist/ssr";
import { useTranslation, translateError, LOCALE_BCP47 } from "@topup-hub/i18n";
import { api, isAuthenticated, API_ORIGIN } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function formatSize(bytes: number, t: (key: string) => string) {
  if (bytes < 1024) return `${bytes} ${t("common.bytesUnit")}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ${t("common.kbUnit")}`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${t("common.mbUnit")}`;
}

function DocIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === "application/pdf") return <FilePdf size={22} aria-hidden="true" />;
  if (mimeType.startsWith("image/")) return <FileImage size={22} aria-hidden="true" />;
  if (mimeType.includes("word")) return <FileDoc size={22} aria-hidden="true" />;
  return <File size={22} aria-hidden="true" />;
}

type Profile = {
  id: string;
  phone: string;
  fullName: string | null;
  username: string;
  role: string;
  avatarUrl: string | null;
};

function ProfileSection({
  profile,
  onUpdated,
}: {
  profile: Profile;
  onUpdated: (p: Profile) => void;
}) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState(profile.fullName ?? "");
  const [phone, setPhone] = useState(profile.phone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);


  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const updated = await api.updateMe({ fullName, phone });
      onUpdated({ ...profile, fullName: updated.fullName, phone: updated.phone });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("web.account.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const { avatarUrl } = await api.uploadAvatar(file);
      onUpdated({ ...profile, avatarUrl });
    } catch (err) {
      setAvatarError(err instanceof ApiError ? translateError(t, err.message) : t("web.account.avatarError"));
    } finally {
      setAvatarUploading(false);
    }
  }

  async function removeAvatar() {
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      await api.deleteAvatar();
      onUpdated({ ...profile, avatarUrl: null });
    } catch (err) {
      setAvatarError(err instanceof ApiError ? translateError(t, err.message) : t("web.account.avatarRemoveError"));
    } finally {
      setAvatarUploading(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-xl font-bold">{t("web.account.profileTitle")}</h2>

      <div className="mb-6 flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, arbitrary origin/size, not worth next/image here
            <img src={`${API_ORIGIN}${profile.avatarUrl}`} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserCircle size={64} className="text-slate-300 dark:text-slate-600" aria-hidden="true" />
          )}
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            aria-label={t("web.account.changePhoto")}
            className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition hover:bg-black/40 hover:opacity-100 disabled:opacity-0"
          >
            <PencilSimple size={20} aria-hidden="true" />
          </button>
        </div>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleAvatarChange}
        />
        <div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => avatarInputRef.current?.click()} disabled={avatarUploading}>
              {avatarUploading ? t("web.account.uploading") : t("web.account.changePhoto")}
            </Button>
            {profile.avatarUrl && (
              <Button type="button" variant="ghost" size="sm" onClick={removeAvatar} disabled={avatarUploading}>
                {t("web.account.removePhoto")}
              </Button>
            )}
          </div>
          {avatarError && <p className="mt-1 text-xs text-rose-600">{avatarError}</p>}
        </div>
      </div>

      <form onSubmit={saveProfile} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">{t("web.account.name")}</label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{t("web.account.phone")}</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {success && <p className="text-sm text-emerald-600">{t("web.account.saved")}</p>}
        <Button type="submit" disabled={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </form>
    </Card>
  );
}

/**
 * Email address + verification. Two states in one card: enter an address and request a code, or
 * enter the code that was just mailed. An address is only stored on the account once its code
 * comes back, so a typo never becomes a send target.
 */
function EmailSection() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<EmailStatusDto | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [expiresIn, setExpiresIn] = useState(10);
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api
      .getEmailStatus()
      .then((s) => {
        setStatus(s);
        setEmail(s.pendingEmail ?? s.email ?? "");
        // A code is still outstanding from an earlier visit -- resume at the code step rather
        // than making the user request another one.
        if (s.pendingEmail) setAwaitingCode(true);
      })
      .catch(() => setStatus(null));
  }, []);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      const { expiresInMinutes } = await api.requestEmailVerification(email.trim());
      setExpiresIn(expiresInMinutes);
      setAwaitingCode(true);
      setCode("");
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("web.account.emailRequestError"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.confirmEmailVerification(code);
      setStatus((prev) =>
        prev
          ? { ...prev, email: result.email, emailVerified: true, pendingEmail: null, pendingExpiresAt: null }
          : prev,
      );
      setAwaitingCode(false);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("web.account.emailConfirmError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-lg font-semibold">{t("web.account.emailTitle")}</h2>
      <p className="mb-4 text-xs text-slate-400">{t("web.account.emailHint")}</p>

      {status && (
        <p className="mb-4 text-sm">
          {status.email ? (
            <>
              <span className="font-medium">{status.email}</span>{" "}
              <span className={status.emailVerified ? "text-emerald-600" : "text-amber-600"}>
                · {status.emailVerified ? t("web.account.emailVerified") : t("web.account.emailUnverified")}
              </span>
            </>
          ) : (
            <span className="text-slate-400">{t("web.account.emailNotSet")}</span>
          )}
        </p>
      )}

      {awaitingCode ? (
        <form onSubmit={confirmCode} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("web.account.emailCodeLabel")}</label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
            />
            <p className="mt-1 text-xs text-slate-400">
              {t("web.account.emailCodeHint")
                .replace("{email}", email)
                .replace("{minutes}", String(expiresIn))}
            </p>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || code.length !== 6}>
              {busy ? t("common.saving") : t("web.account.emailConfirm")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAwaitingCode(false)} disabled={busy}>
              {t("web.account.emailCancel")}
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={requestCode} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("web.account.emailLabel")}</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {success && <p className="text-sm text-emerald-600">{t("web.account.emailConfirmed")}</p>}
          <Button type="submit" disabled={busy || !email.trim()}>
            {busy ? t("common.saving") : t("web.account.emailSendCode")}
          </Button>
        </form>
      )}
    </Card>
  );
}

/**
 * Opt-in for the optional email categories. Transactional and security mail is deliberately not
 * listed -- it is not something the user can switch off while holding an account, and showing a
 * toggle would imply otherwise.
 */
function EmailPreferencesSection() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<EmailPreferenceDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getEmailPreferences().then(setPrefs).catch(() => setPrefs(null));
  }, []);

  async function toggle(key: keyof EmailPreferenceDto) {
    if (!prefs) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updateEmailPreferences({ [key]: !prefs[key] });
      setPrefs(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("web.account.prefError"));
    } finally {
      setBusy(false);
    }
  }

  if (!prefs) return null;

  const rows: { key: keyof EmailPreferenceDto; label: string }[] = [
    { key: "marketing", label: t("web.account.prefMarketing") },
    { key: "productUpdates", label: t("web.account.prefProductUpdates") },
    { key: "partnerOffers", label: t("web.account.prefPartnerOffers") },
  ];

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-lg font-semibold">{t("web.account.emailPrefsTitle")}</h2>
      <p className="mb-4 text-xs text-slate-400">{t("web.account.emailPrefsHint")}</p>

      <div className="space-y-3">
        {rows.map((row) => (
          <label key={row.key} className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={!!prefs[row.key]}
              disabled={busy}
              onChange={() => toggle(row.key)}
              className="h-4 w-4"
            />
            {row.label}
          </label>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      {saved && <p className="mt-3 text-sm text-emerald-600">{t("web.account.prefSaved")}</p>}
    </Card>
  );
}

/**
 * The user's own referral link, front and center with a working Copy button -- the actual point
 * of this screen. A bare username with no link and nothing to click was not an invite flow, it
 * was a fact about the account. Share shortcuts go to Telegram and WhatsApp, the two channels
 * this reward program's own invitations actually travel over.
 */
function InviteFriendsSection() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<MyReferralInfoDto | null>(null);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const linkFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .getMyReferralInfo()
      .then((data) => {
        setInfo(data);
        setLink(`${window.location.origin}/r/${data.username}`);
      })
      .catch(() => {});
  }, []);

  if (!info) return null;

  async function copyLink() {
    // The in-app browsers this link is actually opened in (Instagram, Telegram) and some
    // privacy-hardened browsers deny clipboard-write outright -- and navigator.clipboard does not
    // exist at all on a non-secure origin. That is not a rare edge case here.
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch {
      // fall through to the selection fallback below
    }

    // Selecting the text alone does NOT copy anything -- that was the bug: the button looked
    // dead because the fallback stopped one step short. execCommand("copy") is deprecated but is
    // the only thing that works where the async API is blocked, and it needs a live selection.
    const field = linkFieldRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(0, link.length);
    let copiedViaCommand = false;
    try {
      copiedViaCommand = document.execCommand("copy");
    } catch {
      copiedViaCommand = false;
    }
    if (copiedViaCommand) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    // Both paths refused. Leave the text selected so Ctrl/Cmd+C works, and say so rather than
    // showing a "Copied" tick that would be a lie.
    setCopyFailed(true);
    setTimeout(() => setCopyFailed(false), 4000);
  }

  const shareText = t("web.account.inviteShareText");
  const shareLinks = [
    {
      label: "Telegram",
      icon: TelegramLogo,
      href: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`,
    },
    {
      label: "WhatsApp",
      icon: WhatsappLogo,
      href: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${link}`)}`,
    },
    {
      label: "Email",
      icon: EnvelopeSimple,
      href: `mailto:?subject=${encodeURIComponent(t("web.account.inviteEmailSubject"))}&body=${encodeURIComponent(`${shareText} ${link}`)}`,
    },
  ];

  return (
    <Card className="p-6">
      <div className="mb-1 flex items-center gap-2">
        <Users size={19} className="text-brand-500" aria-hidden="true" />
        <h2 className="text-lg font-semibold">{t("web.account.inviteTitle")}</h2>
      </div>
      <p className="mb-4 text-xs text-slate-400">{t("web.account.inviteHint")}</p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          ref={linkFieldRef}
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t("web.account.inviteTitle")}
          className="flex-1 truncate rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
        />
        <Button type="button" onClick={copyLink} className="shrink-0">
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied ? t("web.account.copied") : t("web.account.copy")}
        </Button>
      </div>
      {copyFailed && (
        <p className="mt-2 text-xs text-amber-600" role="status">
          {t("web.account.copyManually")}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        {shareLinks.map(({ label, icon: Icon, href }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
          >
            <Icon size={19} aria-hidden="true" />
          </a>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-slate-200 p-3 text-center dark:border-white/10">
          <p className="font-mono text-lg font-bold">{info.stats.totalReferred}</p>
          <p className="text-[11px] text-slate-400">{t("web.account.inviteInvited")}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3 text-center dark:border-white/10">
          <p className="font-mono text-lg font-bold">{info.stats.rewarded}</p>
          <p className="text-[11px] text-slate-400">{t("web.account.inviteRewarded")}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3 text-center dark:border-white/10">
          <p className="font-mono text-lg font-bold">{info.stats.pending}</p>
          <p className="text-[11px] text-slate-400">{t("web.account.invitePending")}</p>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-400">{t("web.account.inviteRewardNote")}</p>
    </Card>
  );
}

function PasswordSection() {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError(t("web.account.passwordMismatch"));
      return;
    }

    setSaving(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : t("web.account.passwordError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-xl font-bold">{t("web.account.passwordTitle")}</h2>
      <form onSubmit={submit} className="max-w-sm space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">{t("web.account.currentPassword")}</label>
          <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{t("web.account.newPassword")}</label>
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{t("web.account.confirmPassword")}</label>
          <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {success && <p className="text-sm text-emerald-600">{t("web.account.passwordChanged")}</p>}
        <Button type="submit" disabled={saving}>
          {saving ? t("common.saving") : t("web.account.changePassword")}
        </Button>
      </form>
    </Card>
  );
}

export default function AccountPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    api
      .listMyOrders()
      .then(setOrders)
      .catch(() => {
        // onSessionExpired already redirects to /login on 401; other errors just leave the list empty.
      })
      .finally(() => setLoading(false));

    api
      .getMe()
      .then(setProfile)
      .catch(() => {})
      .finally(() => setProfileLoading(false));

    api
      .listMyDocuments()
      .then(setDocuments)
      .catch(() => {
        // same story as orders above.
      })
      .finally(() => setDocsLoading(false));
  }, [router]);

  function logout() {
    api.logout();
    router.push("/");
  }

  function triggerUpload() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-selecting the same filename re-fires onChange
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const created = await api.uploadDocument(file);
      setDocuments((prev) => [created, ...prev]);
    } catch (err) {
      setUploadError(err instanceof ApiError ? translateError(t, err.message) : t("web.account.uploadError"));
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(doc: DocumentDto) {
    try {
      const blob = await api.downloadDocument(doc.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.originalName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Best-effort — no inline status region dedicated to download failures per spec.
    }
  }

  async function handleDeleteDoc(doc: DocumentDto) {
    if (!confirm(t("web.account.deleteDocConfirm", { name: doc.originalName }))) return;

    setDeletingId(doc.id);
    try {
      await api.deleteDocument(doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch {
      // Leave the row in place so the user can retry.
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("web.account.title")}</h1>
        <Button variant="ghost" size="sm" onClick={logout}>
          {t("common.logout")}
        </Button>
      </div>

      {profileLoading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}
      {profile && <ProfileSection profile={profile} onUpdated={setProfile} />}

      <InviteFriendsSection />

      <EmailSection />

      <EmailPreferencesSection />

      <PasswordSection />

      <div>
        <h2 className="mb-4 text-xl font-bold">{t("web.account.ordersTitle")}</h2>

        {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}

        {!loading && orders.length === 0 && (
          <Card className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {t("web.account.noOrders")}
          </Card>
        )}

        <div className="space-y-3">
          {orders.map((order) => (
            <Card key={order.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-semibold">{order.recipientIdentifier}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {order.amountTmt} TMT · {order.amountCharged} {order.currency} ·{" "}
                  {new Date(order.createdAt).toLocaleString(LOCALE_BCP47[locale])}
                </p>
              </div>
              <StatusBadge status={order.status} />
            </Card>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{t("web.account.documentsTitle")}</h2>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={handleFileChange}
            />
            <Button type="button" size="sm" onClick={triggerUpload} disabled={uploading}>
              {uploading ? t("web.account.uploading") : t("web.account.uploadDocument")}
            </Button>
          </div>
        </div>

        <div aria-live="polite">{uploadError && <p className="mb-3 text-sm text-rose-600">{uploadError}</p>}</div>

        {docsLoading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}

        {!docsLoading && documents.length === 0 && (
          <Card className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {t("web.account.noDocuments")}
          </Card>
        )}

        <div className="space-y-3">
          {documents.map((doc) => (
            <Card key={doc.id} className="flex items-center justify-between p-4">
              <div className="flex min-w-0 items-center gap-3">
                <DocIcon mimeType={doc.mimeType} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" title={doc.originalName}>
                    {doc.originalName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatSize(doc.sizeBytes, t)} · {new Date(doc.createdAt).toLocaleString(LOCALE_BCP47[locale])}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("web.account.download", { name: doc.originalName })}
                  onClick={() => handleDownload(doc)}
                >
                  <DownloadSimple size={18} aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("web.account.deleteDoc", { name: doc.originalName })}
                  disabled={deletingId === doc.id}
                  onClick={() => handleDeleteDoc(doc)}
                >
                  <Trash size={18} aria-hidden="true" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
