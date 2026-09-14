import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export default function Dropdown({
  ariaDescribedBy,
  ariaInvalid = false,
  ariaLabel,
  className = "",
  compact = false,
  dataTestId,
  disabled = false,
  icon: Icon,
  id,
  name,
  onValueChange,
  options = [],
  placeholder = "Select an option",
  triggerClassName = "",
  value = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const listboxId = useId();
  const selectedIndex = options.findIndex(
    (option) => String(option.value) === String(value),
  );
  const selectedOption = options[selectedIndex];

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const desiredHeight = Math.min(288, options.length * (compact ? 36 : 46) + 12);
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const openAbove = spaceBelow < desiredHeight && rect.top > spaceBelow;
    const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      window.innerWidth - width - viewportPadding,
    );

    setMenuStyle({
      left,
      maxHeight: Math.max(132, Math.min(desiredHeight, openAbove ? rect.top - 16 : spaceBelow)),
      top: openAbove ? undefined : rect.bottom + 8,
      bottom: openAbove ? window.innerHeight - rect.top + 8 : undefined,
      width,
    });
  }, [compact, options.length]);

  useEffect(() => {
    if (!isOpen) return undefined;

    updatePosition();
    const closeOnOutsidePress = (event) => {
      if (
        !triggerRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    const reposition = () => updatePosition();

    document.addEventListener("mousedown", closeOnOutsidePress);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    requestAnimationFrame(() => {
      const optionElements = menuRef.current?.querySelectorAll('[role="option"]');
      optionElements?.[Math.max(0, selectedIndex)]?.focus();
    });

    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePress);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen, selectedIndex, updatePosition]);

  const closeAndFocus = () => {
    setIsOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const selectOption = (option) => {
    if (option.disabled) return;
    onValueChange?.(option.value);
    closeAndFocus();
  };

  const handleTriggerKeyDown = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (!disabled) setIsOpen(true);
  };

  const handleMenuKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAndFocus();
      return;
    }
    if (event.key === "Tab") {
      setIsOpen(false);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

    event.preventDefault();
    const optionElements = [...menuRef.current.querySelectorAll('[role="option"]:not(:disabled)')];
    const currentIndex = optionElements.indexOf(document.activeElement);
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = optionElements.length - 1;
    if (event.key === "ArrowDown") nextIndex = Math.min(currentIndex + 1, optionElements.length - 1);
    if (event.key === "ArrowUp") nextIndex = Math.max(currentIndex - 1, 0);
    optionElements[nextIndex]?.focus();
  };

  return (
    <div className={`relative min-w-0 ${className}`}>
      {name ? <input name={name} type="hidden" value={value} /> : null}
      <button
        aria-controls={isOpen ? listboxId : undefined}
        aria-describedby={ariaDescribedBy}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        className={`flex w-full items-center rounded-xl border bg-white px-4 text-left text-sm font-bold text-navy-900 outline-none transition-colors hover:border-water-300 focus-visible:border-water-600 focus-visible:ring-4 focus-visible:ring-water-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 ${compact ? "min-h-9 gap-2 px-3 text-xs" : "min-h-12 gap-3"} ${ariaInvalid ? "border-red-600 focus-visible:border-red-600 focus-visible:ring-red-100" : "border-slate-300"} ${triggerClassName}`}
        data-testid={dataTestId}
        disabled={disabled}
        id={id}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        {Icon ? <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" /> : null}
        <span className={`min-w-0 flex-1 truncate ${selectedOption ? "" : "text-slate-400"}`}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-label={`${ariaLabel ?? placeholder} options`}
              className="fixed z-[100] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-modal"
              id={listboxId}
              onKeyDown={handleMenuKeyDown}
              ref={menuRef}
              role="listbox"
              style={menuStyle}
            >
              {options.map((option, index) => {
                const selected = index === selectedIndex;
                return (
                  <button
                    aria-selected={selected}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 text-left font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-water-600 disabled:cursor-not-allowed disabled:text-slate-300 ${compact ? "min-h-9 text-xs" : "min-h-11 text-sm"} ${selected ? "bg-water-50 text-water-800" : "text-slate-700 hover:bg-slate-50"}`}
                    disabled={option.disabled}
                    key={option.value}
                    onClick={() => selectOption(option)}
                    role="option"
                    type="button"
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    {selected ? <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-water-700" /> : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
