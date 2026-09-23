import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Page-drawn replacements for the browser's native dialogs.
 *
 * Native `confirm` / `alert` / `prompt` are not safe to rely on: embedded browsers (the desktop
 * app's built-in pane, in-app webviews) suppress them and `confirm()` returns false at once, so a
 * guarded Delete or Send button silently does nothing there. These three are drawn by the page and
 * resolve the same way:
 *
 *   if (!(await confirmAction("Delete?"))) return;
 *   const reason = await promptAction("Reason?");   // string, or null when cancelled
 *   void alertAction("Something went wrong");
 *
 * `scripts/check-architecture.mjs` fails the build if a native dialog appears in this app.
 */

interface DialogOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type Spec =
  | { kind: "confirm"; message: string; options: DialogOptions }
  | { kind: "alert"; message: string; options: DialogOptions }
  | { kind: "prompt"; message: string; defaultValue: string; options: DialogOptions };

function open<T>(spec: Spec, cancelled: T): Promise<T | string | boolean> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    function close(result: string | boolean | null) {
      root.unmount();
      host.remove();
      resolve(result === null ? cancelled : result);
    }

    root.render(<Dialog spec={spec} onClose={close} />);
  });
}

export function confirmAction(message: string, options: DialogOptions = {}): Promise<boolean> {
  return open<boolean>({ kind: "confirm", message, options }, false) as Promise<boolean>;
}

/** Tells the person something. Resolves when they dismiss it; callers usually `void` it. */
export function alertAction(message: string, options: DialogOptions = {}): Promise<void> {
  return open<boolean>({ kind: "alert", message, options }, false).then(() => undefined);
}

/** Asks for a line of text. Resolves to the text, or null when the person cancels. */
export function promptAction(message: string, defaultValue = "", options: DialogOptions = {}): Promise<string | null> {
  return open<null>({ kind: "prompt", message, defaultValue, options }, null) as Promise<string | null>;
}

function Dialog({ spec, onClose }: { spec: Spec; onClose: (result: string | boolean | null) => void }) {
  const [text, setText] = useState(spec.kind === "prompt" ? spec.defaultValue : "");
  const { options } = spec;

  const cancel = () => onClose(spec.kind === "confirm" ? false : null);
  const accept = () => onClose(spec.kind === "prompt" ? text : true);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") cancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
    >
      <div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-xl2 bg-white p-5 shadow-xl">
        <p className="whitespace-pre-line text-sm text-slate-800">{spec.message}</p>
        {spec.kind === "prompt" && (
          <Input
            autoFocus
            className="mt-3"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") accept();
            }}
          />
        )}
        <div className="mt-5 flex justify-end gap-2">
          {spec.kind !== "alert" && (
            <Button variant="ghost" onClick={cancel}>
              {options.cancelLabel ?? "Отмена"}
            </Button>
          )}
          <Button autoFocus={spec.kind !== "prompt"} variant={options.danger ? "danger" : "primary"} onClick={accept}>
            {options.confirmLabel ?? (spec.kind === "alert" ? "Понятно" : spec.kind === "prompt" ? "OK" : "Подтвердить")}
          </Button>
        </div>
      </div>
    </div>
  );
}
