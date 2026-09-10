import { useEffect, useMemo, useState } from "react";
import type { EmailKindSpecDto, EmailTemplateDto, EmailTemplatePreviewDto } from "@topup-hub/types";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";

const LOCALES = ["ru", "en", "tkm"] as const;

/** Preview widths: a phone, and a typical desktop reading pane. */
const PREVIEW_WIDTHS = { mobile: 375, desktop: 640 } as const;
type PreviewMode = keyof typeof PREVIEW_WIDTHS;

type Draft = { subject: string; preheader: string; html: string; text: string };

export default function MailTemplatesPage() {
  const { t } = useTranslation();

  const [kinds, setKinds] = useState<EmailKindSpecDto[]>([]);
  const [templates, setTemplates] = useState<EmailTemplateDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<EmailTemplatePreviewDto | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [previewPart, setPreviewPart] = useState<"html" | "text">("html");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [filterKind, setFilterKind] = useState("");
  const [filterLocale, setFilterLocale] = useState("");

  const selected = useMemo(() => templates.find((x) => x.id === selectedId) ?? null, [templates, selectedId]);
  const spec = useMemo(
    () => kinds.find((k) => k.kind === selected?.kind) ?? null,
    [kinds, selected],
  );

  function reload() {
    api
      .listEmailTemplates({ kind: filterKind || undefined, locale: filterLocale || undefined })
      .then(setTemplates)
      .catch((err) => setError(err instanceof ApiError ? translateError(t, err.message) : String(err)));
  }

  useEffect(() => {
    api.listEmailKinds().then(setKinds).catch(() => {});
  }, []);

  useEffect(reload, [filterKind, filterLocale]);

  function select(template: EmailTemplateDto) {
    setSelectedId(template.id);
    setDraft({
      subject: template.subject,
      preheader: template.preheader ?? "",
      html: template.html,
      text: template.text,
    });
    setPreview(null);
    setError(null);
    setNotice(null);
  }

  async function loadPreview() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await api.previewEmailTemplate(selected.id));
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : String(err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Saving never edits the selected row -- the API stores a new DRAFT version. That is the point
   * of versioning: whatever has already been mailed stays byte-identical and referenceable.
   */
  async function saveAsNewVersion() {
    if (!selected || !draft) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await api.saveEmailTemplate({
        kind: selected.kind,
        locale: selected.locale,
        subject: draft.subject,
        preheader: draft.preheader || undefined,
        html: draft.html,
        text: draft.text,
      });
      setNotice(t("admin.mailTemplates.savedAsVersion").replace("{version}", String(created.version)));
      reload();
      setSelectedId(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.activateEmailTemplate(selected.id);
      setNotice(t("admin.mailTemplates.activated"));
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.archiveEmailTemplate(selected.id);
      setNotice(t("admin.mailTemplates.archived"));
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? translateError(t, err.message) : String(err));
    } finally {
      setBusy(false);
    }
  }

  const dirty =
    !!selected &&
    !!draft &&
    (draft.subject !== selected.subject ||
      draft.preheader !== (selected.preheader ?? "") ||
      draft.html !== selected.html ||
      draft.text !== selected.text);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.mailTemplates.title")}</h1>
        <p className="mt-1 text-sm text-slate-400">{t("admin.mailTemplates.subtitle")}</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <Select value={filterKind} onChange={(e) => setFilterKind(e.target.value)} className="max-w-xs">
            <option value="">{t("admin.mailTemplates.allKinds")}</option>
            {kinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.kind}
              </option>
            ))}
          </Select>
          <Select value={filterLocale} onChange={(e) => setFilterLocale(e.target.value)} className="max-w-[160px]">
            <option value="">{t("admin.mailTemplates.allLocales")}</option>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="max-h-[70vh] overflow-y-auto p-2">
          {templates.length === 0 && (
            <p className="p-4 text-sm text-slate-400">{t("admin.mailTemplates.empty")}</p>
          )}
          <ul className="space-y-1">
            {templates.map((tpl) => (
              <li key={tpl.id}>
                <button
                  type="button"
                  onClick={() => select(tpl)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    tpl.id === selectedId ? "bg-brand-500/10 font-medium" : "hover:bg-slate-500/10"
                  }`}
                >
                  <span className="block truncate">{tpl.kind}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                    <span>{tpl.locale}</span>
                    <span>v{tpl.version}</span>
                    <StatusBadge status={tpl.status} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {selected && draft ? (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold">
                    {selected.kind} · {selected.locale} · v{selected.version}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {t("admin.mailTemplates.versionHint")}
                  </p>
                </div>
                <StatusBadge status={selected.status} />
              </div>

              {spec && (
                <div className="mb-4 rounded-lg bg-slate-500/5 p-3">
                  <p className="mb-1 text-xs font-medium text-slate-400">
                    {t("admin.mailTemplates.availableVariables")}
                  </p>
                  <p className="font-mono text-xs text-slate-500">
                    {spec.variables.length > 0
                      ? spec.variables.map((v) => `{{${v}}}`).join("  ")
                      : t("admin.mailTemplates.noVariables")}
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("admin.mailTemplates.subject")}</label>
                  <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("admin.mailTemplates.preheader")}</label>
                  <Input
                    value={draft.preheader}
                    onChange={(e) => setDraft({ ...draft, preheader: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("admin.mailTemplates.html")}</label>
                  <textarea
                    value={draft.html}
                    onChange={(e) => setDraft({ ...draft, html: e.target.value })}
                    rows={14}
                    spellCheck={false}
                    className="w-full rounded-lg border border-slate-500/20 bg-transparent p-3 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("admin.mailTemplates.text")}</label>
                  <textarea
                    value={draft.text}
                    onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                    rows={8}
                    spellCheck={false}
                    className="w-full rounded-lg border border-slate-500/20 bg-transparent p-3 font-mono text-xs"
                  />
                  <p className="mt-1 text-xs text-slate-400">{t("admin.mailTemplates.textHint")}</p>
                </div>
              </div>

              {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
              {notice && <p className="mt-3 text-sm text-emerald-600">{notice}</p>}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={saveAsNewVersion} disabled={busy || !dirty}>
                  {t("admin.mailTemplates.saveAsNewVersion")}
                </Button>
                <Button variant="secondary" onClick={loadPreview} disabled={busy}>
                  {t("admin.mailTemplates.preview")}
                </Button>
                {selected.status !== "ACTIVE" && (
                  <Button variant="secondary" onClick={activate} disabled={busy}>
                    {t("admin.mailTemplates.activate")}
                  </Button>
                )}
                {selected.status !== "ACTIVE" && (
                  <Button variant="ghost" onClick={archive} disabled={busy}>
                    {t("admin.mailTemplates.archive")}
                  </Button>
                )}
              </div>
              {dirty && <p className="mt-2 text-xs text-amber-600">{t("admin.mailTemplates.unsaved")}</p>}
            </Card>

            {preview && (
              <Card className="p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{t("admin.mailTemplates.preview")}</h3>
                  <div className="flex gap-2">
                    {(["desktop", "mobile"] as PreviewMode[]).map((mode) => (
                      <Button
                        key={mode}
                        size="sm"
                        variant={previewMode === mode ? "primary" : "ghost"}
                        onClick={() => setPreviewMode(mode)}
                      >
                        {t(`admin.mailTemplates.${mode}`)}
                      </Button>
                    ))}
                    {(["html", "text"] as const).map((part) => (
                      <Button
                        key={part}
                        size="sm"
                        variant={previewPart === part ? "primary" : "ghost"}
                        onClick={() => setPreviewPart(part)}
                      >
                        {part.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                </div>

                <p className="mb-3 text-sm">
                  <span className="text-slate-400">{t("admin.mailTemplates.subject")}: </span>
                  {preview.subject}
                </p>

                {previewPart === "html" ? (
                  // Rendered in a sandboxed iframe with srcDoc: the markup is admin-authored but
                  // must not run scripts or reach the surrounding admin session, and an iframe is
                  // also the only way to see the email at a real device width.
                  <iframe
                    title="email preview"
                    sandbox=""
                    srcDoc={preview.html}
                    style={{ width: PREVIEW_WIDTHS[previewMode], height: 620 }}
                    className="max-w-full rounded-lg border border-slate-500/20 bg-white"
                  />
                ) : (
                  <pre className="max-w-full overflow-x-auto whitespace-pre-wrap rounded-lg border border-slate-500/20 p-3 font-mono text-xs">
                    {preview.text}
                  </pre>
                )}
              </Card>
            )}
          </div>
        ) : (
          <Card className="flex items-center justify-center p-10">
            <p className="text-sm text-slate-400">{t("admin.mailTemplates.selectPrompt")}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
