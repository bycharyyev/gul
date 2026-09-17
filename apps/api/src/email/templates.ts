/** Shared with email-layout.ts -- see the note there on why this is a PNG on a public URL. */
const LOGO_URL = process.env.MAIL_LOGO_URL || "https://gulyaly.pro/brand/gulyaly-logo-96.png";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(title: string, bodyHtml: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f5fb;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
        <img src="${LOGO_URL}" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border:0;border-radius:50%;">
        <span style="font-weight:800;font-size:18px;color:#1f1052;">Gulyaly</span>
      </div>
      <div style="background:#ffffff;border-radius:16px;padding:28px;box-shadow:0 20px 45px -20px rgba(31,16,82,0.25);">
        <h1 style="margin:0 0 16px;font-size:18px;color:#1f1052;">${title}</h1>
        ${bodyHtml}
      </div>
      <p style="margin-top:20px;font-size:12px;color:#94a3b8;text-align:center;">
        © ${new Date().getFullYear()} Gulyaly. Это письмо отправлено автоматически.
      </p>
    </div>
  </body>
</html>`;
}

export function testEmailTemplate() {
  const body = `<p style="margin:0;color:#334155;font-size:14px;line-height:1.6;">Это тестовое письмо из админ-панели Gulyaly. Если вы его получили — настройки почты работают корректно.</p>`;
  return { subject: "Тестовое письмо Gulyaly", html: layout("Проверка настроек почты", body) };
}

export function marketingTemplate(subject: string, bodyText: string, unsubscribeUrl: string) {
  const body = `<div style="color:#334155;font-size:14px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(bodyText)}</div>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">
      Не хотите получать такие письма? <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6d4bff;">Отписаться</a>
    </p>`;
  return { subject, html: layout(escapeHtml(subject), body) };
}
