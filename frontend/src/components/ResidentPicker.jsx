import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search as SearchIcon, UserRound, X } from "lucide-react";

/**
 * Type-to-search resident selector. Typing filters the directory by name,
 * account number, or purok and shows matches as a dropdown list.
 */
export default function ResidentPicker({ consumers = [], onChange, value = "" }) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef(null);
  const listboxId = useId();

  const selected = useMemo(
    () => consumers.find((consumer) => String(consumer.id) === String(value)) ?? null,
    [consumers, value],
  );

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    const sorted = [...consumers].sort((left, right) =>
      String(left.consumerName ?? "").localeCompare(String(right.consumerName ?? "")),
    );
    if (!term) return sorted;
    return sorted.filter((consumer) =>
      [consumer.consumerName, consumer.consumerNo, consumer.accountName, consumer.purok].some(
        (field) => String(field ?? "").toLowerCase().includes(term),
      ),
    );
  }, [consumers, query]);

  const visibleMatches = matches.slice(0, 60);

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnOutsidePress = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsidePress);
    return () => document.removeEventListener("mousedown", closeOnOutsidePress);
  }, [isOpen]);

  const choose = (consumer) => {
    if (!consumer || consumer.status !== "active") return;
    onChange(String(consumer.id));
    setQuery(consumer.consumerName ?? "");
    setIsOpen(false);
  };

  const handleInput = (event) => {
    const text = event.target.value;
    setQuery(text);
    setIsOpen(true);
    setHighlight(0);
    // Editing the text invalidates a previous selection so a stale id is never submitted.
    if (selected && text !== (selected.consumerName ?? "")) onChange("");
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      const total = visibleMatches.length;
      if (total === 0) return;
      setHighlight((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        return (next + total) % total;
      });
      return;
    }
    if (event.key === "Enter" && isOpen && visibleMatches[highlight]) {
      event.preventDefault();
      choose(visibleMatches[highlight]);
      return;
    }
    if (event.key === "Escape") setIsOpen(false);
  };

  const clear = () => {
    onChange("");
    setQuery("");
    setHighlight(0);
    setIsOpen(true);
  };

  return (
    <div ref={wrapperRef}>
      <div className="relative mt-2">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
        <input
          aria-autocomplete="list"
          aria-controls={isOpen ? listboxId : undefined}
          aria-expanded={isOpen}
          aria-label="Search for a resident by name"
          autoComplete="off"
          className="ww-field p-3 pl-10 pr-10 text-sm"
          onChange={handleInput}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Type a resident name"
          role="combobox"
          type="text"
          value={query}
        />
        {query ? (
          <button
            aria-label="Clear selected resident"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            onClick={clear}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : (
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
        )}

        {isOpen && (
          <ul
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
            id={listboxId}
            role="listbox"
          >
            {visibleMatches.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm font-semibold text-slate-500">
                No resident matches “{query.trim()}”.
              </li>
            ) : (
              visibleMatches.map((consumer, index) => {
                const isSelected = String(consumer.id) === String(value);
                const isInactive = consumer.status !== "active";
                return (
                  <li key={consumer.id}>
                    <button
                      aria-selected={isSelected}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${
                        isInactive
                          ? "cursor-not-allowed text-slate-400"
                          : index === highlight
                            ? "bg-water-50 text-water-800"
                            : "text-slate-700 hover:bg-slate-50"
                      }`}
                      disabled={isInactive}
                      onClick={() => choose(consumer)}
                      onMouseEnter={() => setHighlight(index)}
                      role="option"
                      type="button"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <UserRound aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="min-w-0">
                          <span className="block truncate">{consumer.consumerName}</span>
                          <span className="mt-0.5 block text-xs font-semibold text-slate-400">
                            {consumer.consumerNo} · {consumer.purok}
                            {isInactive ? " · Inactive" : ""}
                          </span>
                        </span>
                      </span>
                      {isSelected ? (
                        <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-water-700" />
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>

      {selected ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-water-700">
          <Check aria-hidden="true" className="h-3.5 w-3.5" />
          Selected: {selected.consumerName} · {selected.purok}
        </p>
      ) : (
        <p className="mt-1.5 text-xs font-medium text-slate-500">
          Start typing — matching residents appear as you type.
        </p>
      )}
    </div>
  );
}
