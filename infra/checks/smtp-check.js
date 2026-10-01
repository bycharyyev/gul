// Run inside the api container (`docker compose exec -T api node - < smtp-check.js`), so it uses
// exactly the MAIL_* values and network path production sends with -- not a copy of them.
// Verifies the handshake + SASL login of the transactional and (if separate) marketing
// transports; with SMTP_TEST_RECIPIENT set, also sends one transactional test message.
const nodemailer = require("nodemailer");
const env = process.env;

function build(suffix) {
  const pick = (name) => env[name + suffix] || env[name];
  const user = env["MAIL_USER" + suffix];
  const ca = pick("MAIL_TLS_CA_BASE64");
  const servername = pick("MAIL_TLS_SERVERNAME");
  return nodemailer.createTransport({
    host: pick("MAIL_HOST"),
    port: Number(pick("MAIL_PORT") || 587),
    secure: pick("MAIL_SECURE") === "true",
    auth: user ? { user, pass: env["MAIL_PASS" + suffix] } : undefined,
    tls: { ...(ca ? { ca: Buffer.from(ca, "base64") } : {}), ...(servername ? { servername } : {}) },
  });
}

(async () => {
  if (!env.MAIL_HOST) throw new Error("MAIL_HOST is not set in this container: mail is disabled here");
  const checks = [["transactional", ""]];
  if (env.MAIL_USER_MARKETING) checks.push(["marketing", "_MARKETING"]);
  for (const [name, suffix] of checks) {
    await build(suffix).verify();
    console.log(`${name}: handshake + login OK (${env["MAIL_HOST" + suffix] || env.MAIL_HOST})`);
  }
  const to = env.SMTP_TEST_RECIPIENT;
  if (to) {
    const info = await build("").sendMail({
      from: env.MAIL_FROM,
      replyTo: env.MAIL_REPLY_TO || undefined,
      to,
      subject: "Gulyaly SMTP check",
      text: `Test message from smtp-check, ${new Date().toISOString()}. Check Authentication-Results for spf/dkim/dmarc.`,
    });
    console.log(`sent: ${info.response}`);
  }
})().catch((err) => {
  console.error(`FAILED: ${err.code || ""} ${err.responseCode || ""} ${err.message}`);
  process.exit(1);
});
