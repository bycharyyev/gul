import { DEFAULT_TEMPLATES } from "./default-templates";
import { EMAIL_KINDS, EMAIL_LOCALES } from "./email-kinds";
import { sampleVariables } from "./email-template.service";
import { render, validateTemplateSource } from "./template-renderer";

/**
 * Lints the seed templates. These ship as the ACTIVE content on a fresh database, so a typo'd
 * variable here would break real mail on first send -- catching it at build time is the point.
 */
describe("default email templates", () => {
  it.each(DEFAULT_TEMPLATES.map((t) => [`${t.kind}/${t.locale}`, t] as const))(
    "%s only references variables its kind declares",
    (_label, template) => {
      const allowed = EMAIL_KINDS[template.kind].variables;
      for (const [part, source] of [
        ["subject", template.subject],
        ["html", template.html],
        ["text", template.text],
      ] as const) {
        expect({ part, problems: validateTemplateSource(source, allowed) }).toEqual({ part, problems: [] });
      }
    },
  );

  it.each(DEFAULT_TEMPLATES.map((t) => [`${t.kind}/${t.locale}`, t] as const))(
    "%s renders against sample data without throwing",
    (_label, template) => {
      const vars = sampleVariables(template.kind);
      expect(() => render(template.subject, vars, false)).not.toThrow();
      expect(() => render(template.html, vars, true)).not.toThrow();
      expect(() => render(template.text, vars, false)).not.toThrow();
    },
  );

  it("renders order mail even when the optional note and reason are absent", () => {
    const order = {
      id: "o1",
      serviceName: "TMCELL",
      recipientIdentifier: "+99361234567",
      amountTmt: "10",
      amountCharged: "0.62",
      currency: "USD",
      deliveryNote: null,
      failureReason: null,
    };
    for (const template of DEFAULT_TEMPLATES.filter((t) => t.kind.startsWith("ORDER_"))) {
      expect(() => render(template.html, { order }, true)).not.toThrow();
      expect(() => render(template.text, { order }, false)).not.toThrow();
    }
  });

  it("ships every seeded kind in all three locales, so no user falls back by default", () => {
    const byKind = new Map<string, Set<string>>();
    for (const t of DEFAULT_TEMPLATES) {
      if (!byKind.has(t.kind)) byKind.set(t.kind, new Set());
      byKind.get(t.kind)!.add(t.locale);
    }
    for (const [kind, locales] of byKind) {
      expect({ kind, locales: [...locales].sort() }).toEqual({ kind, locales: [...EMAIL_LOCALES].sort() });
    }
  });

  it("gives every template a plain-text part (HTML-only mail is a spam signal)", () => {
    for (const template of DEFAULT_TEMPLATES) {
      expect(template.text.trim().length).toBeGreaterThan(20);
      expect(template.text).not.toContain("<");
    }
  });

  it("includes a preheader on every template", () => {
    for (const template of DEFAULT_TEMPLATES) {
      expect(template.preheader.trim()).not.toBe("");
    }
  });

  /**
   * Guards the invariant that broke once: sample data used to be a hand-maintained object, so
   * adding a variable to a kind left the preview missing it and the template failed to render.
   * Deriving samples from the declaration should make that impossible -- for every kind, not
   * only the ones that happen to have a seeded template.
   */
  it("provides sample data for every variable of every declared kind", () => {
    for (const [kind, spec] of Object.entries(EMAIL_KINDS)) {
      const vars = sampleVariables(kind as keyof typeof EMAIL_KINDS);
      for (const path of spec.variables) {
        const [root, leaf] = path.split(".");
        const value = leaf ? (vars[root] as Record<string, unknown> | undefined)?.[leaf] : vars[root];
        expect({ kind, path, value }).toEqual({ kind, path, value: expect.anything() });
      }
    }
  });
});
