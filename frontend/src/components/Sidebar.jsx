import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiChevronLeft,
  FiChevronRight,
  FiKey,
  FiLogOut,
  FiMail,
  FiMoreHorizontal,
  FiUser,
  FiX,
} from "react-icons/fi";
import { NavLink, useLocation } from "react-router";
import "./Sidebar.css";

function getItemLabel(item) {
  return typeof item === "string" ? item : item.label;
}

function NavigationLink({ badge = 0, collapsed = false, item, mobile = false, onNavigate }) {
  const label = getItemLabel(item);
  const Icon = typeof item === "string" ? null : item.Icon;
  const badgeCount = Number(badge) || 0;
  const badgeLabel = badgeCount > 99 ? "99+" : badgeCount;
  const baseClass = mobile
    ? "relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full px-1 py-1 text-center text-[11px] font-bold transition-all duration-200"
    : `group relative flex min-h-11 items-center rounded-xl py-2 text-left text-sm font-bold transition-all duration-200 ${collapsed ? "justify-center px-2" : "gap-3 px-3"}`;

  const content = (
    <>
      {Icon && <Icon aria-hidden="true" className={mobile ? "h-5 w-5 shrink-0" : "h-5 w-5 shrink-0"} />}
      <span className={collapsed && !mobile ? "sr-only" : `truncate ${mobile ? "" : "ww-popover-enter"}`}>{label}</span>
      {badgeCount > 0 && (
        mobile ? (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-water-600 px-1 text-[9px] font-extrabold leading-4 text-white ring-2 ring-white/80">
            {badgeLabel}
          </span>
        ) : collapsed ? (
          <span aria-hidden="true" className="absolute right-2 top-2 h-2 w-2 rounded-full bg-water-600 ring-2 ring-white" />
        ) : (
          <span className="ml-auto flex min-w-5 shrink-0 items-center justify-center rounded-full bg-water-600 px-1.5 text-[10px] font-extrabold leading-5 text-white">
            {badgeLabel}
          </span>
        )
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
  badges = {},
  items = [],
  onChangeEmail,
  onChangePassword,
  onLogout,
  onProfile,
  subtitle = "Sucol Water System",
  title = "WaterWise",
}) {
  const readSavedCollapsed = () => {
    try {
      return window.sessionStorage.getItem("waterwise:sidebar-collapsed");
    } catch {
      return null;
    }
  };

  const [isCollapsed, setIsCollapsed] = useState(() => readSavedCollapsed() === "1");
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isAccountActionsOpen, setIsAccountActionsOpen] = useState(false);
  const accountRef = useRef(null);
  const accountTriggerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const moreTriggerRef = useRef(null);
  const asideRef = useRef(null);
  const navRef = useRef(null);
  const edgeIndicatorRef = useRef(null);
  const collapseTooltipRef = useRef(null);
  const location = useLocation();
  const primaryMobileItems = items.length > 4 ? items.slice(0, 3) : items;
  const additionalMobileItems = items.length > 4 ? items.slice(3) : [];
  const AccountContainer = "button";

  // Collapsed state persists across remounts via sessionStorage (explicit
  // toggles only). No auto-expand timer: the sidebar renders in its final
  // state on mount so navigating between pages never replays a close→open
  // animation.
  // Only explicit toggles are persisted, so a remount restores the user's
  // last choice (or expanded by default) without overwriting it.
  const persistCollapsed = (value) => {
    try {
      window.sessionStorage.setItem("waterwise:sidebar-collapsed", value ? "1" : "0");
    } catch {
      // Storage may be unavailable; the sidebar still works for this view.
    }
  };

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

  // Collapsed-rail edge indicator: a dedicated element positioned against the
  // aside (which never clips) instead of a ::before on the link (which lives
  // inside the scrolling nav and either sits inside the rail or forces a
  // horizontal scrollbar when pushed past its edge).
  const positionEdgeIndicator = useCallback((link) => {
    const edge = edgeIndicatorRef.current;
    const aside = asideRef.current;
    if (!edge || !aside) return;
    if (!link) {
      edge.style.opacity = "0";
      return;
    }
    const asideBox = aside.getBoundingClientRect();
    const linkBox = link.getBoundingClientRect();
    edge.style.top = `${linkBox.top - asideBox.top + 8}px`;
    edge.style.height = `${Math.max(linkBox.height - 16, 4)}px`;
    edge.style.opacity = "1";
  }, []);

  const resetEdgeIndicator = useCallback(() => {
    const nav = navRef.current;
    positionEdgeIndicator(nav ? nav.querySelector('a[aria-current="page"]') : null);
    if (collapseTooltipRef.current) collapseTooltipRef.current.style.opacity = "0";
  }, [positionEdgeIndicator]);

  // Collapsed-rail tooltip: rendered against the aside (outside the scrolling
  // nav) because the per-link tooltip spans get clipped by the nav's scroll
  // container and their labels end up swallowed inside the rail.
  const positionCollapseTooltip = useCallback((link) => {
    const tip = collapseTooltipRef.current;
    const aside = asideRef.current;
    if (!tip || !aside) return;
    if (!link) {
      tip.style.opacity = "0";
      return;
    }
    const asideBox = aside.getBoundingClientRect();
    const linkBox = link.getBoundingClientRect();
    tip.textContent = link.getAttribute("aria-label") || link.textContent?.trim() || "";
    tip.style.left = `${asideBox.width + 12}px`;
    tip.style.top = `${linkBox.top - asideBox.top + (linkBox.height - tip.offsetHeight) / 2}px`;
    tip.style.opacity = "1";
  }, []);

  useEffect(() => {
    if (!isCollapsed) {
      if (edgeIndicatorRef.current) edgeIndicatorRef.current.style.opacity = "0";
      if (collapseTooltipRef.current) collapseTooltipRef.current.style.opacity = "0";
      return;
    }
    resetEdgeIndicator();
  }, [isCollapsed, location.pathname, items, resetEdgeIndicator]);

  const handleNavIndicatorHover = (event) => {
    const link = event.target?.closest?.("a");
    if (link && navRef.current?.contains(link)) {
      positionEdgeIndicator(link);
      positionCollapseTooltip(link);
    }
  };

  // Tab switches (Alt+Tab, clicking another tab) never fire mouseleave, so a
  // visible tooltip/edge would get stuck. Reset both when the pointer leaves
  // the document or the window loses focus.
  useEffect(() => {
    const handlePointerExit = () => {
      resetEdgeIndicator();
    };
    window.addEventListener("blur", handlePointerExit);
    document.documentElement.addEventListener("mouseleave", handlePointerExit);
    return () => {
      window.removeEventListener("blur", handlePointerExit);
      document.documentElement.removeEventListener("mouseleave", handlePointerExit);
    };
  }, [resetEdgeIndicator]);

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
            <NavigationLink
              badge={badges[item.path]}
              item={item}
              key={getItemLabel(item)}
              onNavigate={() => setIsMoreOpen(false)}
            />
          ))}
        </div>
      )}

      <aside ref={asideRef} data-collapsed={isCollapsed} className={`waterwise-sidebar fixed inset-x-3 bottom-3 z-40 rounded-full border border-white/50 bg-white/35 pb-[env(safe-area-inset-bottom)] shadow-raised backdrop-blur-xl lg:sticky lg:inset-auto lg:top-4 lg:ml-4 lg:mt-4 lg:h-[calc(100vh-2rem)] lg:shrink-0 lg:self-start lg:overflow-visible lg:rounded-3xl lg:border-slate-200 lg:bg-white lg:pb-0 lg:shadow-card lg:backdrop-blur-none lg:transition-[width] lg:duration-500 lg:ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:lg:duration-0 ${isCollapsed ? "lg:w-20" : "lg:w-64"}`}>
        <span ref={edgeIndicatorRef} aria-hidden="true" className={`pointer-events-none absolute left-3 top-0 z-40 hidden h-4 w-[3px] rounded-full bg-[#0085ff] opacity-0 transition-[top,height,opacity] duration-150 motion-reduce:transition-none ${isCollapsed ? "lg:block" : ""}`} />
        <span ref={collapseTooltipRef} aria-hidden="true" className={`pointer-events-none absolute top-0 z-50 hidden whitespace-nowrap rounded-lg bg-navy-950 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-raised transition-opacity duration-150 motion-reduce:transition-none ${isCollapsed ? "lg:block" : ""}`} />
        <div className="waterwise-sidebar-inner flex h-full items-center gap-1 p-1.5 lg:flex-col lg:items-stretch lg:gap-0 lg:p-3">
          <div className={`waterwise-sidebar-brand hidden min-h-14 items-center lg:flex ${isCollapsed ? "justify-center" : "gap-3 px-1"}`}>
            {isCollapsed ? (
              <button
                aria-label="Expand sidebar"
                className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
                onClick={() => { persistCollapsed(false); setIsCollapsed(false); }}
                type="button"
              >
                <img alt="" className="h-11 w-11 rounded-xl bg-white object-contain group-hover:hidden group-focus-visible:hidden" height="48" src="/Sucol_logo-48.webp" srcSet="/Sucol_logo-48.webp 1x, /Sucol_logo-96.webp 2x" width="48" />
                <span className="hidden h-11 w-11 items-center justify-center rounded-xl bg-water-600 text-white shadow-sm group-hover:flex group-focus-visible:flex">
                  <FiChevronRight aria-hidden="true" className="h-5 w-5" />
                </span>
                <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] z-50 hidden whitespace-nowrap rounded-lg bg-navy-950 px-2.5 py-1.5 text-xs font-semibold text-white shadow-raised group-hover:block group-focus-visible:block">Expand sidebar</span>
              </button>
            ) : (
              <>
                <img alt="" className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain" height="48" src="/Sucol_logo-48.webp" srcSet="/Sucol_logo-48.webp 1x, /Sucol_logo-96.webp 2x" width="48" />
                <div className="ww-popover-enter min-w-0 flex-1">
                  <p className="truncate text-base font-extrabold tracking-tight text-navy-900">{title === "WaterWise" ? <>Water<span className="waterwise-brand-accent">Wise</span></> : title}</p>
                  <p className="truncate text-[11px] font-medium text-slate-500">{subtitle}</p>
                </div>
                <button
                  aria-label="Collapse sidebar"
                  className="ww-popover-enter flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
                  onClick={() => { persistCollapsed(true); setIsCollapsed(true); }}
                  type="button"
                >
                  <FiChevronLeft aria-hidden="true" className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          <svg className="waterwise-top-wave" viewBox="0 0 256 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 18C85-20 136 83 256 18V80H0Z" fill="#e2f1ff"/><path d="M0 34C96-6 141 102 256 29V80H0Z" fill="#cce6ff"/><path d="M0 66C87-1 164 98 256 50V80H0Z" fill="#f3f9ff"/></svg>

          <nav ref={navRef} onMouseOver={handleNavIndicatorHover} onFocus={handleNavIndicatorHover} onMouseLeave={resetEdgeIndicator} className="mt-5 hidden min-h-0 flex-1 overflow-y-auto overflow-x-visible lg:block" aria-label={`${activeRoleLabel ?? "WaterWise"} navigation`}>
            <ul className="grid min-w-0 gap-1">
              {items.map((item) => (
                <li key={getItemLabel(item)}>
                  <NavigationLink
                    badge={badges[item.path]}
                    collapsed={isCollapsed}
                    item={item}
                  />
                </li>
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
              {!isCollapsed && <span>Profile</span>}
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
                badge={badges[item.path]}
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
