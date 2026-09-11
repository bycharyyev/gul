import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const services = [
    { code: "TMCELL", name: "TMCELL", minAmountTmt: 5, maxAmountTmt: 500, sortOrder: 1 },
    { code: "TTELECOM", name: "Turkmen Telecom", minAmountTmt: 5, maxAmountTmt: 500, sortOrder: 2 },
    { code: "ASTUINT", name: "ASTU (АГТС)", minAmountTmt: 5, maxAmountTmt: 500, sortOrder: 3 },
    { code: "GB_PACKET", name: "TMCELL GB Paket", minAmountTmt: 10, maxAmountTmt: 300, sortOrder: 4 },
    { code: "BELET", name: "Belet", minAmountTmt: 5, maxAmountTmt: 500, sortOrder: 5 },
  ] as const;

  const rateByCurrency = {
    USD: 0.062,
    RUB: 5.3,
    EUR: 0.054,
    TRY: 3.1,
    CNY: 0.435,
    KZT: 29,
  } as const;

  for (const svc of services) {
    const service = await prisma.service.upsert({
      where: { code: svc.code },
      create: { ...svc, isEnabled: true },
      update: {},
    });

    for (const [currency, rate] of Object.entries(rateByCurrency)) {
      await prisma.rate.upsert({
        where: { serviceId_currency: { serviceId: service.id, currency: currency as never } },
        create: { serviceId: service.id, currency: currency as never, rate, enabled: true },
        update: {},
      });
    }
  }

  await prisma.paymentMethod.upsert({
    where: { code: "MANUAL" },
    // The name is what a customer reads in the top-up form. Nobody can pay by card here --
    // `manual` means a person confirms a transfer -- so naming it after a card promised a form
    // that does not exist, and "(demo)" ended up in the Play store screenshots. `update` carries
    // the name too: an environment seeded before this stays wrong otherwise, which is exactly
    // what happened to production.
    create: { code: "MANUAL", name: "Перевод по реквизитам", provider: "manual", sortOrder: 1 },
    update: { name: "Перевод по реквизитам" },
  });

  const contentPages = [
    {
      slug: "faq",
      title: "Часто задаваемые вопросы",
      body: [
        "## Как быстро зачисляются средства?",
        "Обычно в течение нескольких минут после подтверждения оплаты.",
        "",
        "## Какие способы оплаты доступны?",
        "Банковская карта, СБП и другие методы — полный список виден на шаге оплаты.",
        "",
        "## Что делать, если платёж прошёл, а баланс не пополнился?",
        "Проверьте статус заказа на странице «Проверка заказа» или напишите в чат поддержки — мы разберёмся.",
      ].join("\n"),
      titleEn: "Frequently asked questions",
      bodyEn: [
        "## How quickly is the balance credited?",
        "Usually within a few minutes after payment is confirmed.",
        "",
        "## What payment methods are available?",
        "Bank card, SBP, and other methods -- the full list is shown at the payment step.",
        "",
        "## What if the payment went through but the balance wasn't credited?",
        "Check your order status on the \"Track order\" page, or message support chat -- we'll sort it out.",
      ].join("\n"),
      titleTkm: "Ýygy-ýygydan soralýan soraglar",
      bodyTkm: [
        "## Balans näçe çalt geçirilýär?",
        "Adatça töleg tassyklanandan soň birnäçe minudyň dowamynda.",
        "",
        "## Haýsy töleg usullary bar?",
        "Bank kartasy, SBP we beýleki usullar -- doly sanaw töleg ädiminde görkezilýär.",
        "",
        "## Töleg geçdi, ýöne balans dolmady, näme etmeli?",
        "«Sargydy barla» sahypasynda sargydyň ýagdaýyny barlaň ýa-da goldaw çatyna ýazyň -- kömek ederis.",
      ].join("\n"),
    },
    {
      slug: "privacy",
      title: "Политика конфиденциальности",
      body: [
        "Мы собираем только те данные, которые необходимы для обработки заказов: номер телефона, идентификатор получателя и историю операций.",
        "",
        "Данные не передаются третьим лицам, кроме случаев, необходимых для исполнения платежа и пополнения баланса у оператора.",
        "",
        "Вы можете запросить удаление своих данных, обратившись в поддержку.",
      ].join("\n"),
      titleEn: "Privacy policy",
      bodyEn: [
        "We only collect the data necessary to process orders: phone number, recipient identifier, and transaction history.",
        "",
        "Your data is not shared with third parties, except where required to complete a payment or top up your balance with the operator.",
        "",
        "You can request deletion of your data by contacting support.",
      ].join("\n"),
      titleTkm: "Gizlinlik syýasaty",
      bodyTkm: [
        "Biz diňe sargytlary işlemek üçin zerur bolan maglumatlary ýygnaýarys: telefon belgisi, alyjynyň identifikatory we amallaryň taryhy.",
        "",
        "Maglumatlar, tölegi amala aşyrmak ýa-da operatoryň ýanynda balansy doldurmak üçin zerur bolan ýagdaýlardan başga ýagdaýlarda üçünji taraplara berilmeýär.",
        "",
        "Goldaw gullugyna ýüz tutup, maglumatlaryňyzy pozdurmagy talap edip bilersiňiz.",
      ].join("\n"),
    },
    {
      slug: "offer",
      title: "Договор оферты",
      body: [
        "Настоящий документ является публичной офертой на оказание услуг по приёму платежей за пополнение баланса мобильных операторов и цифровых сервисов.",
        "",
        "Оформляя заказ на сайте, пользователь принимает условия настоящей оферты в полном объёме.",
        "",
        "Оплата считается исполненной после подтверждения платежа выбранным способом оплаты.",
      ].join("\n"),
      titleEn: "Offer agreement",
      bodyEn: [
        "This document is a public offer to provide payment-acceptance services for topping up mobile operator balances and digital services.",
        "",
        "By placing an order on the site, the user fully accepts the terms of this offer.",
        "",
        "Payment is considered completed once it is confirmed via the chosen payment method.",
      ].join("\n"),
      titleTkm: "Oferta şertnamasy",
      bodyTkm: [
        "Bu resminama mobil operatorlaryň balansyny we sanly hyzmatlary doldurmak üçin töleg kabul etmek hyzmatlaryny bermek barada jemgyýetçilik oferti bolup durýar.",
        "",
        "Saýtda sargyt bermek bilen, ulanyjy şu oferttiň şertlerini doly kabul edýär.",
        "",
        "Töleg saýlanan töleg usuly arkaly tassyklanandan soň ýerine ýetirilen hasaplanýar.",
      ].join("\n"),
    },
  ];

  for (const page of contentPages) {
    await prisma.contentPage.upsert({
      where: { slug: page.slug },
      create: page,
      update: {
        titleEn: page.titleEn,
        bodyEn: page.bodyEn,
        titleTkm: page.titleTkm,
        bodyTkm: page.bodyTkm,
      },
    });
  }

  const galleryCategories = [
    { slug: "flowers", name: "Цветы", sortOrder: 1 },
    { slug: "postcards", name: "Открытки", sortOrder: 2 },
    { slug: "bouquets", name: "Подарочные букеты", sortOrder: 3 },
  ] as const;

  const categoryIds: Record<string, string> = {};
  for (const cat of galleryCategories) {
    const category = await prisma.galleryCategory.upsert({
      where: { slug: cat.slug },
      create: { slug: cat.slug, name: cat.name, sortOrder: cat.sortOrder, isEnabled: true },
      update: {},
    });
    categoryIds[cat.slug] = category.id;
  }

  const galleryProducts = [
    {
      sku: "FLW-001",
      categorySlug: "flowers",
      name: "Букет роз \"Классика\"",
      description: "25 красных роз с оформлением и лентой.",
      imageUrl: "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=600",
      priceTmt: 350,
      sortOrder: 1,
    },
    {
      sku: "FLW-002",
      categorySlug: "flowers",
      name: "Тюльпаны \"Весна\"",
      description: "15 свежих тюльпанов в крафт-упаковке.",
      imageUrl: "https://images.unsplash.com/photo-1520763185298-1b434c919102?w=600",
      priceTmt: 220,
      sortOrder: 2,
    },
    {
      sku: "PC-001",
      categorySlug: "postcards",
      name: "Открытка \"С днём рождения\"",
      description: "Праздничная открытка с индивидуальным текстом.",
      imageUrl: "https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=600",
      priceTmt: 30,
      sortOrder: 1,
    },
    {
      sku: "PC-002",
      categorySlug: "postcards",
      name: "Открытка \"Спасибо\"",
      description: "Открытка для выражения благодарности.",
      imageUrl: "https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=600",
      priceTmt: 25,
      sortOrder: 2,
    },
    {
      sku: "BQT-001",
      categorySlug: "bouquets",
      name: "Подарочный набор \"Премиум\"",
      description: "Букет цветов + шоколад + открытка в подарочной упаковке.",
      imageUrl: "https://images.unsplash.com/photo-1487070183336-b863922373d4?w=600",
      priceTmt: 480,
      sortOrder: 1,
    },
  ] as const;

  for (const prod of galleryProducts) {
    const existing = await prisma.galleryProduct.findFirst({
      where: { name: prod.name, categoryId: categoryIds[prod.categorySlug] },
    });
    if (!existing) {
      await prisma.galleryProduct.create({
        data: {
          categoryId: categoryIds[prod.categorySlug],
          sku: prod.sku,
          name: prod.name,
          description: prod.description,
          imageUrl: prod.imageUrl,
          priceTmt: prod.priceTmt,
          sortOrder: prod.sortOrder,
          isEnabled: true,
        },
      });
    }
  }

  // No default. A literal here is a working production credential the moment somebody seeds
  // without setting this and never changes it -- and in a public repository it is a working
  // credential that anybody can read. Refusing to seed is the only safe answer.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 12) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is not set (or is shorter than 12 characters). Set it before seeding:\n" +
        "  SEED_ADMIN_PASSWORD='<a password you generated>' pnpm db:seed",
    );
  }
  const marketplaceSources = [
    ["OZON", "Ozon", ["ozon.ru", "www.ozon.ru"]], ["WILDBERRIES", "Wildberries", ["wildberries.ru", "www.wildberries.ru"]],
    ["ALIEXPRESS", "AliExpress", ["aliexpress.com", "www.aliexpress.com", "aliexpress.ru"]], ["TRENDYOL", "Trendyol", ["trendyol.com", "www.trendyol.com"]],
    ["YANDEX_MARKET", "Яндекс Маркет", ["market.yandex.ru"]], ["TAOBAO", "Taobao", ["taobao.com", "www.taobao.com", "item.taobao.com"]],
  ] as const;
  for (const [code, name, allowedHosts] of marketplaceSources) await prisma.marketplacePurchaseSource.upsert({ where: { code }, create: { code, name, allowedHosts: [...allowedHosts], adapterKey: "manual", requiresManualReview: true }, update: { name, allowedHosts: [...allowedHosts] } });
  await prisma.marketplacePurchaseSettings.upsert({ where: { id: "singleton" }, create: {}, update: {} });
  await prisma.user.upsert({
    where: { phone: "+70000000000" },
    create: {
      phone: "+70000000000",
      passwordHash: await argon2.hash(adminPassword),
      fullName: "Platform Admin",
      username: "admin",
      role: "ADMIN",
    },
    update: {},
  });

  // The password is not echoed: seed output ends up in CI logs and terminal scrollback, and
  // whoever ran this already knows what they passed in.
  // eslint-disable-next-line no-console
  console.log("Seed complete. Admin login: +70000000000 (password: the SEED_ADMIN_PASSWORD you set)");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
