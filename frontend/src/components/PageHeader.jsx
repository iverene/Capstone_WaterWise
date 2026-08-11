/**
 * Compact page-level heading. Keep actions and metrics in sibling sections so
 * the title remains easy to scan on small screens.
 */
export default function PageHeader({ eyebrow, title, description, className = "", compact = false, mobileCompact = false }) {
  return (
    <header
      className={`bg-transparent pr-0 lg:pr-16 ${className}`.trim()}
    >
      {eyebrow ? (
        <p className={`${mobileCompact ? "text-[11px] sm:text-xs" : compact ? "text-sm" : "text-xs"} font-bold uppercase tracking-[0.14em] text-water-700`}>
          {eyebrow}
        </p>
      ) : null}
      <h1 className={`${eyebrow ? "mt-1.5" : ""} ${mobileCompact ? "text-xl sm:text-3xl" : compact ? "text-lg sm:text-xl" : "text-2xl sm:text-3xl"} font-extrabold tracking-tight text-navy-900`}>
        {title}
      </h1>
      {description ? (
        <p className={`mt-1.5 max-w-3xl ${mobileCompact ? "text-[13px] leading-5 sm:text-sm sm:leading-6" : "text-sm leading-6"} text-slate-600`}>
          {description}
        </p>
      ) : null}
    </header>
  );
}
