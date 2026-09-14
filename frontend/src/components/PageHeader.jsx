/**
 * Compact page-level heading. Renders eyebrow + title only: descriptions were
 * dropped globally because daily users don't re-read instructions, and the
 * paragraph pushed content down on small screens. Page-level `description`
 * props are ignored (passing extras is harmless) in case copy is ever needed
 * back on specific pages.
 */
export default function PageHeader({ eyebrow, title, className = "", compact = false, mobileCompact = false }) {
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
    </header>
  );
}
