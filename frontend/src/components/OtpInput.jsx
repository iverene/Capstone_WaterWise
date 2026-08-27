import { useRef } from "react";

function getOtpDigits(value) {
  return String(value).padEnd(6, " ").slice(0, 6).split("");
}

export default function OtpInput({
  compact = false,
  disabled = false,
  id = "otp",
  invalid = false,
  onChange,
  onAutoVerify,
  success = false,
  value = "",
}) {
  const inputRefs = useRef([]);
  const digits = getOtpDigits(value);

  const computeNewValue = (index, incomingValue) => {
    const incomingDigits = incomingValue.replace(/\D/g, "");
    const nextDigits = [...digits];

    if (!incomingDigits) {
      nextDigits[index] = " ";
      return nextDigits.join("").trimEnd();
    }

    incomingDigits.slice(0, 6 - index).split("").forEach((digit, offset) => {
      nextDigits[index + offset] = digit;
    });
    return nextDigits.join("").trimEnd();
  };

  const handleOnChange = (index, event) => {
    const newValue = computeNewValue(index, event.target.value);
    onChange(newValue);

    const incomingDigits = event.target.value.replace(/\D/g, "");
    if (incomingDigits) {
      inputRefs.current[Math.min(index + incomingDigits.length, 5)]?.focus();
    }

    if (onAutoVerify && newValue.replace(/\s/g, "").length === 6) {
      onAutoVerify(newValue.trim());
    }
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
    <div
      aria-label="Six-digit verification code"
      className={`grid grid-cols-6 ${compact ? "gap-1 sm:gap-2" : "gap-1 sm:gap-2"}`}
      role="group"
    >
      <style>{`
        @keyframes otp-success-pulse {
          0% { border-color: #14b8a6; box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.15); }
          50% { border-color: #0d9488; box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.3); }
          100% { border-color: #14b8a6; box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.15); }
        }
        .otp-success-frame {
          animation: otp-success-pulse 0.4s ease-in-out forwards;
          border-color: #14b8a6 !important;
        }
      `}</style>
      {digits.map((digit, index) => (
        <input
          aria-invalid={invalid}
          aria-label={`Verification code digit ${index + 1} of 6`}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          className={`${compact ? "h-10 rounded-md text-base sm:h-12 sm:rounded-lg sm:text-xl" : "h-11 rounded-lg text-xl sm:h-14 sm:rounded-xl sm:text-2xl"} min-w-0 border bg-white text-center font-mono font-bold text-slate-900 outline-none transition focus:border-water-600 focus:ring-4 focus:ring-water-100 disabled:bg-slate-100 disabled:text-slate-400 ${success ? "otp-success-frame" : invalid ? "border-red-400" : "border-slate-300"}`}
          disabled={disabled}
          id={index === 0 ? id : `${id}-${index + 1}`}
          inputMode="numeric"
          key={index}
          maxLength={index === 0 ? 6 : 1}
          onChange={(event) => handleOnChange(index, event)}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => handleKeyDown(index, event)}
          ref={(element) => { inputRefs.current[index] = element; }}
          style={success ? { animationDelay: `${index * 100}ms`, animationFillMode: "both" } : undefined}
          type="text"
          value={digit.trim()}
        />
      ))}
    </div>
  );
}
