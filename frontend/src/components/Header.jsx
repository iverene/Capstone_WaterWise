import { useEffect, useRef, useState } from "react";
import { FiChevronDown, FiChevronRight, FiDroplet, FiKey, FiLogOut, FiMail, FiUser } from "react-icons/fi";

export default function Header({
  accountName = "WaterWise User",
  activeRoleLabel,
  notificationSlot,
  onChangeEmail,
  onChangePassword,
  onLogout,
  onProfile,
  subtitle = "Sucol Water System",
  title = "WaterWise",
}) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const accountTriggerRef = useRef(null);

  useEffect(() => {
    if (!isAccountOpen) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) setIsAccountOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setIsAccountOpen(false);
        accountTriggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isAccountOpen]);

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md lg:bg-transparent lg:backdrop-blur-none lg:absolute lg:right-0 lg:top-0 lg:w-auto">
      <div className="flex min-h-16 w-full items-center justify-between gap-3 px-4 sm:px-6 lg:min-h-0 lg:justify-end lg:px-8 lg:py-6">
        <div className="flex min-w-0 items-center gap-3 lg:hidden">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-water-600 text-white shadow-sm">
            <FiDroplet aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold tracking-tight text-navy-900">{title}</p>
            <p className="truncate text-xs font-medium text-slate-500">{subtitle}</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {notificationSlot}

          {onLogout && (
            <div className="relative lg:hidden" ref={accountMenuRef}>
              <button
                aria-expanded={isAccountOpen}
                aria-haspopup="menu"
                aria-label="Open account menu"
                className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-2 text-slate-600 shadow-sm backdrop-blur-md transition-colors hover:bg-white hover:text-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2"
                onClick={() => setIsAccountOpen((isOpen) => !isOpen)}
                ref={accountTriggerRef}
                type="button"
              >
                <FiUser aria-hidden="true" className="h-5 w-5" />
                <FiChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform duration-200 ${isAccountOpen ? "rotate-180" : ""}`} />
              </button>

              {isAccountOpen && (
                <div
                  aria-label="Account actions"
                  className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 rounded-2xl border border-white/70 bg-white/90 p-2 shadow-raised backdrop-blur-xl"
                  role="menu"
                >
                  {onProfile ? (
                    <button
                      className="group flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
                      onClick={() => {
                        setIsAccountOpen(false);
                        onProfile();
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-navy-900">{accountName}</span>
                        <span className="mt-1 block text-xs font-semibold text-water-700">{activeRoleLabel}</span>
                      </span>
                      <FiChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  ) : (
                    <div className="px-3 py-3">
                      <p className="truncate text-sm font-bold text-navy-900">{accountName}</p>
                      <p className="mt-1 text-xs font-semibold text-water-700">{activeRoleLabel}</p>
                    </div>
                  )}
                  <div className="my-1 border-t border-slate-100" />
                  {onChangePassword && (
                    <button className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-slate-600 transition-colors hover:bg-water-50 hover:text-water-800" onClick={() => { setIsAccountOpen(false); onChangePassword(); }} role="menuitem" type="button">
                      <FiKey aria-hidden="true" className="h-4 w-4" />
                      Change password
                    </button>
                  )}
                  {onChangeEmail && (
                    <button className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-slate-600 transition-colors hover:bg-water-50 hover:text-water-800" onClick={() => { setIsAccountOpen(false); onChangeEmail(); }} role="menuitem" type="button">
                      <FiMail aria-hidden="true" className="h-4 w-4" />
                      Change email
                    </button>
                  )}
                  <button
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                    onClick={() => {
                      setIsAccountOpen(false);
                      onLogout();
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <FiLogOut aria-hidden="true" className="h-4 w-4" />
                    Log out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
