import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";

/**
 * An in-page replacement for `window.confirm`.
 *
 * The native dialog is not a safe way to guard a destructive action: embedded browsers (the
 * desktop app's built-in pane, some in-app webviews) suppress it and `confirm()` returns false at
 * once, so every "Delete" button silently does nothing. This one is drawn by the page itself and
 * resolves to true/false the same way, so call sites read `if (!(await confirmAction(...))) return;`.
 */
export function confirmAction(
  message: string,
  options: { confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    function close(result: boolean) {
      root.unmount();
      host.remove();
      resolve(result);
    }

    root.render(<ConfirmDialog message={message} options={options} onClose={close} />);
  });
}

function ConfirmDialog({
  message,
  options,
  onClose,
}: {
  message: string;
  options: { confirmLabel?: string; cancelLabel?: string; danger?: boolean };
  onClose: (result: boolean) => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose(false);
      }}
    >
      <div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-xl2 bg-white p-5 shadow-xl">
        <p className="whitespace-pre-line text-sm text-slate-800">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onClose(false)}>
            {options.cancelLabel ?? "Отмена"}
          </Button>
          <Button autoFocus variant={options.danger ? "danger" : "primary"} onClick={() => onClose(true)}>
            {options.confirmLabel ?? "Подтвердить"}
          </Button>
        </div>
      </div>
    </div>
  );
}
