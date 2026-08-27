import { Search as SearchIcon, X } from "lucide-react";

const toneClasses = {
  emerald: "focus:border-emerald-500 focus:ring-emerald-100",
  water: "focus:border-water-500 focus:ring-water-100",
};

const surfaceClasses = {
  muted: "bg-slate-50 focus:bg-white",
  white: "bg-white shadow-sm",
};

/**
 * Shared controlled search field. Pages remain responsible for filtering data
 * and can keep their own select filters or action buttons beside this field.
 */
export default function Search({
  ariaLabel = "Search",
  className = "",
  disabled = false,
  id,
  name,
  onBlur,
  onFocus,
  onValueChange,
  placeholder = "Search",
  surface = "muted",
  tone = "water",
  value = "",
}) {
  const focusClasses = toneClasses[tone] ?? toneClasses.water;
  const backgroundClasses = surfaceClasses[surface] ?? surfaceClasses.muted;

  return (
    <label className={`relative block min-w-0 ${className}`}>
      <span className="sr-only">{ariaLabel}</span>
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
      />
      <input
        aria-label={ariaLabel}
        className={`min-h-12 w-full appearance-none rounded-xl border border-slate-200 py-3 pl-11 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 [&::-webkit-search-cancel-button]:appearance-none ${value ? "pr-12" : "pr-4"} ${backgroundClasses} ${focusClasses}`}
        disabled={disabled}
        id={id}
        name={name}
        onChange={(event) => onValueChange?.(event.target.value)}
        onBlur={onBlur}
        onFocus={onFocus}
        placeholder={placeholder}
        type="search"
        value={value}
      />
      {value && !disabled && (
        <button
          aria-label={`Clear ${ariaLabel.toLowerCase()}`}
          className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
          onClick={() => onValueChange?.("")}
          type="button"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </label>
  );
}
