import type { EmailKind } from "@prisma/client";
import { callout, codeBlock, detailRow, detailTable, emailLayout, paragraph } from "./email-layout";
import type { EmailLocale } from "./email-kinds";

/**
 * Seed content for the templates the application can actually trigger today. These are written
 * into `EmailTemplate` as version 1 / ACTIVE on first boot (see EmailTemplateService.seed) and
 * are never written again -- once a row exists, the admin panel owns it, so an edit made in
 * production is not silently reverted by the next deploy.
 *
 * Kinds in the EmailKind taxonomy with no entry here (seller, system, the extra order states)
 * have no trigger in the product yet; they get templates when the flow that sends them is built.
 */

export interface DefaultTemplate {
  kind: EmailKind;
  locale: EmailLocale;
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

// ---------------------------------------------------------------------------
// AUTH_EMAIL_VERIFICATION
// ---------------------------------------------------------------------------

function verificationTemplate(
  locale: EmailLocale,
  copy: {
    subject: string;
    preheader: string;
    title: string;
    greeting: string;
    intro: string;
    expiry: string;
    ignore: string;
  },
): DefaultTemplate {
  const html = emailLayout({
    title: copy.title,
    preheader: copy.preheader,
    bodyHtml: [
      paragraph(copy.greeting),
      paragraph(copy.intro),
      codeBlock("{{otp.code}}"),
      paragraph(copy.expiry),
      paragraph(copy.ignore),
    ].join("\n"),
  });

  const text = [
    copy.greeting,
    "",
    copy.intro,
    "",
    "    {{otp.code}}",
    "",
    copy.expiry,
    "",
    copy.ignore,
    "",
    "Gulyaly",
    "https://gulyaly.pro",
  ].join("\n");

  return { kind: "AUTH_EMAIL_VERIFICATION", locale, subject: copy.subject, preheader: copy.preheader, html, text };
}

const VERIFICATION: DefaultTemplate[] = [
  verificationTemplate("ru", {
    subject: "Код подтверждения Gulyaly",
    preheader: "Код действует {{otp.expiresIn}} минут.",
    title: "Подтверждение адреса почты",
    greeting: "Здравствуйте, {{user.firstName}}!",
    intro: "Ваш код подтверждения:",
    expiry: "Код действует {{otp.expiresIn}} минут.",
    ignore: "Если вы не запрашивали этот код, просто проигнорируйте это письмо.",
  }),
  verificationTemplate("en", {
    subject: "Your Gulyaly verification code",
    preheader: "The code is valid for {{otp.expiresIn}} minutes.",
    title: "Confirm your email address",
    greeting: "Hello, {{user.firstName}}!",
    intro: "Your verification code:",
    expiry: "The code is valid for {{otp.expiresIn}} minutes.",
    ignore: "If you did not request this code, you can safely ignore this email.",
  }),
  verificationTemplate("tkm", {
    subject: "Gulyaly tassyklama kody",
    preheader: "Kod {{otp.expiresIn}} minut hereket edýär.",
    title: "E-poçta salgyňyzy tassyklaň",
    greeting: "Salam, {{user.firstName}}!",
    intro: "Siziň tassyklama kodyňyz:",
    expiry: "Kod {{otp.expiresIn}} minut hereket edýär.",
    ignore: "Eger bu kody talap etmedik bolsaňyz, bu haty äsgermezlik ediň.",
  }),
];

// ---------------------------------------------------------------------------
// AUTH_PASSWORD_RESET — same shape as verification, different stakes: the copy has to make an
// unrequested reset attempt obvious, since that is what an account takeover looks like.
// ---------------------------------------------------------------------------

function passwordResetTemplate(
  locale: EmailLocale,
  copy: {
    subject: string;
    preheader: string;
    title: string;
    greeting: string;
    intro: string;
    expiry: string;
    ignore: string;
  },
): DefaultTemplate {
  const html = emailLayout({
    title: copy.title,
    preheader: copy.preheader,
    bodyHtml: [
      paragraph(copy.greeting),
      paragraph(copy.intro),
      codeBlock("{{otp.code}}"),
      paragraph(copy.expiry),
      paragraph(copy.ignore),
    ].join("\n"),
  });

  const text = [
    copy.greeting,
    "",
    copy.intro,
    "",
    "    {{otp.code}}",
    "",
    copy.expiry,
    "",
    copy.ignore,
    "",
    "Gulyaly",
    "https://gulyaly.pro",
  ].join("\n");

  return { kind: "AUTH_PASSWORD_RESET", locale, subject: copy.subject, preheader: copy.preheader, html, text };
}

const PASSWORD_RESET: DefaultTemplate[] = [
  passwordResetTemplate("ru", {
    subject: "Восстановление пароля Gulyaly",
    preheader: "Код действует {{otp.expiresIn}} минут.",
    title: "Восстановление пароля",
    greeting: "Здравствуйте, {{user.firstName}}!",
    intro: "Вы запросили смену пароля. Ваш код:",
    expiry: "Код действует {{otp.expiresIn}} минут.",
    ignore:
      "Если вы не запрашивали смену пароля, проигнорируйте это письмо — пароль останется прежним. Если такие письма приходят повторно, напишите в поддержку.",
  }),
  passwordResetTemplate("en", {
    subject: "Reset your Gulyaly password",
    preheader: "The code is valid for {{otp.expiresIn}} minutes.",
    title: "Password reset",
    greeting: "Hello, {{user.firstName}}!",
    intro: "You asked to change your password. Your code:",
    expiry: "The code is valid for {{otp.expiresIn}} minutes.",
    ignore:
      "If you did not request this, ignore this email — your password stays unchanged. If these keep arriving, contact support.",
  }),
  passwordResetTemplate("tkm", {
    subject: "Gulyaly parolyňyzy dikeltmek",
    preheader: "Kod {{otp.expiresIn}} minut hereket edýär.",
    title: "Paroly dikeltmek",
    greeting: "Salam, {{user.firstName}}!",
    intro: "Siz paroly üýtgetmegi soradyňyz. Kodyňyz:",
    expiry: "Kod {{otp.expiresIn}} minut hereket edýär.",
    ignore:
      "Eger muny siz soramadyk bolsaňyz, bu haty äsgermezlik ediň — parolyňyz üýtgemez. Şeýle hatlar gaýtalanýan bolsa, goldawa ýazyň.",
  }),
];

// ---------------------------------------------------------------------------
// ACCOUNT_PASSWORD_CHANGED — sent after the fact. Its only job is to reach someone whose account
// was taken over, so it leads with what happened and how to react, not with reassurance.
// ---------------------------------------------------------------------------

function passwordChangedTemplate(
  locale: EmailLocale,
  copy: { subject: string; preheader: string; title: string; greeting: string; intro: string; warn: string },
): DefaultTemplate {
  const html = emailLayout({
    title: copy.title,
    preheader: copy.preheader,
    bodyHtml: [paragraph(copy.greeting), paragraph(copy.intro), paragraph(copy.warn)].join("\n"),
  });
  const text = [copy.greeting, "", copy.intro, "", copy.warn, "", "Gulyaly", "https://gulyaly.pro"].join("\n");
  return { kind: "ACCOUNT_PASSWORD_CHANGED", locale, subject: copy.subject, preheader: copy.preheader, html, text };
}

const PASSWORD_CHANGED: DefaultTemplate[] = [
  passwordChangedTemplate("ru", {
    subject: "Пароль Gulyaly изменён",
    preheader: "Если это были не вы — действуйте сразу.",
    title: "Пароль изменён",
    greeting: "Здравствуйте, {{user.firstName}}!",
    intro: "Пароль вашего аккаунта был изменён {{event.at}}. Все активные сессии завершены.",
    warn: "Если это были не вы — немедленно восстановите пароль и напишите в поддержку: support@gulyaly.pro",
  }),
  passwordChangedTemplate("en", {
    subject: "Your Gulyaly password was changed",
    preheader: "If this wasn't you, act now.",
    title: "Password changed",
    greeting: "Hello, {{user.firstName}}!",
    intro: "Your account password was changed on {{event.at}}. All active sessions were signed out.",
    warn: "If this wasn't you, reset your password immediately and contact support: support@gulyaly.pro",
  }),
  passwordChangedTemplate("tkm", {
    subject: "Gulyaly parolyňyz üýtgedildi",
    preheader: "Eger bu siz bolmasaňyz, derrew hereket ediň.",
    title: "Parol üýtgedildi",
    greeting: "Salam, {{user.firstName}}!",
    intro: "Hasabyňyzyň paroly {{event.at}} üýtgedildi. Ähli işjeň sessiýalar ýapyldy.",
    warn: "Eger bu siz bolmasaňyz, derrew paroly dikeldiň we goldawa ýazyň: support@gulyaly.pro",
  }),
];

// ---------------------------------------------------------------------------
// Order mail
// ---------------------------------------------------------------------------

interface OrderCopy {
  subject: string;
  preheader: string;
  title: string;
  intro: string;
  labels: { id: string; service: string; recipient: string; amount: string; charged: string };
  note?: { label: string; body: string };
  reasonLabel?: string;
}

function orderTemplate(kind: EmailKind, locale: EmailLocale, copy: OrderCopy): DefaultTemplate {
  const rows = [
    detailRow(copy.labels.id, "{{order.id}}"),
    detailRow(copy.labels.service, "{{order.serviceName}}"),
    detailRow(copy.labels.recipient, "{{order.recipientIdentifier}}"),
    detailRow(copy.labels.amount, "{{order.amountTmt}} TMT"),
    detailRow(copy.labels.charged, "{{order.amountCharged}} {{order.currency}}"),
  ];
  // Both of these are nullable on the Order -- wrapped in a presence section so the row (and,
  // below, the whole callout) disappears rather than rendering an empty label.
  if (copy.reasonLabel) {
    rows.push(
      `{{#order.failureReason}}${detailRow(copy.reasonLabel, "{{order.failureReason}}")}{{/order.failureReason}}`,
    );
  }

  const html = emailLayout({
    title: copy.title,
    preheader: copy.preheader,
    bodyHtml: [
      paragraph(copy.intro),
      detailTable(rows.join("\n")),
      copy.note
        ? `{{#order.deliveryNote}}${callout(copy.note.label, copy.note.body)}{{/order.deliveryNote}}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const textLines = [
    copy.intro,
    "",
    `${copy.labels.id}: {{order.id}}`,
    `${copy.labels.service}: {{order.serviceName}}`,
    `${copy.labels.recipient}: {{order.recipientIdentifier}}`,
    `${copy.labels.amount}: {{order.amountTmt}} TMT`,
    `${copy.labels.charged}: {{order.amountCharged}} {{order.currency}}`,
  ];
  if (copy.reasonLabel) {
    textLines.push(`{{#order.failureReason}}${copy.reasonLabel}: {{order.failureReason}}{{/order.failureReason}}`);
  }
  if (copy.note) {
    textLines.push("", `{{#order.deliveryNote}}${copy.note.label}: ${copy.note.body}{{/order.deliveryNote}}`);
  }
  textLines.push("", "Gulyaly", "https://gulyaly.pro");

  return { kind, locale, subject: copy.subject, preheader: copy.preheader, html, text: textLines.join("\n") };
}

const RU_LABELS = {
  id: "Номер заказа",
  service: "Сервис",
  recipient: "Получатель",
  amount: "Сумма",
  charged: "К оплате",
};
const EN_LABELS = {
  id: "Order number",
  service: "Service",
  recipient: "Recipient",
  amount: "Amount",
  charged: "Charged",
};
const TKM_LABELS = {
  id: "Sargyt belgisi",
  service: "Hyzmat",
  recipient: "Alyjy",
  amount: "Möçberi",
  charged: "Töleg",
};

const ORDER_CREATED: DefaultTemplate[] = [
  orderTemplate("ORDER_CREATED", "ru", {
    subject: "Заказ {{order.id}} принят",
    preheader: "Мы приняли ваш заказ на пополнение.",
    title: "Заказ принят",
    intro: "Мы приняли ваш заказ на пополнение. Как только оплата будет подтверждена, зачисление произойдёт автоматически.",
    labels: RU_LABELS,
  }),
  orderTemplate("ORDER_CREATED", "en", {
    subject: "Order {{order.id}} received",
    preheader: "We have received your top-up order.",
    title: "Order received",
    intro: "We have received your top-up order. It will be credited automatically as soon as the payment is confirmed.",
    labels: EN_LABELS,
  }),
  orderTemplate("ORDER_CREATED", "tkm", {
    subject: "{{order.id}} sargydy kabul edildi",
    preheader: "Sargydyňyz kabul edildi.",
    title: "Sargyt kabul edildi",
    intro: "Doldurma sargydyňyz kabul edildi. Töleg tassyklanandan soň, serişde awtomatiki geçiriler.",
    labels: TKM_LABELS,
  }),
];

const ORDER_COMPLETED: DefaultTemplate[] = [
  orderTemplate("ORDER_COMPLETED", "ru", {
    subject: "Заказ {{order.id}} выполнен",
    preheader: "Ваш заказ выполнен, средства зачислены.",
    title: "Заказ выполнен",
    intro: "Ваш заказ выполнен, средства зачислены.",
    labels: RU_LABELS,
    note: { label: "Информация для вас", body: "{{order.deliveryNote}}" },
  }),
  orderTemplate("ORDER_COMPLETED", "en", {
    subject: "Order {{order.id}} completed",
    preheader: "Your order is complete and the funds have been credited.",
    title: "Order completed",
    intro: "Your order is complete and the funds have been credited.",
    labels: EN_LABELS,
    note: { label: "Information for you", body: "{{order.deliveryNote}}" },
  }),
  orderTemplate("ORDER_COMPLETED", "tkm", {
    subject: "{{order.id}} sargydy ýerine ýetirildi",
    preheader: "Sargydyňyz ýerine ýetirildi.",
    title: "Sargyt ýerine ýetirildi",
    intro: "Sargydyňyz ýerine ýetirildi, serişde geçirildi.",
    labels: TKM_LABELS,
    note: { label: "Siziň üçin maglumat", body: "{{order.deliveryNote}}" },
  }),
];

const ORDER_FAILED: DefaultTemplate[] = [
  orderTemplate("ORDER_FAILED", "ru", {
    subject: "Не удалось выполнить заказ {{order.id}}",
    preheader: "Заказ не выполнен. Средства будут возвращены.",
    title: "Заказ не выполнен",
    intro:
      "К сожалению, не удалось выполнить ваш заказ. Если оплата была списана, средства будут возвращены — либо напишите нам в чат поддержки.",
    labels: RU_LABELS,
    reasonLabel: "Причина",
  }),
  orderTemplate("ORDER_FAILED", "en", {
    subject: "Order {{order.id}} could not be completed",
    preheader: "The order failed. Any payment will be refunded.",
    title: "Order failed",
    intro:
      "Unfortunately we could not complete your order. If you were charged, the amount will be refunded — or write to us in the support chat.",
    labels: EN_LABELS,
    reasonLabel: "Reason",
  }),
  orderTemplate("ORDER_FAILED", "tkm", {
    subject: "{{order.id}} sargydy ýerine ýetirilmedi",
    preheader: "Sargyt ýerine ýetirilmedi. Serişde yzyna gaýtarylar.",
    title: "Sargyt ýerine ýetirilmedi",
    intro:
      "Gynansak-da, sargydyňyzy ýerine ýetirip bilmedik. Eger töleg alnan bolsa, serişde yzyna gaýtarylar — ýa-da goldaw çatyna ýazyň.",
    labels: TKM_LABELS,
    reasonLabel: "Sebäbi",
  }),
];

// ---------------------------------------------------------------------------
// Cargo. Two moments a customer actually cares about -- payment confirmed / shipment created,
// and delivered -- not one email per status hop. There's no in-app/push notification channel in
// this codebase yet, so email is the real channel for Cargo today, same as it is for Orders.
// ---------------------------------------------------------------------------

interface CargoCopy {
  subject: string;
  preheader: string;
  title: string;
  intro: string;
  labels: { tracking: string; route: string; recipient: string; total: string };
}

function cargoTemplate(kind: EmailKind, locale: EmailLocale, copy: CargoCopy): DefaultTemplate {
  const rows = [
    detailRow(copy.labels.tracking, "{{shipment.trackingNumber}}"),
    detailRow(copy.labels.route, "{{shipment.originCity}} → {{shipment.destinationCity}}"),
    detailRow(copy.labels.recipient, "{{shipment.recipientName}}"),
    detailRow(copy.labels.total, "{{shipment.totalPriceTmt}} TMT"),
  ];

  const html = emailLayout({
    title: copy.title,
    preheader: copy.preheader,
    bodyHtml: [paragraph(copy.intro), detailTable(rows.join("\n"))].join("\n"),
  });

  const text = [
    copy.intro,
    "",
    `${copy.labels.tracking}: {{shipment.trackingNumber}}`,
    `${copy.labels.route}: {{shipment.originCity}} -> {{shipment.destinationCity}}`,
    `${copy.labels.recipient}: {{shipment.recipientName}}`,
    `${copy.labels.total}: {{shipment.totalPriceTmt}} TMT`,
    "",
    "Gulyaly",
    "https://gulyaly.pro",
  ].join("\n");

  return { kind, locale, subject: copy.subject, preheader: copy.preheader, html, text };
}

const CARGO_LABELS_RU = { tracking: "Номер отправления", route: "Маршрут", recipient: "Получатель", total: "Стоимость" };
const CARGO_LABELS_EN = { tracking: "Tracking number", route: "Route", recipient: "Recipient", total: "Total" };
const CARGO_LABELS_TKM = { tracking: "Ugratma belgisi", route: "Ugur", recipient: "Alyjy", total: "Bahasy" };

const CARGO_SHIPMENT_CREATED: DefaultTemplate[] = [
  cargoTemplate("CARGO_SHIPMENT_CREATED", "ru", {
    subject: "Отправление {{shipment.trackingNumber}} оформлено",
    preheader: "Оплата получена, отправление создано.",
    title: "Отправление оформлено",
    intro: "Оплата получена. Отслеживайте отправление в личном кабинете.",
    labels: CARGO_LABELS_RU,
  }),
  cargoTemplate("CARGO_SHIPMENT_CREATED", "en", {
    subject: "Shipment {{shipment.trackingNumber}} created",
    preheader: "Payment received, shipment created.",
    title: "Shipment created",
    intro: "Payment received. Track your shipment from your account.",
    labels: CARGO_LABELS_EN,
  }),
  cargoTemplate("CARGO_SHIPMENT_CREATED", "tkm", {
    subject: "{{shipment.trackingNumber}} ugratmasy döredildi",
    preheader: "Töleg alyndy, ugratma döredildi.",
    title: "Ugratma döredildi",
    intro: "Töleg alyndy. Ugratmany hasabyňyzdan yzarlaň.",
    labels: CARGO_LABELS_TKM,
  }),
];

const CARGO_SHIPMENT_DELIVERED: DefaultTemplate[] = [
  cargoTemplate("CARGO_SHIPMENT_DELIVERED", "ru", {
    subject: "Отправление {{shipment.trackingNumber}} доставлено",
    preheader: "Ваше отправление доставлено.",
    title: "Отправление доставлено",
    intro: "Ваше отправление доставлено получателю.",
    labels: CARGO_LABELS_RU,
  }),
  cargoTemplate("CARGO_SHIPMENT_DELIVERED", "en", {
    subject: "Shipment {{shipment.trackingNumber}} delivered",
    preheader: "Your shipment has been delivered.",
    title: "Shipment delivered",
    intro: "Your shipment has been delivered to the recipient.",
    labels: CARGO_LABELS_EN,
  }),
  cargoTemplate("CARGO_SHIPMENT_DELIVERED", "tkm", {
    subject: "{{shipment.trackingNumber}} ugratmasy gowşuryldy",
    preheader: "Ugratmaňyz gowşuryldy.",
    title: "Ugratma gowşuryldy",
    intro: "Ugratmaňyz alyja gowşuryldy.",
    labels: CARGO_LABELS_TKM,
  }),
];

// ---------------------------------------------------------------------------
// Seller mail. Complements the Telegram notification that already exists rather than replacing
// it -- a seller who never linked Telegram currently gets nothing at all, and email is the only
// channel that reaches them.
// ---------------------------------------------------------------------------

const SELLER_NEW_ORDER: DefaultTemplate[] = (
  [
    [
      "ru",
      {
        subject: "Новый заказ: {{order.productName}}",
        preheader: "{{order.amountTmt}} TMT · {{order.deliveryCity}}",
        title: "Новый заказ",
        intro: "Здравствуйте, {{seller.name}}! У вас новый заказ.",
        labels: {
          id: "Номер заказа",
          product: "Товар",
          amount: "Сумма",
          recipient: "Получатель",
          phone: "Телефон",
          city: "Город",
          address: "Адрес",
          card: "Текст открытки",
        },
      },
    ],
    [
      "en",
      {
        subject: "New order: {{order.productName}}",
        preheader: "{{order.amountTmt}} TMT · {{order.deliveryCity}}",
        title: "New order",
        intro: "Hello, {{seller.name}}! You have a new order.",
        labels: {
          id: "Order number",
          product: "Product",
          amount: "Amount",
          recipient: "Recipient",
          phone: "Phone",
          city: "City",
          address: "Address",
          card: "Card message",
        },
      },
    ],
    [
      "tkm",
      {
        subject: "Täze sargyt: {{order.productName}}",
        preheader: "{{order.amountTmt}} TMT · {{order.deliveryCity}}",
        title: "Täze sargyt",
        intro: "Salam, {{seller.name}}! Size täze sargyt geldi.",
        labels: {
          id: "Sargyt belgisi",
          product: "Haryt",
          amount: "Möçberi",
          recipient: "Alyjy",
          phone: "Telefon",
          city: "Şäher",
          address: "Salgy",
          card: "Kartoçkanyň teksti",
        },
      },
    ],
  ] as const
).map(([locale, copy]) => {
  const rows = [
    detailRow(copy.labels.id, "{{order.id}}"),
    detailRow(copy.labels.product, "{{order.productName}}"),
    detailRow(copy.labels.amount, "{{order.amountTmt}} TMT"),
    detailRow(copy.labels.recipient, "{{order.recipientName}}"),
    detailRow(copy.labels.phone, "{{order.recipientPhone}}"),
    detailRow(copy.labels.city, "{{order.deliveryCity}}"),
    detailRow(copy.labels.address, "{{order.deliveryAddress}}"),
    // Optional on the order, so the row disappears entirely when there is no message.
    `{{#order.cardMessage}}${detailRow(copy.labels.card, "{{order.cardMessage}}")}{{/order.cardMessage}}`,
  ].join("\n");

  return {
    kind: "SELLER_NEW_ORDER" as EmailKind,
    locale,
    subject: copy.subject,
    preheader: copy.preheader,
    html: emailLayout({
      title: copy.title,
      preheader: copy.preheader,
      bodyHtml: [paragraph(copy.intro), detailTable(rows)].join("\n"),
    }),
    text: [
      copy.intro,
      "",
      `${copy.labels.id}: {{order.id}}`,
      `${copy.labels.product}: {{order.productName}}`,
      `${copy.labels.amount}: {{order.amountTmt}} TMT`,
      `${copy.labels.recipient}: {{order.recipientName}}`,
      `${copy.labels.phone}: {{order.recipientPhone}}`,
      `${copy.labels.city}: {{order.deliveryCity}}`,
      `${copy.labels.address}: {{order.deliveryAddress}}`,
      `{{#order.cardMessage}}${copy.labels.card}: {{order.cardMessage}}{{/order.cardMessage}}`,
      "",
      "Gulyaly",
      "https://gulyaly.pro",
    ].join("\n"),
  };
});

function simpleSellerTemplate(
  kind: EmailKind,
  locale: EmailLocale,
  copy: { subject: string; preheader: string; title: string; lines: string[] },
): DefaultTemplate {
  return {
    kind,
    locale,
    subject: copy.subject,
    preheader: copy.preheader,
    html: emailLayout({
      title: copy.title,
      preheader: copy.preheader,
      bodyHtml: copy.lines.map(paragraph).join("\n"),
    }),
    text: [...copy.lines, "", "Gulyaly", "https://gulyaly.pro"].join("\n"),
  };
}

const SELLER_ORDER_CANCELLED: DefaultTemplate[] = [
  simpleSellerTemplate("SELLER_ORDER_CANCELLED", "ru", {
    subject: "Заказ {{order.id}} отменён",
    preheader: "{{order.productName}} · {{order.amountTmt}} TMT",
    title: "Заказ отменён",
    lines: [
      "Здравствуйте, {{seller.name}}!",
      "Заказ {{order.id}} ({{order.productName}}, {{order.amountTmt}} TMT) отменён. Готовить его не нужно.",
    ],
  }),
  simpleSellerTemplate("SELLER_ORDER_CANCELLED", "en", {
    subject: "Order {{order.id}} cancelled",
    preheader: "{{order.productName}} · {{order.amountTmt}} TMT",
    title: "Order cancelled",
    lines: [
      "Hello, {{seller.name}}!",
      "Order {{order.id}} ({{order.productName}}, {{order.amountTmt}} TMT) has been cancelled. No need to prepare it.",
    ],
  }),
  simpleSellerTemplate("SELLER_ORDER_CANCELLED", "tkm", {
    subject: "{{order.id}} sargydy ýatyryldy",
    preheader: "{{order.productName}} · {{order.amountTmt}} TMT",
    title: "Sargyt ýatyryldy",
    lines: [
      "Salam, {{seller.name}}!",
      "{{order.id}} sargydy ({{order.productName}}, {{order.amountTmt}} TMT) ýatyryldy. Ony taýýarlamak gerek däl.",
    ],
  }),
];

const SELLER_PAYOUT: DefaultTemplate[] = [
  simpleSellerTemplate("SELLER_PAYOUT", "ru", {
    subject: "Выплата {{payout.amountTmt}} TMT произведена",
    preheader: "Заявка на вывод средств выплачена.",
    title: "Выплата произведена",
    lines: [
      "Здравствуйте, {{seller.name}}!",
      "Ваша заявка на вывод {{payout.amountTmt}} TMT выплачена.",
      "{{#payout.note}}Комментарий: {{payout.note}}{{/payout.note}}",
    ],
  }),
  simpleSellerTemplate("SELLER_PAYOUT", "en", {
    subject: "Payout of {{payout.amountTmt}} TMT sent",
    preheader: "Your withdrawal request has been paid.",
    title: "Payout sent",
    lines: [
      "Hello, {{seller.name}}!",
      "Your withdrawal request for {{payout.amountTmt}} TMT has been paid.",
      "{{#payout.note}}Note: {{payout.note}}{{/payout.note}}",
    ],
  }),
  simpleSellerTemplate("SELLER_PAYOUT", "tkm", {
    subject: "{{payout.amountTmt}} TMT tölendi",
    preheader: "Serişde çykarmak islegiňiz tölendi.",
    title: "Töleg geçirildi",
    lines: [
      "Salam, {{seller.name}}!",
      "{{payout.amountTmt}} TMT çykarmak baradaky islegiňiz tölendi.",
      "{{#payout.note}}Bellik: {{payout.note}}{{/payout.note}}",
    ],
  }),
];

// ---------------------------------------------------------------------------
// Seller application stage. These are the only messages an applicant can receive: Telegram
// linking needs an approved Seller to issue a code, so before approval there is no other
// channel. Silence here is where applicants drop out of the funnel and where support tickets
// ("did you get my application?") come from.
// ---------------------------------------------------------------------------

const SELLER_APPLICATION_RECEIVED: DefaultTemplate[] = [
  simpleSellerTemplate("SELLER_APPLICATION_RECEIVED", "ru", {
    subject: "Заявка на продавца принята",
    preheader: "Мы рассмотрим её и напишем сюда же.",
    title: "Заявка принята",
    lines: [
      "Здравствуйте, {{seller.name}}!",
      "Мы получили вашу заявку на продавца и рассмотрим её. Ответ придёт на этот адрес.",
      "Отвечать на это письмо не нужно.",
    ],
  }),
  simpleSellerTemplate("SELLER_APPLICATION_RECEIVED", "en", {
    subject: "Seller application received",
    preheader: "We'll review it and reply to this address.",
    title: "Application received",
    lines: [
      "Hello, {{seller.name}}!",
      "We've received your seller application and will review it. The decision will come to this address.",
      "No reply is needed.",
    ],
  }),
  simpleSellerTemplate("SELLER_APPLICATION_RECEIVED", "tkm", {
    subject: "Satyjy arzasy kabul edildi",
    preheader: "Serederis we şu salga ýazarys.",
    title: "Arza kabul edildi",
    lines: [
      "Salam, {{seller.name}}!",
      "Satyjy bolmak baradaky arzaňyzy aldyk we serederis. Jogap şu salga geler.",
      "Bu hata jogap bermek gerek däl.",
    ],
  }),
];

const SELLER_APPROVED: DefaultTemplate[] = [
  simpleSellerTemplate("SELLER_APPROVED", "ru", {
    subject: "Заявка одобрена — добро пожаловать в Gulyaly",
    preheader: "Входите под своим номером телефона.",
    title: "Заявка одобрена",
    lines: [
      "Здравствуйте, {{seller.name}}!",
      "Ваша заявка одобрена. Магазин «{{seller.shopName}}» создан.",
      "Войдите на https://gulyaly.pro/login под номером телефона, который указали в заявке, — с тем же паролем.",
      "В кабинете подтвердите этот email, чтобы получать письма о заказах и выплатах, и привяжите Telegram для мгновенных уведомлений.",
    ],
  }),
  simpleSellerTemplate("SELLER_APPROVED", "en", {
    subject: "Application approved — welcome to Gulyaly",
    preheader: "Sign in with your phone number.",
    title: "Application approved",
    lines: [
      "Hello, {{seller.name}}!",
      "Your application is approved. The shop “{{seller.shopName}}” has been created.",
      "Sign in at https://gulyaly.pro/login with the phone number from your application and the same password.",
      "In your account, confirm this email to receive order and payout notifications, and link Telegram for instant alerts.",
    ],
  }),
  simpleSellerTemplate("SELLER_APPROVED", "tkm", {
    subject: "Arza tassyklandy — Gulyaly-a hoş geldiňiz",
    preheader: "Telefon belgiňiz bilen giriň.",
    title: "Arza tassyklandy",
    lines: [
      "Salam, {{seller.name}}!",
      "Arzaňyz tassyklandy. «{{seller.shopName}}» dükany döredildi.",
      "https://gulyaly.pro/login salgysyndan arzada görkezen telefon belgiňiz we şol parol bilen giriň.",
      "Hasabyňyzda şu e-poçtany tassyklaň — sargytlar we tölegler barada hat almak üçin, hem-de Telegram-y baglaň.",
    ],
  }),
];

const SELLER_REJECTED: DefaultTemplate[] = [
  simpleSellerTemplate("SELLER_REJECTED", "ru", {
    subject: "Заявка на продавца отклонена",
    preheader: "Можно исправить и подать снова.",
    title: "Заявка отклонена",
    lines: [
      "Здравствуйте, {{seller.name}}!",
      "К сожалению, ваша заявка отклонена.",
      // The reason is what makes a rejection actionable instead of a dead end -- wrapped so the
      // line disappears when an admin left no note.
      "{{#seller.reason}}Причина: {{seller.reason}}{{/seller.reason}}",
      "Вы можете исправить указанное и подать заявку снова. Вопросы — на support@gulyaly.pro",
    ],
  }),
  simpleSellerTemplate("SELLER_REJECTED", "en", {
    subject: "Seller application declined",
    preheader: "You can fix it and reapply.",
    title: "Application declined",
    lines: [
      "Hello, {{seller.name}}!",
      "Unfortunately your application was declined.",
      "{{#seller.reason}}Reason: {{seller.reason}}{{/seller.reason}}",
      "You're welcome to address it and apply again. Questions: support@gulyaly.pro",
    ],
  }),
  simpleSellerTemplate("SELLER_REJECTED", "tkm", {
    subject: "Satyjy arzasy ret edildi",
    preheader: "Düzedip, täzeden tabşyryp bilersiňiz.",
    title: "Arza ret edildi",
    lines: [
      "Salam, {{seller.name}}!",
      "Gynansak-da, arzaňyz ret edildi.",
      "{{#seller.reason}}Sebäbi: {{seller.reason}}{{/seller.reason}}",
      "Görkezileni düzedip, täzeden tabşyryp bilersiňiz. Soraglar: support@gulyaly.pro",
    ],
  }),
];

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  ...VERIFICATION,
  ...PASSWORD_RESET,
  ...PASSWORD_CHANGED,
  ...SELLER_NEW_ORDER,
  ...SELLER_ORDER_CANCELLED,
  ...SELLER_PAYOUT,
  ...SELLER_APPLICATION_RECEIVED,
  ...SELLER_APPROVED,
  ...SELLER_REJECTED,
  ...ORDER_CREATED,
  ...ORDER_COMPLETED,
  ...ORDER_FAILED,
  ...CARGO_SHIPMENT_CREATED,
  ...CARGO_SHIPMENT_DELIVERED,
];
