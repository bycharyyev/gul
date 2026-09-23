import { TemplateRenderError, render, validateTemplateSource } from "./template-renderer";

describe("template renderer", () => {
  describe("substitution", () => {
    it("replaces a dotted path from nested variables", () => {
      expect(render("Здравствуйте, {{user.firstName}}!", { user: { firstName: "Aman" } }, false)).toBe(
        "Здравствуйте, Aman!",
      );
    });

    it("HTML-escapes substituted values when rendering the HTML part", () => {
      const out = render("<p>{{user.firstName}}</p>", { user: { firstName: "<script>x</script>" } }, true);
      expect(out).toBe("<p>&lt;script&gt;x&lt;/script&gt;</p>");
    });

    it("does NOT escape when rendering the plain-text part", () => {
      expect(render("{{message.body}}", { message: { body: "a & b" } }, false)).toBe("a & b");
    });
  });

  describe("failing before SMTP", () => {
    it("throws rather than mailing a literal placeholder when a variable is missing", () => {
      expect(() => render("Привет, {{user.firstName}}", {}, false)).toThrow(TemplateRenderError);
    });

    it("treats an empty string as missing -- a blank greeting is still a broken email", () => {
      expect(() => render("Привет, {{user.firstName}}", { user: { firstName: "" } }, false)).toThrow(
        /Missing template variable/,
      );
    });
  });

  describe("safety", () => {
    it("rejects anything that looks like a call instead of silently ignoring it", () => {
      expect(() => render("{{ executeSomething() }}", {}, false)).toThrow(/Unsupported template expression/);
    });

    it("cannot reach through the prototype chain", () => {
      expect(() => render("{{constructor.name}}", { user: {} }, false)).toThrow(/Missing template variable/);
      expect(() => render("{{__proto__.x}}", { user: {} }, false)).toThrow(/Missing template variable/);
    });
  });

  describe("presence sections", () => {
    it("keeps the block when the value is present", () => {
      const out = render("A{{#order.note}} [{{order.note}}]{{/order.note}}B", { order: { note: "hi" } }, false);
      expect(out).toBe("A [hi]B");
    });

    it("drops the block, and does not report a missing variable, when the value is absent", () => {
      const out = render("A{{#order.note}} [{{order.note}}]{{/order.note}}B", { order: { note: null } }, false);
      expect(out).toBe("AB");
    });
  });

  describe("validateTemplateSource", () => {
    it("flags a variable the kind does not provide", () => {
      expect(validateTemplateSource("{{user.secret}}", ["user.firstName"])).toEqual([
        "Unknown variable: {{user.secret}}",
      ]);
    });

    it("accepts a template that only uses allowed variables", () => {
      expect(validateTemplateSource("Hi {{user.firstName}}", ["user.firstName"])).toEqual([]);
    });
  });
});
