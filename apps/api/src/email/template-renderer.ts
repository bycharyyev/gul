/**
 * A deliberately tiny, non-programmable template language: `{{ dotted.path }}` and nothing else.
 *
 * Templates are editable from the admin panel, so anything resembling an expression evaluator
 * would be a remote-code-execution hole for anyone who reaches that screen. There is no
 * conditional, no loop, and no function call syntax -- `{{ doSomething() }}` does not parse as a
 * placeholder and is rejected outright rather than silently ignored.
 */

const PATH = "[a-zA-Z_][a-zA-Z0-9_]*(?:\\.[a-zA-Z_][a-zA-Z0-9_]*)*";

/** Matches a placeholder whose body is a plain dotted identifier path. */
const PLACEHOLDER = new RegExp(`\\{\\{\\s*(${PATH})\\s*\\}\\}`, "g");

/**
 * Presence-only section: `{{#order.deliveryNote}}...{{/order.deliveryNote}}` keeps the inner
 * block when the path holds a non-empty value and drops it otherwise.
 *
 * This is the single exception to "placeholders only", and it exists because some real content
 * is genuinely optional -- a completed order may or may not carry a delivery note, and emitting
 * an empty callout box for the ones that don't is worse than not emitting it. It is a presence
 * test over a fixed path, not an expression: there is no `else`, no comparison, no negation and
 * no iteration, so it adds no way to make the template compute anything.
 */
const SECTION = new RegExp(`\\{\\{#\\s*(${PATH})\\s*\\}\\}([\\s\\S]*?)\\{\\{/\\s*\\1\\s*\\}\\}`, "g");

/** Matches any `{{ ... }}` at all, so we can spot the ones the strict patterns refused. */
const ANY_PLACEHOLDER = /\{\{([^}]*)\}\}/g;

export class TemplateRenderError extends Error {}

export type TemplateVariables = Record<string, unknown>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Resolves "order.amountTmt" against a nested object. Only own properties are followed, so a
 * template can never reach `constructor`, `__proto__` or anything else off the prototype chain.
 */
function lookup(vars: TemplateVariables, path: string): unknown {
  let current: unknown = vars;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Whether a value counts as "present" for a section, and as satisfying a required variable. */
function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/** Every distinct path used by a template body, including the ones guarding a section. */
export function extractVariables(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(SECTION)) found.add(match[1]);
  for (const match of source.matchAll(PLACEHOLDER)) found.add(match[1]);
  return [...found];
}

/**
 * Placeholders that are syntactically neither a plain dotted path nor a section marker --
 * `{{ run() }}`, `{{ a b }}`, `{{ #if x }}`. Surfaced as a validation error rather than being
 * left in the output, where they would ship to a real recipient as literal braces.
 */
export function findUnsafeExpressions(source: string): string[] {
  const pathOnly = new RegExp(`^${PATH}$`);
  const sectionMarker = new RegExp(`^[#/]\\s*${PATH}$`);
  const unsafe: string[] = [];
  for (const match of source.matchAll(ANY_PLACEHOLDER)) {
    const body = match[1].trim();
    if (!pathOnly.test(body) && !sectionMarker.test(body)) unsafe.push(match[0]);
  }
  return unsafe;
}

/**
 * Substitutes every placeholder, throwing if any resolves to nothing.
 *
 * Failing here is the point: it happens before the message reaches SMTP, so a template with a
 * typo'd variable produces an alertable error instead of mailing a customer a literal
 * "Здравствуйте, {{user.firstName}}".
 *
 * @param escape HTML-escape substituted values. On for the HTML body, off for text/plain --
 *   escaping there would render `&amp;` as visible text.
 */
export function render(source: string, vars: TemplateVariables, escape: boolean): string {
  const unsafe = findUnsafeExpressions(source);
  if (unsafe.length > 0) {
    throw new TemplateRenderError(`Unsupported template expression(s): ${unsafe.join(", ")}`);
  }

  // Sections first: a placeholder inside a dropped section must not be reported as missing,
  // since nothing will render it.
  const withSections = source.replace(SECTION, (_full, path: string, inner: string) =>
    isPresent(lookup(vars, path)) ? inner : "",
  );

  const missing: string[] = [];
  const output = withSections.replace(PLACEHOLDER, (_full, path: string) => {
    const value = lookup(vars, path);
    if (!isPresent(value)) {
      missing.push(path);
      return "";
    }
    return escape ? escapeHtml(String(value)) : String(value);
  });

  if (missing.length > 0) {
    throw new TemplateRenderError(`Missing template variable(s): ${[...new Set(missing)].join(", ")}`);
  }
  return output;
}

/**
 * Static check used by the admin template editor and by the seed linter: does this template only
 * reference variables the kind actually provides, and does it avoid unsupported syntax?
 * Returns the problems rather than throwing, so an editor can show them all at once.
 */
export function validateTemplateSource(
  source: string,
  allowedVariables: readonly string[],
  optionalVariables: readonly string[] = [],
): string[] {
  const problems = findUnsafeExpressions(source).map((expr) => `Unsupported expression: ${expr}`);
  const allowed = new Set([...allowedVariables, ...optionalVariables]);
  for (const used of extractVariables(source)) {
    if (!allowed.has(used)) problems.push(`Unknown variable: {{${used}}}`);
  }
  return problems;
}
