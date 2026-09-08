import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const modalStack = [];

const sizes = {
  sm: "max-w-lg",
  md: "max-w-2xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Shared WaterWise dialog shell based on the payment modal anatomy. */
export default function Modal({
  ariaLabel,
  bodyClassName = "min-h-0 flex-1 overflow-y-auto",
  bodyProps = {},
  children,
  className = "",
  closeLabel = "Close modal",
  closeButtonProps = {},
  closeOnOverlay = true,
  description,
  dismissible = true,
  eyebrow,
  headerActions,
  headerActionsProps = {},
  headerClassName = "",
  headerProps = {},
  initialFocusRef,
  isOpen,
  onClose,
  overlayClassName = "",
  overlayProps = {},
  panelProps = {},
  panelRoundedClass = "rounded-3xl",
  showCloseButton = true,
  showHeader = true,
  size = "lg",
  title,
  zIndexClass = "z-50",
}) {
  const generatedTitleId = useId();
  const panelRef = useRef(null);
  const closeButtonRef = useRef(null);
  const stackTokenRef = useRef(Symbol("modal"));
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  const titleId = showHeader && title ? generatedTitleId : undefined;

  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  }, [dismissible, onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const token = stackTokenRef.current;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    modalStack.push(token);
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (modalStack.at(-1) !== token) return;
      if (event.key === "Escape" && dismissibleRef.current) {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = [...(panelRef.current?.querySelectorAll(focusableSelector) ?? [])];
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => {
      const requestedFocus = initialFocusRef?.current;
      (requestedFocus ?? closeButtonRef.current ?? panelRef.current?.querySelector(focusableSelector) ?? panelRef.current)?.focus?.();
    });

    return () => {
      const stackIndex = modalStack.lastIndexOf(token);
      if (stackIndex >= 0) modalStack.splice(stackIndex, 1);
      document.removeEventListener("keydown", handleKeyDown);
      if (modalStack.length === 0) document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [initialFocusRef, isOpen]);

  if (!isOpen) return null;

  const {
    className: overlayPropClass = "",
    onMouseDown: overlayMouseDown,
    ...restOverlayProps
  } = overlayProps;
  const {
    className: panelPropClass = "",
    onMouseDown: panelMouseDown,
    ...restPanelProps
  } = panelProps;
  const { className: headerPropClass = "", ...restHeaderProps } = headerProps;
  const { className: bodyPropClass = "", ...restBodyProps } = bodyProps;
  const { className: actionsClass = "", ...restActionsProps } = headerActionsProps;
  const { className: closeButtonClass = "", ...restCloseButtonProps } = closeButtonProps;

  return createPortal(
    <div
      {...restOverlayProps}
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-navy-950/45 p-3 sm:p-6 ${overlayClassName} ${overlayPropClass}`}
      onMouseDown={(event) => {
        overlayMouseDown?.(event);
        if (
          !event.defaultPrevented &&
          event.target === event.currentTarget &&
          closeOnOverlay &&
          dismissible
        ) {
          onClose?.();
        }
      }}
      role="presentation"
    >
      <section
        {...restPanelProps}
        aria-label={titleId ? undefined : ariaLabel}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`flex max-h-[94dvh] w-full ${sizes[size] ?? sizes.lg} flex-col overflow-hidden ${panelRoundedClass} border border-slate-200 bg-white shadow-modal ${className} ${panelPropClass}`}
        onMouseDown={(event) => {
          event.stopPropagation();
          panelMouseDown?.(event);
        }}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        {showHeader && (
          <header
            {...restHeaderProps}
            className={`flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6 ${headerClassName} ${headerPropClass}`}
          >
            <div className="min-w-0">
              {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-600">{eyebrow}</p>}
              {title && <h2 className={`${eyebrow ? "mt-1" : ""} text-xl font-extrabold tracking-[-0.03em] text-navy-900 sm:text-2xl`} id={titleId}>{title}</h2>}
              {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}
            </div>
            {(headerActions || (showCloseButton && dismissible)) && (
              <div {...restActionsProps} className={`flex shrink-0 items-center gap-2 ${actionsClass}`}>
                {headerActions}
                {showCloseButton && dismissible && (
                  <button
                    {...restCloseButtonProps}
                    aria-label={closeLabel}
                    className={`flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors duration-[120ms] hover:bg-slate-50 hover:text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2 ${closeButtonClass}`}
                    onClick={onClose}
                    ref={closeButtonRef}
                    type="button"
                  >
                    <X aria-hidden="true" className="h-5 w-5" />
                  </button>
                )}
              </div>
            )}
          </header>
        )}

        <div {...restBodyProps} className={`${bodyClassName} ${bodyPropClass}`}>
          {children}
        </div>
      </section>
    </div>,
    document.body,
  );
}
