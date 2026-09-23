import { NavLink } from "react-router-dom";

const links = [["/cargo/purchases/review", "Проверка"], ["/cargo/purchases/orders", "Заказы"], ["/cargo/purchases/settings", "Источники и правила"]] as const;
export function MarketplacePurchaseNav() { return <nav aria-label="Раздел выкупа" className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">{links.map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}>{label}</NavLink>)}</nav>; }
