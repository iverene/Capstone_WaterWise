import { SlidersHorizontal } from "lucide-react";
import { useId, useMemo, useState } from "react";
import Dropdown from "./Dropdown";
import Modal from "./Modal";

const toneClasses = {
  emerald: "focus-visible:border-emerald-500 focus-visible:ring-emerald-100",
  water: "focus-visible:border-water-500 focus-visible:ring-water-100",
};

const fieldKey = (field, index) => String(field.id ?? field.name ?? index);
const clearValue = (field) => field.clearValue ?? field.options?.[0]?.value ?? "";
const fieldLabel = (field, fallback, index) => {
  const explicitLabel = field.label ?? field.ariaLabel ?? fallback;
  const conciseLabel = explicitLabel
    .replace(/^Filter(?: .*?)? by /i, "")
    .replace(/^Filter /i, "");
  return conciseLabel
    ? `${conciseLabel.charAt(0).toUpperCase()}${conciseLabel.slice(1)}`
    : `Filter ${index + 1}`;
};

/** Responsive filter: inline for simple controls, grouped in a modal when space is limited. */
export default function Filter({
  ariaLabel = "Filter results",
  buttonLabel = "Filters",
  className = "",
  compact = false,
  dataTestId,
  description = "Choose the options that should be shown in this view.",
  disabled = false,
  filters,
  id,
  label,
  name,
  onValueChange,
  options = [],
  title = "Filters",
  tone = "water",
  value = "",
}) {
  const generatedId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const fields = useMemo(() => (
    filters?.length
      ? filters
      : [{ ariaLabel, disabled, id, label, name, onValueChange, options, tone, value }]
  ), [ariaLabel, disabled, filters, id, label, name, onValueChange, options, tone, value]);
  const controlledValues = useMemo(() => Object.fromEntries(
    fields.map((field, index) => [fieldKey(field, index), field.value ?? ""]),
  ), [fields]);
  const [draftValues, setDraftValues] = useState(controlledValues);
  const activeCount = fields.filter((field) => String(field.value ?? "") !== String(clearValue(field))).length;
  const allDisabled = disabled || fields.every((field) => field.disabled);
  const isSingleFilter = fields.length === 1;
  const showTwoFiltersInline = fields.length === 2;

  const close = () => {
    setDraftValues(controlledValues);
    setIsOpen(false);
  };

  const apply = (event) => {
    event.preventDefault();
    fields.forEach((field, index) => {
      const key = fieldKey(field, index);
      if (String(draftValues[key] ?? "") !== String(field.value ?? "")) {
        field.onValueChange?.(draftValues[key]);
      }
    });
    setIsOpen(false);
  };

  const clear = () => {
    setDraftValues(Object.fromEntries(
      fields.map((field, index) => [fieldKey(field, index), clearValue(field)]),
    ));
  };

  if (isSingleFilter) {
    const field = fields[0];
    const focusClasses = toneClasses[field.tone ?? tone] ?? toneClasses.water;
    return (
      <div className={`flex min-w-0 items-center gap-2 ${className}`}>
        <span className={field.label ? `shrink-0 text-xs font-semibold text-slate-500 ${field.hideLabelOnMobile ? "hidden sm:inline" : ""}` : "sr-only"}>
          {field.label ?? field.ariaLabel ?? ariaLabel}
        </span>
        <Dropdown
          ariaLabel={field.ariaLabel ?? ariaLabel}
          className={field.hideLabelOnMobile ? "w-auto shrink-0" : "min-w-0 flex-1"}
          compact={compact || field.compact}
          dataTestId={field.dataTestId ?? dataTestId}
          disabled={disabled || field.disabled}
          hideLabel={field.hideLabel}
          icon={field.icon ?? SlidersHorizontal}
          id={field.id}
          name={field.name}
          onValueChange={field.onValueChange}
          options={field.options ?? []}
          triggerClassName={field.triggerClassName ?? `border-slate-200 bg-white text-navy-900 shadow-sm ${focusClasses}`}
          value={field.value ?? ""}
        />
      </div>
    );
  }

  return (
    <div className={`min-w-0 ${className}`}>
      {showTwoFiltersInline && (
        <div className="hidden items-center gap-2 sm:flex">
          {fields.map((field, index) => {
            const key = fieldKey(field, index);
            const fieldId = `${field.id ?? `${generatedId}-${index}`}-inline`;
            const focusClasses = toneClasses[field.tone ?? tone] ?? toneClasses.water;
            return (
              <Dropdown
                ariaLabel={field.ariaLabel ?? field.label ?? ariaLabel}
                className={field.className ?? "w-48"}
                compact={compact || field.compact}
                dataTestId={field.dataTestId}
                disabled={disabled || field.disabled}
                id={fieldId}
                key={key}
                name={field.name}
                onValueChange={field.onValueChange}
                options={field.options ?? []}
                triggerClassName={`border-slate-200 bg-white text-navy-900 shadow-sm ${focusClasses}`}
                value={field.value ?? ""}
              />
            );
          })}
        </div>
      )}

      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`${ariaLabel}${activeCount ? `, ${activeCount} active` : ""}`}
        className={`min-h-11 w-fit items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm font-bold text-navy-900 transition-colors hover:border-slate-300 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2 disabled:text-slate-400 sm:px-4 ${showTwoFiltersInline ? "inline-flex sm:hidden" : "inline-flex"}`}
        data-testid={dataTestId}
        disabled={allDisabled}
        onClick={() => {
          setDraftValues(controlledValues);
          setIsOpen(true);
        }}
        type="button"
      >
        <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
        <span className="hidden sm:inline">{buttonLabel}</span>
        {activeCount > 0 && (
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-water-700 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
            {activeCount}
          </span>
        )}
      </button>

      <Modal
        bodyClassName="min-h-0 flex-1 overflow-y-auto"
        closeLabel="Close filters"
        description={description}
        isOpen={isOpen}
        onClose={close}
        size="sm"
        title={title}
      >
        <form onSubmit={apply}>
          <div className="space-y-5 p-4 sm:p-6">
            {fields.map((field, index) => {
              const key = fieldKey(field, index);
              const fieldId = `${field.id ?? `${generatedId}-${index}`}-modal`;
              const focusClasses = toneClasses[field.tone ?? tone] ?? toneClasses.water;
              return (
                <div className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center" key={key}>
                  <label className="text-sm font-bold text-slate-700" htmlFor={fieldId}>
                    {fieldLabel(field, ariaLabel, index)}
                  </label>
                  <Dropdown
                    ariaLabel={field.ariaLabel ?? field.label ?? ariaLabel}
                    compact={compact || field.compact}
                    disabled={disabled || field.disabled}
                    id={fieldId}
                    name={field.name}
                    onValueChange={(nextValue) => setDraftValues((current) => ({
                      ...current,
                      [key]: nextValue,
                    }))}
                    options={field.options ?? []}
                    triggerClassName={`border-slate-200 bg-white text-navy-900 shadow-sm ${focusClasses}`}
                    value={draftValues[key] ?? ""}
                  />
                </div>
              );
            })}
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white p-4 sm:px-6">
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-bold text-water-700 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
              onClick={clear}
              type="button"
            >
              Clear
            </button>
            <button
              className="inline-flex min-h-11 min-w-28 items-center justify-center rounded-xl bg-water-600 px-5 text-sm font-bold text-white shadow-card hover:bg-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2"
              type="submit"
            >
              Done
            </button>
          </footer>
        </form>
      </Modal>
    </div>
  );
}
