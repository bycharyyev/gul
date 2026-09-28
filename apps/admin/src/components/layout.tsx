import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, UserCircle, X } from "lucide-react";
import { LanguageSwitcher, useTranslation } from "@topup-hub/i18n";
import { api, getCurrentUser, USER_UPDATED_EVENT } from "@/lib/api";
import { NotificationProvider, useNotifications } from "@/lib/notifications-context";
import { useNavGroups } from "./nav-config";
import { CommandPalette } from "./command-palette";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <NotificationProvider>
      <LayoutChrome>{children}</LayoutChrome>
    </NotificationProvider>
  );
}

// Per-browser preferences. Storage can be unavailable (private mode, blocked site data), so every
// read and write tolerates failure and falls back to the default.
function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* preference simply isn't remembered */
  }
}

const COLLAPSED_KEY = "gulyaly.admin.sidebar-collapsed";
const CLOSED_GROUPS_KEY = "gulyaly.admin.nav-closed-groups";

function NavBadge({ count, compact }: { count: number; compact: boolean }) {
  if (count === 0) return null;
  if (compact) {
    return <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" aria-label={String(count)} />;
  }
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-semibold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function LayoutChrome({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const groups = useNavGroups();
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(getCurrentUser());
  const [now, setNow] = useState(() => new Date());
  const [collapsed, setCollapsed] = useState(() => readPref(COLLAPSED_KEY, false));
  const [closedGroups, setClosedGroups] = useState<string[]>(() => readPref(CLOSED_GROUPS_KEY, []));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { pendingOrdersCount, unreadChatCount } = useNotifications();

  useEffect(() => {
    const onUserUpdated = () => setUser(getCurrentUser());
    window.addEventListener(USER_UPDATED_EVENT, onUserUpdated);
    return () => window.removeEventListener(USER_UPDATED_EVENT, onUserUpdated);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A tap on a link in the phone drawer should leave the drawer, not the page, on screen.
  useEffect(() => setMobileOpen(false), [location.pathname]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      writePref(COLLAPSED_KEY, !c);
      return !c;
    });
  }

  function toggleGroup(id: string) {
    setClosedGroups((prev) => {
      const next = prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id];
      writePref(CLOSED_GROUPS_KEY, next);
      return next;
    });
  }

  function isActive(to: string) {
    return to === "/" ? location.pathname === "/" : location.pathname === to || location.pathname.startsWith(`${to}/`);
  }

  function logout() {
    api.logout();
    navigate("/login");
  }

  function badgeFor(to: string) {
    if (to === "/orders") return pendingOrdersCount;
    if (to === "/support") return unreadChatCount;
    return 0;
  }

  // The drawer on phones always shows labels; only the desktop rail collapses to icons.
  const compact = collapsed && !mobileOpen;

  const sidebar = (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 ${
        compact ? "w-16" : "w-64"
      }`}
    >
      <div className={`flex shrink-0 items-center gap-2 border-b border-slate-100 py-4 ${compact ? "justify-center px-2" : "px-5"}`}>
        <img src="/brand/gulyaly.svg" alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full" />
        {!compact && <span className="text-gradient text-lg font-extrabold">Gulyaly</span>}
        {mobileOpen && (
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label={t("admin.shell.closeMenu")}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Independently scrollable: the nav alone can exceed the viewport; the logo above and the
          account block below stay put. */}
      <nav className={`min-h-0 flex-1 overflow-y-auto py-3 ${compact ? "px-2" : "px-3"}`} aria-label={t("admin.shell.mainNav")}>
        {groups.map((group, gi) => {
          const holdsActive = group.items.some((item) => isActive(item.to));
          // The group with the open page never folds away, or the highlighted row would vanish.
          const open = holdsActive || !closedGroups.includes(group.id);
          return (
            <div key={group.id} className={gi > 0 ? "mt-3" : ""}>
              {compact ? (
                gi > 0 && <div className="mx-2 mb-3 border-t border-slate-100" />
              ) : (
                <button
                  onClick={() => toggleGroup(group.id)}
                  disabled={holdsActive}
                  aria-expanded={open}
                  className="mb-1 flex w-full items-center justify-between rounded px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600 disabled:cursor-default disabled:hover:text-slate-400"
                >
                  {group.label}
                  {!holdsActive && (
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden="true" />
                  )}
                </button>
              )}
              {(open || compact) && (
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/"}
                      title={compact ? item.label : undefined}
                      className={({ isActive: active }) =>
                        `relative flex items-center gap-2.5 rounded-lg py-2 text-sm font-medium ${
                          compact ? "justify-center px-2" : "px-3"
                        } ${active ? "bg-gradient-brand-soft text-brand-700" : "text-slate-600 hover:bg-slate-50"}`
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {!compact && <span className="truncate">{item.label}</span>}
                      <NavBadge count={badgeFor(item.to)} compact={compact} />
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className={`shrink-0 border-t border-slate-200 pb-4 pt-3 ${compact ? "px-2" : "px-3"}`}>
        <NavLink
          to="/account"
          title={compact ? t("admin.nav.myAccount") : undefined}
          className={({ isActive: active }) =>
            `flex items-center gap-2.5 rounded-lg py-2 text-sm font-medium ${compact ? "justify-center px-2" : "px-3"} ${
              active ? "bg-gradient-brand-soft text-brand-700" : "text-slate-600 hover:bg-slate-50"
            }`
          }
        >
          <UserCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!compact && <span className="truncate">{user?.fullName || user?.phone || t("admin.nav.myAccount")}</span>}
        </NavLink>
        <button
          onClick={logout}
          title={compact ? t("admin.nav.logout") : undefined}
          className={`mt-1 flex w-full items-center gap-2.5 rounded-lg py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-50 ${
            compact ? "justify-center px-2" : "px-3"
          }`}
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!compact && t("admin.nav.logout")}
        </button>
        {!compact && (
          <LanguageSwitcher className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600" />
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden lg:flex">{sidebar}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div className="relative flex h-full">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 lg:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label={t("admin.shell.openMenu")}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            onClick={toggleCollapsed}
            className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:block"
            aria-label={collapsed ? t("admin.shell.expandSidebar") : t("admin.shell.collapseSidebar")}
            title={collapsed ? t("admin.shell.expandSidebar") : t("admin.shell.collapseSidebar")}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" aria-hidden="true" /> : <PanelLeftClose className="h-5 w-5" aria-hidden="true" />}
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 min-w-0 max-w-xs flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-400 hover:border-slate-300"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{t("admin.shell.searchButton")}</span>
            <kbd className="ml-auto hidden rounded border border-slate-200 px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
          </button>
          <p className="ml-auto hidden text-xs font-medium tabular-nums text-slate-400 sm:block">
            {now.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" })} ·{" "}
            {now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto bg-slate-50 p-4 lg:p-8">{children}</main>
      </div>

      <CommandPalette groups={groups} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
