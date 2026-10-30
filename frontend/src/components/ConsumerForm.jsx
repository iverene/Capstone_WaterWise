import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleOff, Eye, EyeOff, Phone, ShieldCheck, UserRound, UsersRound, Mail, LockKeyhole, LoaderCircle } from "lucide-react";
import Dropdown from "./Dropdown";
import { DEFAULT_RESIDENT_PASSWORD } from "../utils/residentCredentials";
import { toLocalMobileNumber } from "../utils/phoneNumber";
import { isValidEmail } from "../utils/email";

const initialState = {
  accountName: "",
  firstName: "",
  middleName: "",
  lastName: "",
  purok: "",
  email: "",
  contactNumber: "",
  status: "active",
};

function splitLegacyFullName(fullName) {
  const parts = String(fullName ?? "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", middleName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], middleName: "", lastName: "" };
  if (parts.length === 2) return { firstName: parts[0], middleName: "", lastName: parts[1] };
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(" "), lastName: parts[parts.length - 1] };
}

function createInitialState(initialData) {
  if (!initialData) return initialState;

  const legacy = initialData.firstName === undefined ? splitLegacyFullName(initialData.fullName) : null;

  return {
    ...initialState,
    ...initialData,
    accountName: String(initialData.accountName ?? initialData.username ?? ""),
    firstName: String(legacy?.firstName ?? initialData.firstName ?? ""),
    middleName: String(legacy?.middleName ?? initialData.middleName ?? ""),
    lastName: String(legacy?.lastName ?? initialData.lastName ?? ""),
    purok: String(initialData.purok ?? ""),
    email: String(initialData.email ?? ""),
    contactNumber: toLocalMobileNumber(initialData.contactNumber ?? initialData.contact_number ?? ""),
    status: String(initialData.status ?? "active"),
  };
}

function isStrongPassword(password) {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function isValidContactNumber(contactNumber) {
  const digitsOnly = String(contactNumber ?? "").replace(/\D/g, "");
  return /^09\d{9}$/.test(digitsOnly);
}

function isValidName(value) {
  return /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(String(value ?? "").trim());
}

function ConsumerForm({ allowPasswordChange = false, embedded = false, registrationDesign = false, onSubmit = () => {}, requirePassword = false, initialData = null, onDirtyChange, onCancel }) {
  const formRef = useRef(null);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [consumer, setConsumer] = useState(() => createInitialState(initialData));
  // New residents start with the office default password so the staff member
  // does not have to invent one at the counter. Editing an existing resident
  // must start blank, otherwise an untouched field would silently reset their
  // password on save.
  const defaultPassword = requirePassword && !initialData ? DEFAULT_RESIDENT_PASSWORD : "";
  const isNewResident = requirePassword && !initialData;
  const [password, setPassword] = useState(defaultPassword);
  const [showPassword, setShowPassword] = useState(true);
  const [errors, setErrors] = useState({});

  // Reports whether the form differs from its opening values so the parent
  // can confirm before discarding. Only the dirty flag leaves this component.
  const baseline = useMemo(() => createInitialState(initialData), [initialData]);
  useEffect(() => {
    if (!onDirtyChange) return;
    const dirty =
      String(password ?? "") !== defaultPassword ||
      [
        "accountName",
        "firstName",
        "middleName",
        "lastName",
        "purok",
        "email",
        "contactNumber",
        "status",
      ].some((field) => String(consumer[field] ?? "") !== String(baseline[field] ?? ""));
    onDirtyChange(dirty);
  }, [baseline, consumer, password, defaultPassword, onDirtyChange]);

  const updateField = (field, value) => {
    setConsumer((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: "" }));
  };

  const validate = () => {
    const validationErrors = {};

    if (!String(consumer.firstName ?? "").trim()) {
      validationErrors.firstName = "Enter the resident's first name.";
    }
    if (!String(consumer.lastName ?? "").trim()) {
      validationErrors.lastName = "Enter the resident's last name.";
    }
    for (const field of ["firstName", "middleName", "lastName"]) {
      const value = String(consumer[field] ?? "").trim();
      const existingValue = String(baseline[field] ?? "").trim();
      // Keep legacy names containing digits editable when left unchanged.
      if (value && !isValidName(value) && (!initialData || value !== existingValue)) {
        validationErrors[field] = "Use letters only; spaces, hyphens, and apostrophes are allowed.";
      }
    }
    if (!String(consumer.accountName ?? "").trim()) {
      validationErrors.accountName = "Enter a username.";
    }
    if (!consumer.purok) {
      validationErrors.purok = "Select the resident's purok.";
    }
    if (!String(consumer.email ?? "").trim()) {
      validationErrors.email = "Enter the resident's email address.";
    } else if (!isValidEmail(consumer.email)) {
      validationErrors.email = "Enter a valid email address with a domain, such as name@example.com.";
    }
    if (!String(consumer.contactNumber ?? "").trim()) {
      validationErrors.contactNumber = "Enter the resident's contact number.";
    } else if (!isValidContactNumber(consumer.contactNumber)) {
      validationErrors.contactNumber = "Enter an 11-digit Philippine mobile number starting with 09, such as 09171234567.";
    }
    if (requirePassword) {
      if (!password) {
        validationErrors.password = "Enter a password.";
      } else if (!isStrongPassword(password)) {
        validationErrors.password =
          "Password is weak. Try at least 8 characters with uppercase, lowercase, a number, and a symbol.";
      }
    } else if (allowPasswordChange && password && !isStrongPassword(password)) {
      validationErrors.password =
        "Password is weak. Try at least 8 characters with uppercase, lowercase, a number, and a symbol.";
    }

    setErrors(validationErrors);
    requestAnimationFrame(() => {
      formRef.current?.querySelector('[aria-invalid="true"]')?.focus();
    });
    return Object.keys(validationErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submittingRef.current) return;
    if (!validate()) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const saved = await onSubmit({
        ...consumer,
        ...((requirePassword || allowPasswordChange) && password ? { password } : {}),
      });

      if (saved === false) return;

      setConsumer(initialState);
      setPassword(defaultPassword);
      setShowPassword(false);
      setErrors({});
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const inputClass = (field, extraClasses = "") => [
    "min-h-12 w-full rounded-xl border bg-white px-4 text-sm text-navy-900 outline-none transition-colors placeholder:text-slate-400 focus:ring-4 sm:text-base",
    errors[field]
      ? "border-red-600 focus:border-red-600 focus:ring-red-100"
      : "border-slate-300 focus:border-water-600 focus:ring-water-100",
    extraClasses,
  ].join(" ");
  const labelClass = "text-sm font-bold text-slate-700";
  const errorClass = "mt-1.5 text-sm font-semibold leading-5 text-red-600";
  const describedBy = (field, helperId) => [errors[field] ? `${field}-error` : "", helperId].filter(Boolean).join(" ") || undefined;

  return (
    <form autoComplete="off" className={registrationDesign ? "resident-registration-form bg-white" : embedded ? "bg-white" : "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"} onSubmit={handleSubmit} ref={formRef}>
      {!embedded && <header className="bg-navy-950 p-5 text-white sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-water-900 text-water-300">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-water-300">Resident account</p>
            <h2 className="mt-1 text-2xl font-extrabold">{initialData ? "Edit resident" : "Add resident"}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              {initialData ? "Update the resident's service information." : "Enter the resident's details and create secure sign-in credentials."}
            </p>
          </div>
        </div>
      </header>}

      <div className={`resident-fields grid gap-5 p-5 sm:p-6 ${registrationDesign ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <div>
          <label className={labelClass} htmlFor="resident-first-name">First name{registrationDesign && <span className="text-red-500"> *</span>}</label>
          <div className="relative mt-2">
{registrationDesign && <UserRound aria-hidden="true" className="resident-input-icon" />}
          <input
            aria-describedby={describedBy("firstName")}
            aria-invalid={Boolean(errors.firstName)}
            autoComplete="off"
            className={inputClass("firstName", registrationDesign ? "pl-12" : "")}
            id="resident-first-name"
            onChange={(event) => updateField("firstName", event.target.value)}
            placeholder="e.g. Juan"
            type="text"
            value={consumer.firstName}
          />
</div>
          {errors.firstName && <p className={errorClass} id="firstName-error" role="alert">{errors.firstName}</p>}
        </div>

        <div>
          <label className={labelClass} htmlFor="resident-middle-name">Middle name <span className="font-normal text-slate-500">(optional)</span></label>
          <div className="relative mt-2">
{registrationDesign && <UserRound aria-hidden="true" className="resident-input-icon" />}
          <input
            aria-describedby={describedBy("middleName")}
            aria-invalid={Boolean(errors.middleName)}
            autoComplete="off"
            className={inputClass("middleName", registrationDesign ? "pl-12" : "")}
            id="resident-middle-name"
            onChange={(event) => updateField("middleName", event.target.value)}
            placeholder="e.g. Santos"
            type="text"
            value={consumer.middleName}
          />
</div>
          {errors.middleName && <p className={errorClass} id="middleName-error" role="alert">{errors.middleName}</p>}
        </div>

        <div>
          <label className={labelClass} htmlFor="resident-last-name">Last name{registrationDesign && <span className="text-red-500"> *</span>}</label>
          <div className="relative mt-2">
{registrationDesign && <UserRound aria-hidden="true" className="resident-input-icon" />}
          <input
            aria-describedby={describedBy("lastName")}
            aria-invalid={Boolean(errors.lastName)}
            autoComplete="off"
            className={inputClass("lastName", registrationDesign ? "pl-12" : "")}
            id="resident-last-name"
            onChange={(event) => updateField("lastName", event.target.value)}
            placeholder="e.g. Dela Cruz"
            type="text"
            value={consumer.lastName}
          />
</div>
          {errors.lastName && <p className={errorClass} id="lastName-error" role="alert">{errors.lastName}</p>}
        </div>

        <div>
          <label className={labelClass} htmlFor="resident-username">Username{registrationDesign && <span className="text-red-500"> *</span>}</label>
          <div className="relative mt-2">
{registrationDesign && <UserRound aria-hidden="true" className="resident-input-icon" />}
          <input
            aria-describedby={describedBy("accountName")}
            aria-invalid={Boolean(errors.accountName)}
            autoComplete="off"
            className={inputClass("accountName", registrationDesign ? "pl-12" : "")}
            id="resident-username"
            onChange={(event) => updateField("accountName", event.target.value)}
            placeholder="e.g. juandelacruz"
            spellCheck="false"
            type="text"
            value={consumer.accountName}
          />
</div>
          {errors.accountName && <p className={errorClass} id="accountName-error" role="alert">{errors.accountName}</p>}
        </div>

        <div>
          <label className={labelClass} htmlFor="purok">Purok{registrationDesign && <span className="text-red-500"> *</span>}</label>
          <Dropdown
            ariaDescribedBy={describedBy("purok")}
            ariaInvalid={Boolean(errors.purok)}
            ariaLabel="Select resident purok"
            className="mt-2"
            icon={registrationDesign ? UsersRound : undefined}
            id="purok"
            name="purok"
            onValueChange={(value) => updateField("purok", value)}
            options={[1, 2, 3, 4, 5, 6].map((number) => ({
              label: `Purok ${number}`,
              value: `Purok ${number}`,
            }))}
            placeholder="Select purok"
            value={consumer.purok}
          />
          {errors.purok && <p className={errorClass} id="purok-error" role="alert">{errors.purok}</p>}
        </div>

        <div>
          <label className={labelClass} htmlFor="resident-contact-number">Contact number{registrationDesign && <span className="text-red-500"> *</span>}</label>
          <div className="relative mt-2">
            <Phone aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              aria-describedby={describedBy("contactNumber", "contact-number-helper")}
              aria-invalid={Boolean(errors.contactNumber)}
              autoComplete="tel"
              className={inputClass("contactNumber", "pl-12 font-mono tabular-nums")}
              id="resident-contact-number"
              inputMode="numeric"
              maxLength={11}
              onChange={(event) => updateField("contactNumber", event.target.value.replace(/\D/g, "").slice(0, 11))}
              placeholder="09171234567"
              type="tel"
              value={consumer.contactNumber}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500" id="contact-number-helper">Enter an 11-digit mobile number starting with 09.</p>
          {errors.contactNumber && <p className={errorClass} id="contactNumber-error" role="alert">{errors.contactNumber}</p>}
        </div>

        <div>
          <label className={labelClass} htmlFor="resident-email">Email address{registrationDesign && <span className="text-red-500"> *</span>}</label>
          <div className="relative mt-2">
{registrationDesign && <Mail aria-hidden="true" className="resident-input-icon" />}
          <input
            aria-describedby={describedBy("email", "email-helper")}
            aria-invalid={Boolean(errors.email)}
            autoComplete="email"
            className={inputClass("email", registrationDesign ? "pl-12" : "")}
            id="resident-email"
            inputMode="email"
            onChange={(event) => updateField("email", event.target.value)}
            placeholder="name@example.com"
            spellCheck="false"
            type="email"
            value={consumer.email}
          />
</div>
          <p className="mt-1.5 text-xs text-slate-500" id="email-helper">Enter the complete email address. We’ll check that its domain is configured to receive email when you save.</p>
          {errors.email && <p className={errorClass} id="email-error" role="alert">{errors.email}</p>}
        </div>

        {(requirePassword || allowPasswordChange) && (
          <div>
            <label className={labelClass} htmlFor="resident-password">{allowPasswordChange ? "New password" : "Password (default)"}{registrationDesign && <span className="text-red-500"> *</span>}{allowPasswordChange && <span className="font-normal text-slate-500"> (optional)</span>}</label>
            <div className="relative mt-2">
              {registrationDesign && <LockKeyhole aria-hidden="true" className="resident-input-icon" />}
              <input
                aria-describedby={describedBy("password", "password-helper")}
                aria-invalid={Boolean(errors.password)}
                autoComplete="new-password"
                className={inputClass("password", registrationDesign ? "pl-12 pr-12" : "pr-12")}
                id="resident-password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrors((previous) => ({ ...previous, password: "" }));
                }}
                placeholder={allowPasswordChange ? "Leave blank to keep current password" : "Office default password"}
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-500 transition-colors hover:text-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-water-600"
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-slate-500" id="password-helper">
              {allowPasswordChange
                ? "Changing the password requires administrator verification."
                : "Use 8 or more characters with uppercase, lowercase, a number, and a symbol."}
            </p>
            {isNewResident && password !== DEFAULT_RESIDENT_PASSWORD && (
              <button
                className="mt-1.5 text-xs font-bold text-water-700 underline-offset-2 hover:underline"
                onClick={() => {
                  setPassword(DEFAULT_RESIDENT_PASSWORD);
                  setErrors((previous) => ({ ...previous, password: "" }));
                }}
                type="button"
              >
                Use the office default password
              </button>
            )}
            {errors.password && <p className={errorClass} id="password-error" role="alert">{errors.password}</p>}
          </div>
        )}

        {initialData && (
          <div className={registrationDesign ? "sm:col-span-3" : "sm:col-span-2"}>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${consumer.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  {consumer.status === "active"
                    ? <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                    : <CircleOff aria-hidden="true" className="h-4 w-4" />}
                </span>
                <div>
                  <p className="text-xs font-bold text-navy-900">Account status</p>
                  <p className={`mt-0.5 text-xs font-semibold ${consumer.status === "active" ? "text-emerald-700" : "text-red-700"}`}>
                    {consumer.status === "active" ? "Active — resident can use the account" : "Disconnected — resident can still access the portal"}
                  </p>
                </div>
              </div>
              <button
                aria-checked={consumer.status === "active"}
                aria-label={`Set resident account ${consumer.status === "active" ? "disconnected" : "active"}`}
                className={`relative h-8 w-14 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2 ${consumer.status === "active" ? "bg-emerald-600" : "bg-slate-300"}`}
                onClick={() => updateField("status", consumer.status === "active" ? "disconnected" : "active")}
                role="switch"
                type="button"
              >
                <span className={`absolute left-1 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform ${consumer.status === "active" ? "translate-x-6" : "translate-x-0"}`} />
              </button>
            </div>
          </div>
        )}

        {registrationDesign && <div className="resident-security"><span><ShieldCheck aria-hidden="true" size={24} /></span><div><p className="font-bold text-navy-900">Account Security</p><p>The resident can change their password after signing in.</p></div></div>}
        <div className={`resident-form-actions flex flex-row items-start gap-2 ${registrationDesign ? "sm:col-span-3" : "sm:col-span-2"}`}>
          {onCancel && (
            <button className="min-h-12 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-navy-900 transition-colors hover:bg-slate-50" onClick={onCancel} type="button">
              Cancel
            </button>
          )}
          <button aria-busy={submitting} disabled={submitting} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-water-600 px-3 text-sm font-bold text-white transition-colors hover:bg-water-700 disabled:cursor-wait disabled:opacity-60" type="submit">
            {submitting && <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />}
            {submitting ? (initialData ? "Updating resident…" : "Adding resident…") : initialData ? "Update resident" : "Add resident"}
          </button>
        </div>
      </div>
    </form>
  );
}

export default ConsumerForm;
