import { useRef } from "react";

export default function OtpInput({
  compact = false,
  disabled = false,
  id = "otp",
  invalid = false,
  onChange,
  value = "",
}) {
  const inputRefs = useRef([]);
  const digits = String(value).padEnd(6, " ").slice(0, 6).split("");

  const updateDigits = (index, incomingValue) => {
    const incomingDigits = incomingValue.replace(/\D/g, "");
    const nextDigits = [...digits];

    if (!incomingDigits) {
      nextDigits[index] = " ";
      onChange(nextDigits.join("").trimEnd());
      return;
    }

    incomingDigits.slice(0, 6 - index).split("").forEach((digit, offset) => {
      nextDigits[index + offset] = digit;
    });
    onChange(nextDigits.join("").trimEnd());
    inputRefs.current[Math.min(index + incomingDigits.length, 5)]?.focus();
  };

  const handleKeyDown = (index, event) => {
    if (event.key === "Backspace" && digits[index] === " " && index > 0) {
      event.preventDefault();
      const nextDigits = [...digits];
      nextDigits[index - 1] = " ";
      onChange(nextDigits.join("").trimEnd());
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < 5) {
      event.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  return (
    <div aria-label="Six-digit verification code" className={`grid grid-cols-6 ${compact ? "gap-1.5 sm:gap-3" : "gap-2 sm:gap-3"}`} role="group">
      {digits.map((digit, index) => (
        <input
          aria-invalid={invalid}
          aria-label={`Verification code digit ${index + 1} of 6`}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          className={`${compact ? "h-11 rounded-lg text-lg sm:h-16 sm:rounded-xl sm:text-2xl" : "h-14 rounded-xl text-2xl sm:h-16"} min-w-0 border bg-white text-center font-mono font-bold text-slate-900 outline-none transition focus:border-water-600 focus:ring-4 focus:ring-water-100 disabled:bg-slate-100 disabled:text-slate-400 ${invalid ? "border-red-400" : "border-slate-300"}`}
          disabled={disabled}
          id={index === 0 ? id : `${id}-${index + 1}`}
          inputMode="numeric"
          key={index}
          maxLength={index === 0 ? 6 : 1}
          onChange={(event) => updateDigits(index, event.target.value)}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => handleKeyDown(index, event)}
          ref={(element) => { inputRefs.current[index] = element; }}
          type="text"
          value={digit.trim()}
        />
      ))}
    </div>
  );
}
