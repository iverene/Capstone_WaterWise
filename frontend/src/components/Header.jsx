import { FiUser } from "react-icons/fi";

export default function Header({
  notificationSlot,
  onProfile,
  title = "WaterWise",
}) {
  return (
    <header className="relative z-30 bg-slate-50 lg:absolute lg:right-0 lg:top-0 lg:w-auto lg:bg-transparent lg:backdrop-blur-none">
      <div className="flex min-h-16 w-full items-center justify-between gap-3 px-4 sm:px-6 lg:min-h-0 lg:justify-end lg:px-8 lg:py-6">
        <div className="flex min-w-0 items-center gap-3 lg:hidden">
          <img alt="" className="h-8 w-8 shrink-0 object-contain" src="/Sucol_logo.png" />
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold tracking-tight text-navy-900">{title === "WaterWise" ? <>Water<span className="text-water-600">Wise</span></> : title}</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {notificationSlot}

          {onProfile && (
            <button
              aria-label="View profile"
              className="flex h-11 w-11 items-center justify-center rounded-xl border-0 bg-transparent text-water-700 transition-colors hover:text-water-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2 lg:hidden"
              onClick={onProfile}
              type="button"
            >
              <FiUser aria-hidden="true" className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
