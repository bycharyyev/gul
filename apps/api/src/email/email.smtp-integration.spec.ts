import * as nodemailer from "nodemailer";

/**
 * Talks to the real SMTP server. Skipped unless `SMTP_INTEGRATION_TEST=true`, so the ordinary
 * suite stays offline, deterministic and safe to run anywhere -- this one needs real credentials
 * and actually delivers a message.
 *
 * Run it before or after a change to the sending path (credentials, host, port, TLS), where the
 * unit tests can only prove the logic and not that the provider still accepts us:
 *
 *   SMTP_INTEGRATION_TEST=true \
 *   MAIL_HOST=mail.hosting.reg.ru MAIL_PORT=465 MAIL_SECURE=true \
 *   MAIL_USER=noreply@gulyaly.pro MAIL_PASS=... \
 *   SMTP_TEST_RECIPIENT=someone@gmail.com \
 *   npx jest email.smtp-integration
 *
 * Prefer a recipient you can actually open: the point of the send is to read the received
 * message's Authentication-Results header and confirm spf/dkim/dmarc all pass, which nothing in
 * this process can observe for you.
 */
const ENABLED = process.env.SMTP_INTEGRATION_TEST === "true";

// describe.skip rather than an early return: a skipped block is reported as skipped, so a run
// that silently did nothing cannot be mistaken for a run that passed.
const describeIfEnabled = ENABLED ? describe : describe.skip;

describeIfEnabled("SMTP integration (real server)", () => {
  function transporter() {
    const host = process.env.MAIL_HOST;
    if (!host) throw new Error("MAIL_HOST is required for the SMTP integration test");
    return nodemailer.createTransport({
      host,
      port: Number(process.env.MAIL_PORT ?? 465),
      secure: process.env.MAIL_SECURE !== "false",
      auth: process.env.MAIL_USER
        ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
        : undefined,
    });
  }

  // Generous: a real TLS handshake plus AUTH against a remote host is nothing like a mocked call.
  jest.setTimeout(30_000);

  it("completes a TLS handshake and authenticates", async () => {
    await expect(transporter().verify()).resolves.toBe(true);
  });

  it("rejects a wrong password rather than silently accepting it", async () => {
    const bad = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT ?? 465),
      secure: process.env.MAIL_SECURE !== "false",
      auth: { user: process.env.MAIL_USER as string, pass: "definitely-not-the-password" },
    });
    // Guards against a server (or a misconfiguration) that accepts unauthenticated submission --
    // which would mean our credentials were never actually protecting anything.
    await expect(bad.verify()).rejects.toBeDefined();
  });

  const recipient = process.env.SMTP_TEST_RECIPIENT;
  const itIfRecipient = recipient ? it : it.skip;

  itIfRecipient("delivers a message the provider accepts", async () => {
    const info = await transporter().sendMail({
      from: process.env.MAIL_FROM ?? `Gulyaly <${process.env.MAIL_USER}>`,
      to: recipient as string,
      replyTo: process.env.MAIL_REPLY_TO,
      subject: `Gulyaly SMTP integration test ${new Date().toISOString()}`,
      text: [
        "Integration test from the Gulyaly API test suite.",
        "",
        "Open the received message and check its Authentication-Results header:",
        "spf=pass, dkim=pass and dmarc=pass are what this send is really verifying.",
      ].join("\n"),
    });

    // `accepted` is the provider's own answer about the recipient; a 250 with an empty accepted
    // list would mean the message went nowhere.
    expect(info.accepted).toContain(recipient);
    expect(info.messageId).toBeTruthy();
  });
});
