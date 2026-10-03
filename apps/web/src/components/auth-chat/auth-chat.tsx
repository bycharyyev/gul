"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowCounterClockwise, Eye, EyeSlash, PaperPlaneRight } from "@phosphor-icons/react/dist/ssr";
import { ApiError } from "@topup-hub/api-client";
import { useTranslation, translateError } from "@topup-hub/i18n";
import { api } from "@/lib/api";
import { clearStoredReferral, getStoredReferral } from "@/lib/referral";
import { safeNext } from "@/lib/safe-next";

/**
 * Sign-in, sign-up and password reset as one conversation: one question per message, answers
 * typed into a single input or picked from chips. It drives exactly the same API calls as the
 * classic forms (`/auth/login`, `/auth/register` + `/confirm`, `/auth/password-reset/*`), so the
 * server side has nothing chat-specific in it.
 *
 * "Have you been here before?" is asked rather than inferred from the address: deciding it from
 * the email would need an endpoint that tells anyone whether an address has an account.
 */

type Step =
  | "mode"
  | "login.email"
  | "login.password"
  | "forgot.code"
  | "forgot.password"
  | "reg.name"
  | "reg.email"
  | "reg.password"
  | "reg.referral"
  | "reg.code"
  | "busy"
  | "done";

interface Message {
  id: number;
  from: "bot" | "me";
  text: string;
  tone?: "error" | "success";
}

interface Chip {
  label: string;
  run: () => void;
}

interface Draft {
  email: string;
  password: string;
  name: string;
  referral: string;
  code: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MASK = "••••••••";

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function AuthChat({ start }: { start: "register" | "ask" }) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [chips, setChips] = useState<Chip[]>([]);
  const [step, setStep] = useState<Step>("busy");
  const [typing, setTyping] = useState(false);
  const [value, setValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const draft = useRef<Draft>({ email: "", password: "", name: "", referral: "", code: "" });
  const nextId = useRef(1);
  // Bumped on restart: a reply still "typing" from the previous conversation must not land in the new one.
  const session = useRef(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const push = useCallback((from: Message["from"], text: string, tone?: Message["tone"]) => {
    // An answer leaves the input as soon as it is in the conversation: a password must not linger
    // in the field while the request runs.
    if (from === "me") setValue("");
    setMessages((m) => [...m, { id: nextId.current++, from, text, tone }]);
  }, []);

  /** Bot lines, each after a short "typing" pause so the conversation reads at a human pace. */
  const say = useCallback(
    async (...lines: (string | { text: string; tone: Message["tone"] })[]) => {
      const mine = session.current;
      const pause = reducedMotion() ? 0 : 420;
      for (const line of lines) {
        setTyping(true);
        await new Promise((r) => setTimeout(r, pause));
        if (session.current !== mine) return false;
        setTyping(false);
        if (typeof line === "string") push("bot", line);
        else push("bot", line.text, line.tone);
      }
      return session.current === mine;
    },
    [push],
  );

  const ask = useCallback((next: Step, nextChips: Chip[] = []) => {
    setValue("");
    setInputError(null);
    setReveal(false);
    setChips(nextChips);
    setStep(next);
  }, []);

  const errorText = useCallback(
    (err: unknown) => (err instanceof ApiError ? translateError(t, err.message) : t("authChat.err.generic")),
    [t],
  );

  // ---- flows ----

  const askMode = useCallback(async () => {
    if (!(await say(t("authChat.askMode")))) return;
    ask("mode", [
      { label: t("authChat.chipLogin"), run: () => choose(t("authChat.chipLogin"), beginLogin) },
      { label: t("authChat.chipRegister"), run: () => choose(t("authChat.chipRegister"), beginRegister) },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [say, ask, t]);

  function choose(label: string, then: () => void) {
    setChips([]);
    push("me", label);
    then();
  }

  async function beginLogin() {
    setStep("busy");
    if (await say(t("authChat.login.askEmail"))) ask("login.email");
  }

  async function beginRegister() {
    setStep("busy");
    if (await say(t("authChat.register.askName")))
      ask("reg.name", [{ label: t("authChat.chipSkip"), run: () => choose(t("authChat.chipSkip"), () => afterName("")) }]);
  }

  async function afterName(name: string) {
    draft.current.name = name;
    setStep("busy");
    const lines = name ? [t("authChat.register.nice", { name }), t("authChat.register.askEmail")] : [t("authChat.register.askEmail")];
    if (await say(...lines)) ask("reg.email");
  }

  async function askReferral() {
    setStep("busy");
    const stored = getStoredReferral();
    if (stored?.code) {
      draft.current.referral = stored.code;
      if (await say(t("authChat.register.referralKnown", { code: stored.code }))) void startRegistration();
      return;
    }
    if (await say(t("authChat.register.askReferral")))
      ask("reg.referral", [{ label: t("authChat.chipNoCode"), run: () => choose(t("authChat.chipNoCode"), () => void startRegistration()) }]);
  }

  async function startRegistration() {
    setStep("busy");
    setTyping(true);
    const stored = getStoredReferral();
    try {
      const started = await api.register({
        email: draft.current.email,
        password: draft.current.password,
        fullName: draft.current.name || undefined,
        locale,
        referredByUsername: draft.current.referral || undefined,
        utmSource: stored?.utmSource,
        utmMedium: stored?.utmMedium,
        utmCampaign: stored?.utmCampaign,
        referrerUrl: stored?.referrerUrl,
      });
      setTyping(false);
      if (
        await say(
          t("authChat.register.sent", { email: started.email, minutes: String(started.expiresInMinutes) }),
          t("authChat.register.askCode"),
        )
      )
        ask("reg.code", codeChips());
    } catch (err) {
      setTyping(false);
      if (err instanceof ApiError && err.status === 409) {
        if (await say({ text: t("authChat.register.emailTaken"), tone: "error" }))
          ask("busy", [
            { label: t("authChat.chipLoginInstead"), run: () => choose(t("authChat.chipLoginInstead"), loginWithKnownEmail) },
            { label: t("authChat.chipOtherEmail"), run: () => choose(t("authChat.chipOtherEmail"), reaskRegEmail) },
          ]);
        return;
      }
      if (await say({ text: errorText(err), tone: "error" })) reaskRegEmail();
    }
  }

  function codeChips(): Chip[] {
    return [
      { label: t("authChat.chipResend"), run: () => choose(t("authChat.chipResend"), () => void startRegistration()) },
      { label: t("authChat.chipOtherEmail"), run: () => choose(t("authChat.chipOtherEmail"), reaskRegEmail) },
    ];
  }

  async function reaskRegEmail() {
    setStep("busy");
    if (await say(t("authChat.register.askEmail"))) ask("reg.email");
  }

  async function loginWithKnownEmail() {
    setStep("busy");
    if (await say(t("authChat.login.askPassword"))) ask("login.password", loginChips());
  }

  function loginChips(): Chip[] {
    return [{ label: t("authChat.chipForgot"), run: () => choose(t("authChat.chipForgot"), () => void beginForgot()) }];
  }

  async function confirmRegistration() {
    setStep("busy");
    setTyping(true);
    try {
      await api.confirmRegistration({ email: draft.current.email, code: draft.current.code });
      setTyping(false);
      clearStoredReferral();
      await say({ text: t("authChat.register.done"), tone: "success" });
      setStep("done");
      router.push("/account");
    } catch (err) {
      setTyping(false);
      if (await say({ text: errorText(err), tone: "error" })) ask("reg.code", codeChips());
    }
  }

  async function login() {
    setStep("busy");
    setTyping(true);
    try {
      await api.login({ email: draft.current.email, password: draft.current.password });
      setTyping(false);
      await say({ text: t("authChat.login.welcome"), tone: "success" });
      setStep("done");
      router.push(safeNext() ?? "/account");
    } catch (err) {
      setTyping(false);
      if (await say({ text: errorText(err), tone: "error" }, t("authChat.login.retry")))
        ask("busy", [
          { label: t("authChat.chipPasswordAgain"), run: () => choose(t("authChat.chipPasswordAgain"), loginWithKnownEmail) },
          { label: t("authChat.chipForgot"), run: () => choose(t("authChat.chipForgot"), () => void beginForgot()) },
          { label: t("authChat.chipOtherEmail"), run: () => choose(t("authChat.chipOtherEmail"), beginLogin) },
          { label: t("authChat.chipCreate"), run: () => choose(t("authChat.chipCreate"), beginRegister) },
        ]);
    }
  }

  async function beginForgot() {
    setStep("busy");
    setTyping(true);
    try {
      const { expiresInMinutes } = await api.requestPasswordReset(draft.current.email);
      setTyping(false);
      if (await say(t("authChat.forgot.sent", { minutes: String(expiresInMinutes) }), t("authChat.forgot.askCode")))
        ask("forgot.code");
    } catch (err) {
      setTyping(false);
      if (await say({ text: errorText(err), tone: "error" })) ask("busy", loginChips());
    }
  }

  async function resetPassword() {
    setStep("busy");
    setTyping(true);
    try {
      await api.confirmPasswordReset({
        email: draft.current.email,
        code: draft.current.code,
        newPassword: draft.current.password,
      });
      setTyping(false);
      if (await say(t("authChat.forgot.done"))) await login();
    } catch (err) {
      setTyping(false);
      if (await say({ text: errorText(err), tone: "error" }, t("authChat.forgot.askCode"))) ask("forgot.code");
    }
  }

  // ---- input ----

  function submit() {
    const raw = value;
    const v = raw.trim();
    switch (step) {
      case "login.email":
      case "reg.email": {
        const email = v.toLowerCase();
        if (!EMAIL_RE.test(email)) return setInputError(t("authChat.err.email"));
        draft.current.email = email;
        push("me", email);
        setStep("busy");
        if (step === "login.email") void say(t("authChat.login.askPassword")).then((ok) => ok && ask("login.password", loginChips()));
        else void say(t("authChat.register.askPassword")).then((ok) => ok && ask("reg.password"));
        return;
      }
      case "login.password":
        if (!raw) return setInputError(t("authChat.err.passwordEmpty"));
        draft.current.password = raw;
        push("me", MASK);
        void login();
        return;
      case "reg.password":
      case "forgot.password":
        if (raw.length < 8 || raw.length > 72) return setInputError(t("authChat.err.password"));
        draft.current.password = raw;
        push("me", MASK);
        if (step === "reg.password") void askReferral();
        else void resetPassword();
        return;
      case "reg.name":
        if (v.length > 120) return setInputError(t("authChat.err.name"));
        push("me", v || t("authChat.chipSkip"));
        void afterName(v);
        return;
      case "reg.referral":
        if (v.length < 2 || v.length > 32) return setInputError(t("authChat.err.referral"));
        draft.current.referral = v;
        push("me", v);
        void startRegistration();
        return;
      case "reg.code":
      case "forgot.code":
        if (!/^\d{6}$/.test(v)) return setInputError(t("authChat.err.code"));
        draft.current.code = v;
        push("me", v);
        if (step === "reg.code") void confirmRegistration();
        else {
          setStep("busy");
          void say(t("authChat.forgot.askPassword")).then((ok) => ok && ask("forgot.password"));
        }
        return;
    }
  }

  const restart = useCallback(async () => {
    session.current += 1;
    draft.current = { email: "", password: "", name: "", referral: "", code: "" };
    setMessages([]);
    setChips([]);
    setTyping(false);
    setStep("busy");
    if (!(await say(t("authChat.hello")))) return;
    if (start === "register") {
      if (await say(t("authChat.register.askName")))
        ask("reg.name", [{ label: t("authChat.chipSkip"), run: () => choose(t("authChat.chipSkip"), () => afterName("")) }]);
    } else {
      void askMode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [say, ask, t, start, askMode]);

  useEffect(() => {
    void restart();
    // Once per mount; the language switcher changes the next messages, not the conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [messages, typing, chips]);

  const accepting = step !== "mode" && step !== "busy" && step !== "done";
  useEffect(() => {
    if (accepting) inputRef.current?.focus({ preventScroll: true });
  }, [accepting, step]);

  const isPassword = step === "login.password" || step === "reg.password" || step === "forgot.password";
  const isCode = step === "reg.code" || step === "forgot.code";
  const isEmail = step === "login.email" || step === "reg.email";
  const placeholder = !accepting
    ? t("authChat.ph.chips")
    : isPassword
      ? t("authChat.ph.password")
      : isCode
        ? t("authChat.ph.code")
        : isEmail
          ? t("authChat.ph.email")
          : step === "reg.name"
            ? t("authChat.ph.name")
            : t("authChat.ph.referral");
  const autoComplete = isEmail
    ? "email"
    : step === "login.password"
      ? "current-password"
      : isPassword
        ? "new-password"
        : isCode
          ? "one-time-code"
          : step === "reg.name"
            ? "name"
            : "off";

  return (
    <div className="crystal-panel flex h-[min(680px,calc(100dvh-7rem))] flex-col overflow-hidden rounded-[28px]">
      <header className="flex items-center gap-3 border-b border-brand-100/70 px-5 py-4 dark:border-white/10">
        <div className="crystal-gem relative h-11 w-11 shrink-0 rotate-45 rounded-[12px]" aria-hidden="true">
          <span className="absolute inset-0 flex -rotate-45 items-center justify-center text-base font-bold text-white">G</span>
        </div>
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{t("authChat.name")}</p>
          <p className="flex items-center gap-1.5 text-xs text-accent-600 dark:text-accent-400">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden="true" />
            {typing ? t("authChat.typing") : t("authChat.online")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void restart()}
          className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-slate-500 transition hover:bg-brand-50 hover:text-brand-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-brand-300"
        >
          <ArrowCounterClockwise size={16} aria-hidden="true" />
          {t("authChat.restart")}
        </button>
      </header>

      <div ref={feedRef} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-5" aria-live="polite" aria-relevant="additions">
        {messages.map((m) => (
          <div key={m.id} className={`crystal-in flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
            <p
              className={
                m.from === "me"
                  ? "crystal-bubble-me max-w-[80%] rounded-[20px] rounded-br-md px-4 py-2.5 text-[15px] leading-snug text-white"
                  : m.tone === "error"
                    ? "crystal-bubble-error max-w-[85%] rounded-[20px] rounded-bl-md px-4 py-2.5 text-[15px] leading-snug text-rose-700 dark:text-rose-300"
                    : `crystal-bubble-bot max-w-[85%] rounded-[20px] rounded-bl-md px-4 py-2.5 text-[15px] leading-snug ${
                        m.tone === "success" ? "text-accent-600 dark:text-accent-400" : "text-slate-800 dark:text-slate-100"
                      }`
              }
            >
              {m.text}
            </p>
          </div>
        ))}
        {typing && (
          <div className="crystal-in flex justify-start" aria-hidden="true">
            <span className="crystal-bubble-bot inline-flex gap-1 rounded-[20px] rounded-bl-md px-4 py-3.5">
              {[0, 150, 300].map((d) => (
                <span key={d} className="crystal-dot h-1.5 w-1.5 rounded-full bg-brand-400" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          </div>
        )}
        {chips.length > 0 && !typing && (
          <div className="crystal-in flex flex-wrap gap-2 pt-1">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={c.run}
                className="min-h-[44px] rounded-full border border-brand-200 bg-white px-4 text-sm font-medium text-brand-700 transition hover:border-brand-400 hover:bg-brand-50 active:scale-[0.98] dark:border-brand-400/30 dark:bg-white/5 dark:text-brand-200 dark:hover:bg-brand-500/10"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        className="border-t border-brand-100/70 px-4 pb-4 pt-3 dark:border-white/10"
        onSubmit={(e) => {
          e.preventDefault();
          if (accepting) submit();
        }}
      >
        {inputError && (
          <p id="auth-chat-error" role="alert" className="mb-2 px-2 text-sm text-rose-600 dark:text-rose-400">
            {inputError}
          </p>
        )}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => {
                setInputError(null);
                setValue(isCode ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value);
              }}
              disabled={!accepting}
              type={isPassword && !reveal ? "password" : isEmail ? "email" : "text"}
              inputMode={isCode ? "numeric" : isEmail ? "email" : undefined}
              autoComplete={autoComplete}
              autoCapitalize={isEmail || isPassword || step === "reg.referral" ? "off" : undefined}
              autoCorrect="off"
              spellCheck={false}
              placeholder={placeholder}
              aria-label={placeholder}
              aria-invalid={inputError ? true : undefined}
              aria-describedby={inputError ? "auth-chat-error" : undefined}
              className="h-12 w-full rounded-full border border-brand-100 bg-white px-5 pr-12 text-base outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/15 disabled:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:disabled:bg-white/[0.02]"
            />
            {isPassword && (
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? t("authChat.hidePassword") : t("authChat.showPassword")}
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:text-brand-600"
              >
                {reveal ? <EyeSlash size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!accepting}
            aria-label={t("authChat.send")}
            className="crystal-gem flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition active:scale-95 disabled:opacity-40"
          >
            <PaperPlaneRight size={20} weight="fill" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}
