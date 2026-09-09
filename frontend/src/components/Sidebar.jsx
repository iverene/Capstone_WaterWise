import { useEffect, useRef, useState } from "react";
import {
  FiChevronLeft,
  FiChevronRight,
  FiDroplet,
  FiKey,
  FiLogOut,
  FiMail,
  FiMoreHorizontal,
  FiUser,
  FiX,
} from "react-icons/fi";
import { NavLink } from "react-router";
import "./Sidebar.css";

function getItemLabel(item) {
  return typeof item === "string" ? item : item.label;
}

function NavigationLink({ collapsed = false, item, mobile = false, onNavigate }) {
  const label = getItemLabel(item);
  const Icon = typeof item === "string" ? null : item.Icon;
  const baseClass = mobile
    ? "relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full px-1 py-1 text-center text-[11px] font-bold transition-all duration-200"
    : `group relative flex min-h-11 items-center rounded-xl py-2 text-left text-sm font-bold transition-all duration-200 ${collapsed ? "justify-center px-2" : "gap-3 px-3"}`;

  const content = (
    <>
      {Icon && <Icon aria-hidden="true" className={mobile ? "h-5 w-5 shrink-0" : "h-5 w-5 shrink-0"} />}
      <span className={collapsed && !mobile ? "sr-only" : `truncate ${mobile ? "" : "ww-popover-enter"}`}>{label}</span>
      {collapsed && !mobile && (
        <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] z-50 hidden whitespace-nowrap rounded-lg bg-navy-950 px-2.5 py-1.5 text-xs font-semibold text-white shadow-raised group-hover:block group-focus-visible:block">
          {label}
        </span>
      )}
    </>
  );

  if (typeof item === "string" || !item.path) {
    return <span className={`${baseClass} text-slate-500`}>{content}</span>;
  }

  return (
    <NavLink
      aria-label={collapsed && !mobile ? label : undefined}
      className={({ isActive }) => [
        baseClass,
        isActive
          ? mobile
            ? "bg-water-50/90 text-water-700"
            : "bg-water-50 text-water-800"
          : "text-slate-500 hover:bg-slate-50 hover:text-navy-900",
      ].join(" ")}
      onClick={onNavigate}
      to={item.path}
    >
      {content}
    </NavLink>
  );
}

export default function Sidebar({
  accountName = "WaterWise User",
  activeRoleLabel,
  items = [],
  onChangeEmail,
  onChangePassword,
  onLogout,
  onProfile,
  subtitle = "Sucol Water System",
  title = "WaterWise",
}) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isAccountActionsOpen, setIsAccountActionsOpen] = useState(false);
  const accountRef = useRef(null);
  const accountTriggerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const moreTriggerRef = useRef(null);
  const primaryMobileItems = items.length > 4 ? items.slice(0, 3) : items;
  const additionalMobileItems = items.length > 4 ? items.slice(3) : [];
  const AccountContainer = "button";

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const openTimer = window.setTimeout(() => setIsCollapsed(false), reduceMotion ? 0 : 180);
    return () => window.clearTimeout(openTimer);
  }, []);

  useEffect(() => {
    if (!isMoreOpen) return undefined;
    const moreTrigger = moreTriggerRef.current;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setIsMoreOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      moreTrigger?.focus();
    };
  }, [isMoreOpen]);

  useEffect(() => {
    if (!isAccountActionsOpen) return undefined;
    const closeOutside = (event) => {
      if (!accountRef.current?.contains(event.target)) setIsAccountActionsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setIsAccountActionsOpen(false);
        accountTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isAccountActionsOpen]);

  return (
    <>
      {isMoreOpen && (
        <button
          aria-label="Close more navigation"
          className="fixed inset-0 z-30 bg-slate-950/5 lg:hidden"
          onClick={() => setIsMoreOpen(false)}
          type="button"
        />
      )}

      {additionalMobileItems.length > 0 && (
        <div
          aria-hidden={!isMoreOpen}
          aria-label="More navigation tools"
          aria-modal="true"
          className={`fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 grid max-h-[min(65vh,32rem)] gap-1 overflow-y-auto rounded-2xl border border-white/80 bg-white/80 p-3 shadow-modal backdrop-blur-2xl transition-all duration-200 lg:hidden ${isMoreOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
          id="mobile-more-navigation"
          inert={!isMoreOpen}
          role="dialog"
        >
          <div className="mb-1 flex items-center justify-between px-2 py-1">
            <div>
              <p className="text-sm font-extrabold text-navy-900">More tools</p>
              <p className="text-xs text-slate-500">{activeRoleLabel} workspace</p>
            </div>
            <button
              aria-label="Close more tools"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
              onClick={() => setIsMoreOpen(false)}
              ref={closeButtonRef}
              type="button"
            >
              <FiX aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
          {additionalMobileItems.map((item) => (
            <NavigationLink item={item} key={getItemLabel(item)} onNavigate={() => setIsMoreOpen(false)} />
          ))}
        </div>
      )}

      <aside data-collapsed={isCollapsed} className={`waterwise-sidebar fixed inset-x-3 bottom-3 z-40 rounded-full border border-white/50 bg-white/35 pb-[env(safe-area-inset-bottom)] shadow-raised backdrop-blur-xl lg:sticky lg:inset-auto lg:top-4 lg:ml-4 lg:mt-4 lg:h-[calc(100vh-2rem)] lg:shrink-0 lg:self-start lg:overflow-visible lg:rounded-3xl lg:border-slate-200 lg:bg-white lg:pb-0 lg:shadow-card lg:backdrop-blur-none lg:transition-[width] lg:duration-500 lg:ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:lg:duration-0 ${isCollapsed ? "lg:w-20" : "lg:w-64"}`}>
        <div className="waterwise-sidebar-inner flex h-full items-center gap-1 p-1.5 lg:flex-col lg:items-stretch lg:gap-0 lg:p-3">
          <div className={`waterwise-sidebar-brand hidden min-h-14 items-center lg:flex ${isCollapsed ? "justify-center" : "gap-3 px-1"}`}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-water-600 text-white shadow-sm">
              <FiDroplet aria-hidden="true" className="h-5 w-5" />
            </span>
            {!isCollapsed && (
              <div className="ww-popover-enter min-w-0 flex-1">
                <p className="truncate text-base font-extrabold tracking-tight text-navy-900">{title === "WaterWise" ? <>Water<span className="waterwise-brand-accent">Wise</span></> : title}</p>
                <p className="truncate text-[11px] font-medium text-slate-500">{subtitle}</p>
              </div>
            )}
            {!isCollapsed && (
              <button
                aria-label="Collapse sidebar"
                className="ww-popover-enter flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
                onClick={() => setIsCollapsed(true)}
                type="button"
              >
                <FiChevronLeft aria-hidden="true" className="h-5 w-5" />
              </button>
            )}
          </div>



          {isCollapsed && (
            <button
              aria-label="Expand sidebar"
              className="group relative mt-2 hidden h-11 shrink-0 w-full items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 lg:flex"
              onClick={() => setIsCollapsed(false)}
              type="button"
            >
              <FiChevronRight aria-hidden="true" className="h-5 w-5" />
              <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] z-50 hidden whitespace-nowrap rounded-lg bg-navy-950 px-2.5 py-1.5 text-xs font-semibold text-white shadow-raised group-hover:block group-focus-visible:block">Expand sidebar</span>
            </button>
          )}

          <svg className="waterwise-top-wave" viewBox="0 0 256 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 18C85-20 136 83 256 18V80H0Z" fill="#e2f1ff"/><path d="M0 34C96-6 141 102 256 29V80H0Z" fill="#cce6ff"/><path d="M0 66C87-1 164 98 256 50V80H0Z" fill="#f3f9ff"/></svg>

          <nav className="mt-5 hidden min-h-0 flex-1 overflow-y-auto overflow-x-visible lg:block" aria-label={`${activeRoleLabel ?? "WaterWise"} navigation`}>
            {!isCollapsed && <p className="ww-popover-enter mb-2 px-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Workspace</p>}
            <ul className="grid min-w-0 gap-1">
              {items.map((item) => (
                <li key={getItemLabel(item)}><NavigationLink collapsed={isCollapsed} item={item} /></li>
              ))}
            </ul>
          </nav>


          <div ref={accountRef} className={`waterwise-sidebar-account mt-auto hidden border-t border-slate-100 pt-3 lg:block ${isCollapsed ? "px-0" : "px-1"}`}>
            <AccountContainer
              ref={accountTriggerRef}
              aria-controls={isAccountActionsOpen ? "sidebar-account-actions" : undefined}
              aria-expanded={isAccountActionsOpen}
              aria-label={isCollapsed ? `Open account actions for ${accountName}` : undefined}
              className={`group relative flex min-h-14 w-full items-center rounded-xl text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 ${isCollapsed ? "justify-center px-2" : "gap-3 px-2"}`}
              onClick={() => setIsAccountActionsOpen((isOpen) => !isOpen)}
              type="button"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-water-50 text-water-700"><FiUser aria-hidden="true" className="h-5 w-5" /></span>
              {!isCollapsed && <span className="ww-popover-enter min-w-0"><span className="block truncate text-sm font-bold text-navy-900">{accountName}</span><span className="mt-0.5 block truncate text-xs font-medium text-slate-500">{activeRoleLabel}</span></span>}
              {isCollapsed && <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] z-50 hidden whitespace-nowrap rounded-lg bg-navy-950 px-2.5 py-1.5 text-xs font-semibold text-white shadow-raised group-hover:block group-focus-visible:block">{accountName} · {activeRoleLabel}</span>}
              {!isCollapsed && <FiChevronRight aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 text-slate-500" />}
            </AccountContainer>
            {isAccountActionsOpen && <div id="sidebar-account-actions" className="waterwise-account-actions ww-popover-enter">
            {onProfile && <button
              aria-label={isCollapsed ? "View profile" : undefined}
              className={`group relative mt-2 flex min-h-11 w-full items-center rounded-xl font-bold text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 ${isCollapsed ? "justify-center px-2" : "gap-3 px-3 text-sm"}`}
              onClick={() => {
                setIsAccountActionsOpen(false);
                onProfile();
              }}
              type="button"
            >
              <FiUser aria-hidden="true" className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span>View profile</span>}
            </button>}
            {onChangePassword && <button
              aria-label={isCollapsed ? "Change password" : undefined}
              className={`group relative mt-2 flex min-h-11 w-full items-center rounded-xl bg-water-50 font-bold text-water-800 transition-colors hover:bg-water-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 ${isCollapsed ? "justify-center px-2" : "gap-3 px-3 text-sm"}`}
              onClick={() => {
                setIsAccountActionsOpen(false);
                onChangePassword();
              }}
              type="button"
            >
              <FiKey aria-hidden="true" className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span>Change password</span>}
              {isCollapsed && <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] z-50 hidden whitespace-nowrap rounded-lg bg-navy-950 px-2.5 py-1.5 text-xs font-semibold text-white shadow-raised group-hover:block group-focus-visible:block">Change password</span>}
            </button>}
            {onChangeEmail && <button
              aria-label={isCollapsed ? "Change email" : undefined}
              className={`group relative mt-2 flex min-h-11 w-full items-center rounded-xl bg-water-50 font-bold text-water-800 transition-colors hover:bg-water-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 ${isCollapsed ? "justify-center px-2" : "gap-3 px-3 text-sm"}`}
              onClick={() => {
                setIsAccountActionsOpen(false);
                onChangeEmail();
              }}
              type="button"
            >
              <FiMail aria-hidden="true" className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span>Change email</span>}
            </button>}
            <button
              aria-label={isCollapsed ? "Log out" : undefined}
              className={`group relative mt-2 flex min-h-11 w-full items-center rounded-xl bg-red-50 font-bold text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${isCollapsed ? "justify-center px-2" : "gap-3 px-3 text-sm"}`}
              onClick={() => {
                setIsAccountActionsOpen(false);
                onLogout();
              }}
              type="button"
            >
              <FiLogOut aria-hidden="true" className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span>Log out</span>}
              {isCollapsed && <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] z-50 hidden whitespace-nowrap rounded-lg bg-navy-950 px-2.5 py-1.5 text-xs font-semibold text-white shadow-raised group-hover:block group-focus-visible:block">Log out</span>}
            </button>
            </div>}
          </div>

          <nav className="flex min-w-0 flex-1 lg:hidden" aria-label={`${activeRoleLabel ?? "WaterWise"} mobile navigation`}>
            {primaryMobileItems.map((item) => (
              <NavigationLink
                item={item}
                key={getItemLabel(item)}
                mobile
                onNavigate={() => setIsMoreOpen(false)}
              />
            ))}
            {additionalMobileItems.length > 0 && (
              <button
                aria-controls="mobile-more-navigation"
                aria-expanded={isMoreOpen}
                aria-haspopup="dialog"
                className={`relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full px-1 py-1 text-center text-[11px] font-bold transition-all duration-200 ${isMoreOpen ? "bg-water-50/90 text-water-700" : "text-slate-500 hover:bg-white/70 hover:text-navy-900"}`}
                onClick={() => setIsMoreOpen((isOpen) => !isOpen)}
                ref={moreTriggerRef}
                type="button"
              >
                <FiMoreHorizontal aria-hidden="true" className="h-5 w-5" />
                More
              </button>
            )}
          </nav>
        </div>
      </aside>
    </>
  );
}
