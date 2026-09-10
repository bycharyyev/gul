/**
 * The one shared shell every Gulyaly email renders inside, so all mail reads as one brand.
 *
 * Table-based on purpose: Outlook (Word rendering engine) drops `display:flex`, `gap`, and most
 * modern layout CSS, and the previous inline-HTML templates used flex for the header. Styles are
 * inline because Gmail strips `<style>` blocks in many contexts. No JavaScript, no web fonts, no
 * external CSS -- none of it survives a mail client, and requesting it looks like tracking.
 */

const BRAND = "#1f1052";
const ACCENT = "#6d4bff";
const TEXT = "#334155";
const MUTED = "#94a3b8";
const SURFACE = "#ffffff";
const CANVAS = "#f6f5fb";

/**
 * Absolute and public: a mail client fetches this from wherever the recipient opens the message,
 * so a relative path or an internal host would simply fail to load.
 */
const LOGO_URL = process.env.MAIL_LOGO_URL || "https://gulyaly.pro/brand/gulyaly-logo-96.png";

export interface LayoutOptions {
  title: string;
  /** Inbox preview line, shown by most clients after the subject. */
  preheader: string;
  bodyHtml: string;
  /** Rendered under the card, above the copyright -- used for the unsubscribe line. */
  footerHtml?: string;
  siteUrl?: string;
}

export function emailLayout(options: LayoutOptions): string {
  const site = options.siteUrl ?? "https://gulyaly.pro";
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${options.title}</title>
  </head>
  <body style="margin:0;padding:0;background:${CANVAS};">
    <!-- Preheader: shown in the inbox list, hidden in the opened message. -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">
      ${options.preheader}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:480px;">
            <tr>
              <td style="padding-bottom:20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <!-- PNG, not SVG: Gmail, Outlook and most clients refuse to render SVG in
                         mail. Remote images are also blocked by default in many clients, so the
                         wordmark beside it is real text rather than part of the image -- with
                         images off the header still reads "Gulyaly" instead of going blank. -->
                    <td style="width:32px;height:32px;">
                      <img src="${LOGO_URL}" width="32" height="32" alt=""
                           style="display:block;width:32px;height:32px;border:0;border-radius:50%;">
                    </td>
                    <td style="padding-left:8px;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:18px;color:${BRAND};">Gulyaly</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:${SURFACE};border-radius:16px;padding:28px;font-family:Arial,Helvetica,sans-serif;">
                <h1 style="margin:0 0 16px;font-size:18px;line-height:1.4;color:${BRAND};">${options.title}</h1>
                ${options.bodyHtml}
              </td>
            </tr>
            ${
              options.footerHtml
                ? `<tr><td style="padding-top:16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};text-align:center;">${options.footerHtml}</td></tr>`
                : ""
            }
            <tr>
              <td style="padding-top:16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};text-align:center;">
                <a href="${site}" style="color:${MUTED};text-decoration:underline;">${site.replace(/^https?:\/\//, "")}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** A paragraph of body copy, in the shared type scale. */
export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${TEXT};">${text}</p>`;
}

/**
 * The one-time-code block. Letter-spaced and oversized because the recipient has to read it off
 * the screen and retype it, often on a phone.
 */
export function codeBlock(code: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
    <tr>
      <td align="center" style="background:${CANVAS};border-radius:12px;padding:20px;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:bold;letter-spacing:6px;color:${BRAND};">${code}</td>
    </tr>
  </table>`;
}

/** A label/value line of order detail. */
export function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:#64748b;">${label}</td>
    <td style="padding:6px 0;font-size:13px;font-weight:bold;color:#0f172a;text-align:right;">${value}</td>
  </tr>`;
}

export function detailTable(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows}</table>`;
}

/** Callout used for the delivery note on a completed order. */
export function callout(label: string, body: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
    <tr>
      <td style="background:#f2f1ff;border-radius:10px;padding:14px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:bold;text-transform:uppercase;color:#4a22c9;">${label}</p>
        <p style="margin:0;font-size:14px;color:${BRAND};">${body}</p>
      </td>
    </tr>
  </table>`;
}
