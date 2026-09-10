import { autoModerate, textVerdict, TRUST_THRESHOLD } from "./auto-moderation";

const trusted = { approvedPosts: TRUST_THRESHOLD, upheldReports: 0 };
const newcomer = { approvedPosts: 0, upheldReports: 0 };

describe("textVerdict", () => {
  it.each([
    ["a phone number", "Звоните 65 12 34 56"],
    ["a phone number written solid", "тел 99312345678"],
    ["a link to somewhere else", "смотри тут https://ozon.ru/t/abc"],
    ["a bare www link", "заходи www.example.com"],
    ["a messenger handle", "пиши @mysellerchat"],
    ["one character fifteen times", "срочно !!!!!!!!!!!!!!!!!!"],
  ])("catches %s", (_label, body) => {
    expect(textVerdict(body)).not.toBeNull();
  });

  it("catches a caption that is mostly capitals", () => {
    expect(textVerdict("СРОЧНАЯ РАСПРОДАЖА ВСЕ ТОВАРЫ СО СКИДКОЙ СЕГОДНЯ")).toBe("shouting");
  });

  it("leaves a short capitalised word alone", () => {
    // A brand name or an abbreviation is not shouting, and the threshold exists so the rule does
    // not fire on every caption containing "MagSafe" or "СССР".
    expect(textVerdict("Новый USB-C кабель")).toBeNull();
  });

  it("allows our own address", () => {
    expect(textVerdict("подробнее на https://gulyaly.pro/feed")).toBeNull();
  });

  it("passes an ordinary caption, and an empty one", () => {
    expect(textVerdict("Тёплый плед, забрала вчера — очень довольна")).toBeNull();
    expect(textVerdict(null)).toBeNull();
    expect(textVerdict("   ")).toBeNull();
  });

  it("does not read a price or a date as a phone number", () => {
    // Seven digits is the bar; a four-digit price under it must not send a legitimate post to a
    // person, or the queue fills with exactly the content the feed is for.
    expect(textVerdict("Взяла за 2552 рубля, 09.09.2026")).toBeNull();
  });
});

describe("autoModerate", () => {
  it("publishes a clean post from an author three approvals in", () => {
    expect(autoModerate({ body: "Хороший плед", hasMedia: true, author: trusted })).toEqual({
      status: "PUBLISHED",
      reason: null,
    });
  });

  it("sends a newcomer to a person", () => {
    expect(autoModerate({ body: "Хороший плед", hasMedia: true, author: newcomer })).toMatchObject({
      status: "PENDING",
      reason: "author:new",
    });
  });

  it("sends an author one approval short of the bar to a person", () => {
    expect(
      autoModerate({
        body: "Хороший плед",
        hasMedia: false,
        author: { approvedPosts: TRUST_THRESHOLD - 1, upheldReports: 0 },
      }),
    ).toMatchObject({ status: "PENDING" });
  });

  it("returns a trusted author to the queue once a complaint is upheld", () => {
    // Trust is not permanent. One upheld report puts every later post back in front of a person.
    expect(
      autoModerate({
        body: "Хороший плед",
        hasMedia: true,
        author: { approvedPosts: 50, upheldReports: 1 },
      }),
    ).toMatchObject({ status: "PENDING", reason: "author:under-review" });
  });

  it("holds a rule-breaking caption even from a trusted author, and never rejects outright", () => {
    // A phone number is as often somebody not knowing the rules as a spammer; refusing with no
    // way back would lose a real seller, so it goes to a person with the reason attached.
    const verdict = autoModerate({
      body: "Звоните 65 12 34 56",
      hasMedia: true,
      author: trusted,
    });
    expect(verdict.status).toBe("PENDING");
    expect(verdict.reason).toBe("text:contact-number");
  });
});
