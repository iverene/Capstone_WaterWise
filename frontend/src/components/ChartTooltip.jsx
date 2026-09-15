const defaultValueFormatter = (value) =>
  Number(value ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 2 });

export default function ChartTooltip({
  active,
  hideConnectedPrediction = false,
  label,
  labelFormatter,
  payload,
  supportingFormatter,
  unit = "m³",
  valueFormatter = defaultValueFormatter,
  valueLabel,
}) {
  const entries = (payload ?? []).filter((entry) => {
    if (entry.value === null || entry.value === undefined) return false;
    // Trend charts duplicate the last historical value into the prediction
    // series so the dashed forecast segment connects. Hide that duplicate
    // everywhere except the actual forecast point (marked isPrediction).
    if (hideConnectedPrediction && entry.dataKey === "predicted" && !entry.payload?.isPrediction) return false;
    return true;
  });
  if (!active || !entries.length) return null;

  const record = entries[0].payload ?? {};
  const heading = labelFormatter?.(label, record) ?? label;
  const supportingText = supportingFormatter?.(record);

  return (
    <div className="min-w-40 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-raised">
      <p className="text-sm font-extrabold text-navy-900">{heading}</p>
      {valueLabel && entries.length === 1 ? (
        <p className="mt-1.5 font-mono text-sm font-extrabold text-water-700 tabular-nums">
          {valueFormatter(entries[0].value)} {unit} {valueLabel}
        </p>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {entries.map((entry) => (
            <div className="flex items-center justify-between gap-4 text-xs" key={entry.dataKey}>
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color ?? entry.stroke ?? "#0284C7" }} />
                {entry.name}
              </span>
              <strong className="font-mono font-extrabold text-navy-900 tabular-nums">
                {valueFormatter(entry.value)} {unit}
              </strong>
            </div>
          ))}
        </div>
      )}
      {supportingText ? <p className="mt-1.5 text-xs leading-5 text-slate-500">{supportingText}</p> : null}
    </div>
  );
}
