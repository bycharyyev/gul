import type { PushCategory } from "./push-message";

interface Text {
  title: string;
  body: string;
}

export interface DefaultTemplate {
  /** Unique: installing the defaults again never duplicates or overwrites an edited one. */
  name: string;
  category: PushCategory;
  route: string;
  ru: Text;
  en: Text;
  tkm: Text;
}

/**
 * Ready-made messages for the admin to start from: holidays, promotions, reminders and service
 * notices. Wording is deliberately general -- no discount sizes, delivery times or prices -- because
 * a template that promises something untrue is worse than none; edit a template to add specifics.
 * The Turkmen text should be read by a native speaker before it goes to customers.
 */
export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  // ---- Holidays (gifts and flowers) ----
  {
    name: "Праздник: Новый год",
    category: "gallery",
    route: "/gallery",
    ru: { title: "С Новым годом! 🎄", body: "Пусть новый год принесёт радость и тепло. Подарите близким цветы и подарки в Gulyaly." },
    en: { title: "Happy New Year! 🎄", body: "May the new year bring joy and warmth. Send flowers and gifts with Gulyaly." },
    tkm: { title: "Täze ýyl bilen! 🎄", body: "Täze ýyl size şatlyk we mähir getirsin. Gulyaly bilen ýakynlaryňyza gül we sowgat iberiň." },
  },
  {
    name: "Праздник: Навруз",
    category: "gallery",
    route: "/gallery",
    ru: { title: "Навруз мубарак! 🌷", body: "Весна приходит в каждый дом. Поздравьте близких букетом из Gulyaly." },
    en: { title: "Happy Nowruz! 🌷", body: "Spring is coming to every home. Congratulate your loved ones with a bouquet from Gulyaly." },
    tkm: { title: "Nowruz baýramyňyz mübärek! 🌷", body: "Bahar her öýe gelýär. Ýakynlaryňyzy Gulyaly gül desgesi bilen gutlaň." },
  },
  {
    name: "Праздник: 8 Марта",
    category: "gallery",
    route: "/gallery",
    ru: { title: "С 8 Марта! 💐", body: "Порадуйте мам, жён и подруг цветами. Букеты уже ждут вас в приложении." },
    en: { title: "Happy International Women's Day! 💐", body: "Delight the women in your life with flowers. Bouquets are waiting in the app." },
    tkm: { title: "8-nji mart bilen! 💐", body: "Ejeleriňizi, aýallaryňyzy we dostlaryňyzy gül bilen begendiriň. Gül desgeleri programmada sizi garaşýar." },
  },
  {
    name: "Праздник: Ураза-байрам",
    category: "gallery",
    route: "/gallery",
    ru: { title: "С праздником Ураза-байрам! 🌙", body: "Желаем мира, здоровья и добра вашему дому." },
    en: { title: "Eid Mubarak! 🌙", body: "Wishing peace, health and kindness to your home." },
    tkm: { title: "Oraza baýramyňyz gutly bolsun! 🌙", body: "Öýüňize parahatçylyk, saglyk we ýagşylyk arzuw edýäris." },
  },
  {
    name: "Праздник: Курбан-байрам",
    category: "gallery",
    route: "/gallery",
    ru: { title: "С праздником Курбан-байрам! 🌙", body: "Желаем мира, здоровья и добра вашему дому." },
    en: { title: "Eid al-Adha Mubarak! 🌙", body: "Wishing peace, health and kindness to your home." },
    tkm: { title: "Gurban baýramyňyz gutly bolsun! 🌙", body: "Öýüňize parahatçylyk, saglyk we ýagşylyk arzuw edýäris." },
  },
  {
    name: "Праздник: День независимости Туркменистана",
    category: "gallery",
    route: "/gallery",
    ru: { title: "С Днём независимости Туркменистана! 🇹🇲", body: "Поздравляем с главным праздником страны." },
    en: { title: "Happy Independence Day, Turkmenistan! 🇹🇲", body: "Congratulations on the country's main holiday." },
    tkm: { title: "Türkmenistanyň Garaşsyzlyk güni bilen! 🇹🇲", body: "Ýurdumyzyň baş baýramy bilen gutlaýarys." },
  },
  {
    name: "Праздник: День нейтралитета",
    category: "gallery",
    route: "/gallery",
    ru: { title: "С Днём нейтралитета! 🕊️", body: "Мира и благополучия вашему дому." },
    en: { title: "Happy Neutrality Day! 🕊️", body: "Peace and prosperity to your home." },
    tkm: { title: "Bitaraplyk güni bilen! 🕊️", body: "Öýüňize parahatçylyk we abadançylyk arzuw edýäris." },
  },
  {
    name: "Праздник: День святого Валентина",
    category: "gallery",
    route: "/gallery",
    ru: { title: "С Днём святого Валентина! ❤️", body: "Подарите любимым цветы и открытки." },
    en: { title: "Happy Valentine's Day! ❤️", body: "Give your loved ones flowers and cards." },
    tkm: { title: "Walentin güni bilen! ❤️", body: "Söýgüliňize gül we açykhat sowgat ediň." },
  },
  {
    name: "Праздник: День рождения",
    category: "gallery",
    route: "/gallery",
    ru: { title: "С днём рождения! 🎂", body: "Желаем счастья и ярких моментов. Порадуйте себя подарком в Gulyaly." },
    en: { title: "Happy birthday! 🎂", body: "Wishing you happiness and bright moments. Treat yourself to a gift on Gulyaly." },
    tkm: { title: "Doglan günüňiz gutly bolsun! 🎂", body: "Size bagt we ajaýyp pursatlar arzuw edýäris. Özüňize Gulyaly-dan sowgat ediň." },
  },
  {
    name: "Праздник: универсальное поздравление",
    category: "gallery",
    route: "/gallery",
    ru: { title: "С праздником! 🎉", body: "Поздравляем вас и ваших близких. Подарите радость с Gulyaly." },
    en: { title: "Happy holiday! 🎉", body: "Congratulations to you and your loved ones. Share joy with Gulyaly." },
    tkm: { title: "Baýramyňyz gutly bolsun! 🎉", body: "Sizi we ýakynlaryňyzy gutlaýarys. Gulyaly bilen şatlyk paýlaşyň." },
  },

  // ---- Promotions ----
  {
    name: "Акция: специальные цены на букеты",
    category: "gallery",
    route: "/gallery",
    ru: { title: "Специальные цены на букеты 🌸", body: "Цветы и подарки по выгодным ценам — только в приложении." },
    en: { title: "Special prices on bouquets 🌸", body: "Flowers and gifts at great prices, only in the app." },
    tkm: { title: "Gül desgelerine aýratyn bahalar 🌸", body: "Gül we sowgatlar amatly bahadan — diňe programmada." },
  },
  {
    name: "Акция: новинки в галерее",
    category: "gallery",
    route: "/gallery",
    ru: { title: "Новинки в галерее ✨", body: "Загляните: появились новые букеты и подарочные наборы." },
    en: { title: "New in the gallery ✨", body: "Take a look: new bouquets and gift sets have arrived." },
    tkm: { title: "Galereýada täzelikler ✨", body: "Göz aýlaň: täze gül desgeleri we sowgat toplumlary peýda boldy." },
  },
  {
    name: "Акция: идеи для подарка",
    category: "gallery",
    route: "/gallery",
    ru: { title: "Идеи для подарка 🎁", body: "Готовые наборы для любого повода собраны в одном месте." },
    en: { title: "Gift ideas 🎁", body: "Ready-made sets for every occasion, all in one place." },
    tkm: { title: "Sowgat pikirleri 🎁", body: "Islendik ýagdaý üçin taýýar toplumlar bir ýerde jemlendi." },
  },
  {
    name: "Пополнение: баланс за минуту",
    category: "orders",
    route: "/home",
    ru: { title: "Пополните баланс за минуту ⚡", body: "Мобильная связь, игры и сервисы — выберите и оплатите в приложении." },
    en: { title: "Top up in a minute ⚡", body: "Mobile, games and services: pick and pay in the app." },
    tkm: { title: "Balansy bir minutda dolduryň ⚡", body: "Mobil aragatnaşyk, oýunlar we hyzmatlar — programmada saýlaň we töläň." },
  },
  {
    name: "Пополнение: игровая валюта",
    category: "orders",
    route: "/home",
    ru: { title: "Пополнение игр 🎮", body: "UC, алмазы и другая игровая валюта — выберите нужный пакет в приложении." },
    en: { title: "Game top-ups 🎮", body: "UC, diamonds and other in-game currency: choose your pack in the app." },
    tkm: { title: "Oýunlary dolduryş 🎮", body: "UC, almazlar we beýleki oýun walýutasy — zerur paketi programmada saýlaň." },
  },

  // ---- Reminders ----
  {
    name: "Напоминание: заказ ждёт оплаты",
    category: "orders",
    route: "/home/orders",
    ru: { title: "Заказ ждёт оплаты", body: "Вы не завершили оплату заказа. Откройте приложение, чтобы закончить." },
    en: { title: "Your order is waiting for payment", body: "You have not finished paying for your order. Open the app to complete it." },
    tkm: { title: "Sargyt tölegi garaşýar", body: "Sargydyň tölegini tamamlamadyňyz. Tamamlamak üçin programmany açyň." },
  },
  {
    name: "Напоминание: посылка ждёт оплаты",
    category: "cargo",
    route: "/home/cargo",
    ru: { title: "Посылка ждёт оплаты 📦", body: "Оплатите доставку, чтобы мы начали обработку посылки." },
    en: { title: "Your parcel is waiting for payment 📦", body: "Pay for delivery so we can start processing your parcel." },
    tkm: { title: "Bukja tölegi garaşýar 📦", body: "Bukjany işlemäge başlamagymyz üçin eltip bermegiň tölegini ediň." },
  },

  // ---- Service notices ----
  {
    name: "Сервис: технические работы",
    category: "feed",
    route: "/home",
    ru: { title: "Технические работы 🔧", body: "Сегодня мы улучшаем сервис. Возможны кратковременные перебои — спасибо за терпение." },
    en: { title: "Maintenance 🔧", body: "We are improving the service today. Short interruptions are possible. Thank you for your patience." },
    tkm: { title: "Tehniki işler 🔧", body: "Şu gün hyzmaty gowulandyrýarys. Gysga wagtlyk päsgelçilikler bolup biler — sabyr edeniňiz üçin sag boluň." },
  },
  {
    name: "Сервис: вышло обновление",
    category: "feed",
    route: "/home",
    ru: { title: "Вышло обновление ⬆️", body: "Обновите приложение, чтобы получить новые функции и исправления." },
    en: { title: "An update is available ⬆️", body: "Update the app to get new features and fixes." },
    tkm: { title: "Täzelenme çykdy ⬆️", body: "Täze mümkinçilikleri we düzedişleri almak üçin programmany täzeläň." },
  },
  {
    name: "Сервис: новое в приложении",
    category: "feed",
    route: "/home",
    ru: { title: "Новое в Gulyaly ✨", body: "Мы добавили новые возможности. Откройте приложение и посмотрите." },
    en: { title: "What's new in Gulyaly ✨", body: "We added new features. Open the app and take a look." },
    tkm: { title: "Gulyaly-da täzelikler ✨", body: "Täze mümkinçilikler goşduk. Programmany açyp görüň." },
  },
  {
    name: "Сервис: добро пожаловать",
    category: "feed",
    route: "/home",
    ru: { title: "Добро пожаловать в Gulyaly!", body: "Пополнения, покупки и доставка — всё в одном приложении." },
    en: { title: "Welcome to Gulyaly!", body: "Top-ups, shopping and delivery, all in one app." },
    tkm: { title: "Gulyaly-a hoş geldiňiz!", body: "Dolduryş, söwda we eltip bermek — hemmesi bir programmada." },
  },
  {
    name: "Сервис: пригласите друга",
    category: "feed",
    route: "/profile",
    ru: { title: "Пригласите друга 🤝", body: "Поделитесь своим кодом из профиля и приглашайте друзей в Gulyaly." },
    en: { title: "Invite a friend 🤝", body: "Share your code from your profile and invite friends to Gulyaly." },
    tkm: { title: "Dostuňyzy çagyryň 🤝", body: "Profiliňizdäki koduňyzy paýlaşyň we dostlaryňyzy Gulyaly-a çagyryň." },
  },
  {
    name: "Безопасность: не сообщайте коды",
    category: "support",
    route: "/home",
    ru: { title: "Ваша безопасность 🔒", body: "Никому не сообщайте пароли и коды из SMS — сотрудники Gulyaly их не спрашивают." },
    en: { title: "Stay safe 🔒", body: "Never share your passwords or SMS codes. Gulyaly staff will never ask for them." },
    tkm: { title: "Howpsuzlygyňyz 🔒", body: "Parollary we SMS kodlaryny hiç kime aýtmaň — Gulyaly işgärleri olary soramaýar." },
  },

  // ---- Cargo, feed, chats, support ----
  {
    name: "Карго: отправьте посылку",
    category: "cargo",
    route: "/home/cargo",
    ru: { title: "Отправка посылок 📦", body: "Рассчитайте стоимость и оформите доставку в разделе «Карго»." },
    en: { title: "Send a parcel 📦", body: "Calculate the cost and arrange delivery in the Cargo section." },
    tkm: { title: "Bukja iberiň 📦", body: "«Kargo» bölüminde bahany hasaplap, eltip bermegi resmileşdiriň." },
  },
  {
    name: "Лента: новое в ленте",
    category: "feed",
    route: "/feed",
    ru: { title: "Новое в ленте 🎬", body: "Свежие публикации продавцов уже ждут вас." },
    en: { title: "New in the feed 🎬", body: "Fresh posts from sellers are waiting for you." },
    tkm: { title: "Lentada täzelikler 🎬", body: "Satyjylaryň täze çap edilenleri sizi garaşýar." },
  },
  {
    name: "Чаты: каналы и группы",
    category: "chat",
    route: "/chats",
    ru: { title: "Каналы и группы 💬", body: "Подписывайтесь на каналы магазинов и создавайте группы для друзей." },
    en: { title: "Channels and groups 💬", body: "Follow shop channels and create groups for your friends." },
    tkm: { title: "Kanallar we toparlar 💬", body: "Dükanlaryň kanallaryna ýazylyň we dostlaryňyz üçin topar dörediň." },
  },
  {
    name: "Поддержка: мы на связи",
    category: "support",
    route: "/chats",
    ru: { title: "Мы на связи 💬", body: "Есть вопрос по заказу? Напишите нам в чате поддержки." },
    en: { title: "We're here to help 💬", body: "Have a question about your order? Write to us in the support chat." },
    tkm: { title: "Biz aragatnaşykda 💬", body: "Sargyt barada soragyňyz barmy? Goldaw çatynda bize ýazyň." },
  },
];
