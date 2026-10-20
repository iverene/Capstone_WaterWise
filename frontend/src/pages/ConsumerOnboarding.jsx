import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  Pencil,
  TriangleAlert,
} from "lucide-react";
import { useNavigate } from "react-router";
import {
  completeConsumerOnboarding,
  fetchConsumerProfile,
  updateConsumerProfile,
} from "../services/consumerPortal.service";
import { logout } from "../services/auth.service";
import { clearSession, getStoredAccount } from "../services/authToken";
import { isCanceledRequest } from "../services/apiClient";
import { isValidEmail } from "../utils/email";
import OnboardingDetailsConfirmModal from "../components/OnboardingDetailsConfirmModal";

const DRAFT_KEY_PREFIX = "waterwise:consumer-onboarding-draft:";

// The rail mirrors the stepper of the reference onboarding: one segment per
// section, with the finished and current ones in the accent colour.
const SECTIONS = [
  { id: "setup", label: "Setup" },
  { id: "review", label: "Review" },
];

const passwordRequirements = [
  { id: "length", label: "At least 8 characters", test: (value) => value.length >= 8 },
  { id: "lowercase", label: "One lowercase letter (a–z)", test: (value) => /[a-z]/.test(value) },
  { id: "uppercase", label: "One uppercase letter (A–Z)", test: (value) => /[A-Z]/.test(value) },
  { id: "number", label: "One number (0–9)", test: (value) => /\d/.test(value) },
  { id: "symbol", label: "One symbol (e.g. !@#$)", test: (value) => /[^A-Za-z0-9]/.test(value) },
];

const isStrongPassword = (value) =>
  passwordRequirements.every((requirement) => requirement.test(value));

const isValidContactNumber = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("09");
};

const isSameEmail = (left, right) =>
  String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase();

// The wizard is remounted whenever the app-wide data revision changes (any
// mutating request from any user). Persisting the step keeps the resident
// where they were instead of dumping them back to step 1. Passwords are
// never written to storage.
function readDraft(accountId) {
  try {
    const raw = window.sessionStorage.getItem(`${DRAFT_KEY_PREFIX}${accountId}`);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    return draft && typeof draft === "object" ? draft : null;
  } catch {
    return null;
  }
}

function writeDraft(accountId, draft) {
  try {
    window.sessionStorage.setItem(`${DRAFT_KEY_PREFIX}${accountId}`, JSON.stringify(draft));
  } catch {
    // Drafts are best-effort; the flow still works without them.
  }
}

function clearDraft(accountId) {
  try {
    window.sessionStorage.removeItem(`${DRAFT_KEY_PREFIX}${accountId}`);
  } catch {
    // Ignore.
  }
}

function RequirementList({ requirements }) {
  return (
    <ul className="mt-2 grid gap-1">
      {requirements.map((requirement) => (
        <li
          className={`flex items-center gap-2 text-xs font-semibold ${requirement.met ? "text-emerald-700" : "text-slate-500"}`}
          key={requirement.id}
        >
          <CheckCircle2
            aria-hidden="true"
            className={`h-3.5 w-3.5 ${requirement.met ? "text-emerald-600" : "text-slate-300"}`}
          />
          {requirement.label}
        </li>
      ))}
    </ul>
  );
}

function FieldLabel({ htmlFor, children }) {
  return (
    <label className="text-sm font-bold text-navy-900" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

export default function ConsumerOnboarding() {
  const navigate = useNavigate();
  const accountId = getStoredAccount()?.id ?? null;
  const [draft] = useState(() => (accountId ? readDraft(accountId) : null));

  const [step, setStep] = useState(() => {
    const savedStep = Number(draft?.step);
    return Number.isInteger(savedStep) && savedStep >= 0 && savedStep <= 1 ? savedStep : 0;
  });
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);
  const [contactNumber, setContactNumber] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  // Details the resident left untouched. While this is set the wizard waits
  // for an explicit confirmation before moving on.
  const [keptDetails, setKeptDetails] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const contactInputRef = useRef(null);
  const emailInputRef = useRef(null);

  useEffect(() => {
    if (!accountId) return undefined;
    const controller = new AbortController();
    fetchConsumerProfile({ signal: controller.signal })
      .then((consumer) => {
        setProfile(consumer);
        setContactNumber(consumer.contactNumber ?? "");
        setEmail(consumer.email ?? "");
      })
      .catch((requestError) => {
        if (!isCanceledRequest(requestError)) setLoadError(requestError.message);
      });
    return () => controller.abort();
  }, [accountId, requestVersion]);

  useEffect(() => {
    if (!accountId) return;
    writeDraft(accountId, { step });
  }, [accountId, step]);

  const retryLoad = () => {
    setLoadError("");
    setProfile(null);
    setRequestVersion((version) => version + 1);
  };

  const saveProfileDetails = async () => {
    const trimmedContact = contactNumber.trim();
    const trimmedEmail = email.trim();
    const contactChanged = trimmedContact !== (profile?.contactNumber ?? "");
    const emailChanged =
      trimmedEmail.toLowerCase() !== String(profile?.email ?? "").toLowerCase();

    if (!trimmedContact) {
      setError("Enter your contact number before continuing.");
      requestAnimationFrame(() => contactInputRef.current?.focus());
      return false;
    }

    if (!isValidContactNumber(trimmedContact)) {
      setError("Enter a valid Philippine mobile number, such as 09171234567.");
      requestAnimationFrame(() => contactInputRef.current?.focus());
      return false;
    }

    if (!trimmedEmail) {
      setError("Enter your email address before continuing.");
      requestAnimationFrame(() => emailInputRef.current?.focus());
      return false;
    }

    if (!isValidEmail(trimmedEmail)) {
      setError("Enter a valid email address, such as name@example.com.");
      requestAnimationFrame(() => emailInputRef.current?.focus());
      return false;
    }

    if (!contactChanged && !emailChanged) return true;

    setIsSaving(true);
    try {
      // The email is only sent when it actually changed: the backend refuses
      // a no-op email update.
      const payload = { contactNumber: trimmedContact };
      if (emailChanged) payload.email = trimmedEmail;

      const updated = await updateConsumerProfile(payload);
      setProfile((current) =>
        current
          ? {
              ...current,
              contactNumber: updated?.contact_number ?? trimmedContact,
              email: updated?.email ?? trimmedEmail,
            }
          : current,
      );
    } catch (updateError) {
      setError(updateError.message);
      setIsSaving(false);
      return false;
    }
    setIsSaving(false);
    return true;
  };

  const validatePassword = () => {
    if (!newPassword) {
      setError("Enter your new password.");
      return false;
    }
    if (!isStrongPassword(newPassword)) {
      setError(
        "Use at least 8 characters with uppercase, lowercase, a number, and a symbol.",
      );
      return false;
    }
    if (!confirmation) {
      setError("Confirm your new password.");
      return false;
    }
    if (newPassword !== confirmation) {
      setError("The new passwords do not match.");
      return false;
    }
    return true;
  };

  const proceedToReview = async () => {
    if (isSaving) return;
    setError("");

    if (!validatePassword()) return;
    if (!(await saveProfileDetails())) return;
    setStep(1);
  };

  // Untouched details are never a silent choice: the resident is asked to
  // confirm that the values already on file should be kept.
  const handleContinue = () => {
    if (isSaving) return;
    setError("");

    if (!validatePassword()) return;

    const kept = [];
    if (contactNumber.trim() === (profile?.contactNumber ?? "")) {
      kept.push({ label: "Contact number", value: profile.contactNumber || "—" });
    }
    if (isSameEmail(email, profile?.email)) {
      kept.push({ label: "Email address", value: profile.email || "—" });
    }

    if (kept.length > 0) {
      setKeptDetails(kept);
      return;
    }

    proceedToReview();
  };

  const finishSetup = async () => {
    if (isSaving) return;
    setError("");

    if (!validatePassword()) return;

    setIsSaving(true);

    try {
      // The onboarding endpoint sets the password and marks the account as
      // onboarded in one call. It is allowed to skip the current-password
      // check because the account still carries the password issued by the
      // office and onboarding has never been completed.
      await completeConsumerOnboarding(newPassword);
    } catch (completionError) {
      setIsSaving(false);
      setError(completionError.message);
      return;
    }

    // Changing the password invalidates the session: the access token carries
    // a fingerprint of the password hash. Drop local state and send the
    // resident to the login page instead of leaving a dead session behind.
    if (accountId) clearDraft(accountId);
    clearSession();
    navigate("/login", {
      replace: true,
      state: {
        passwordChanged: true,
        message: "Your account is ready. Sign in with your new password.",
      },
    });
  };

  // Abandoning the wizard signs the resident out instead of leaving a live
  // session behind: the onboarding is required, so the next sign-in has to
  // start it again from the beginning.
  const goBackToLogin = async () => {
    if (isSigningOut || isSaving) return;
    setIsSigningOut(true);
    try {
      await logout();
    } catch {
      // The server could not confirm the sign-out, but the local session is
      // cleared either way.
    } finally {
      setIsSigningOut(false);
      navigate("/login", { replace: true });
    }
  };

  if (loadError) {
    return (
      <main className="flex h-dvh items-center justify-center overflow-y-auto bg-canvas px-5 py-10">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
          <p>{loadError}</p>
          <button className="mt-4 min-h-11 rounded-xl bg-red-700 px-4 font-bold text-white hover:bg-red-800" onClick={retryLoad} type="button">
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex h-dvh items-center justify-center overflow-y-auto bg-canvas px-5 py-10">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-500" role="status">
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
          Preparing your account…
        </p>
      </main>
    );
  }

  const requirementsMet = passwordRequirements.map((requirement) => ({
    ...requirement,
    met: requirement.test(newPassword),
  }));

  // A different email is typed by hand, so it can carry a typo. The address
  // is the anchor for password recovery, which is why it gets a warning.
  const emailChanged = !isSameEmail(email, profile?.email);

  const stepMeta = [
    {
      eyebrow: "Details 1 of 1",
      title: "Let's confirm your account details",
      subtitle:
        "This is your first sign-in. Confirm your contact number, update your email address, and set your new password before you continue.",
      helper: "Fill in your details to continue.",
      cta: "Continue",
    },
    {
      eyebrow: "Summary 1 of 1",
      title: "Review your details",
      subtitle: "Check everything below before you finish setting up your account.",
      helper: "You can go back and change anything.",
      cta: "Finish setup",
    },
  ][step];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas font-sans text-navy-900">
      <header className="shrink-0 border-b border-slate-200 bg-canvas">
        <div className="mx-auto w-full max-w-2xl px-5 pt-5 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-navy-900 sm:text-base">
              <span className="font-bold">{`Step ${step + 1} of ${SECTIONS.length}`}</span>
              <span>{` · ${SECTIONS[step].label}`}</span>
            </p>
            <button
              className="text-sm font-bold text-water-600 transition-colors hover:text-water-700 disabled:opacity-60"
              disabled={isSaving || isSigningOut}
              onClick={goBackToLogin}
              type="button"
            >
              {isSigningOut ? "Signing out…" : "Go back to login"}
            </button>
          </div>

          <ol className="mt-4 flex items-start gap-2 pb-5 sm:gap-3" aria-label="Onboarding progress">
            {SECTIONS.map((section, index) => {
              const isTodo = index > step;
              const isCurrent = index === step;
              return (
                <li className="min-w-0 flex-1" key={section.id}>
                  <span
                    aria-current={isCurrent ? "step" : undefined}
                    className={`block h-2 rounded-full ${isTodo ? "bg-slate-300" : "bg-water-700"}`}
                  />
                  <span
                    className={`mt-2 block truncate text-center text-[11px] sm:text-xs ${
                      isCurrent
                        ? "font-bold text-navy-900"
                        : index < step
                          ? "font-semibold text-navy-900"
                          : "text-slate-500"
                    }`}
                  >
                    {section.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-2xl px-5 py-8 pb-10 sm:px-8 sm:py-10">
          <div className="ww-onb-step-enter" key={step}>
            <h1 className="text-xl font-bold leading-tight tracking-tight text-navy-900 sm:text-2xl">
              {stepMeta.title}
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600 sm:text-sm">
              {stepMeta.subtitle}
            </p>
            <p className="mt-4 text-[11px] font-bold text-water-700 sm:text-xs">{stepMeta.eyebrow}</p>
          </div>

          {step === 0 && (
            <div className="mt-6 space-y-6">
              <div className="ww-onb-fade-up" style={{ animationDelay: "0ms" }}>
                <FieldLabel htmlFor="onboarding-contact-number">Contact number</FieldLabel>
                <input
                  aria-describedby="onboarding-contact-helper"
                  autoComplete="tel"
                  className="ww-field mt-2 px-4 text-sm"
                  disabled={isSaving}
                  id="onboarding-contact-number"
                  inputMode="tel"
                  onChange={(event) => {
                    setContactNumber(event.target.value);
                    setError("");
                  }}
                  placeholder="09171234567"
                  ref={contactInputRef}
                  type="tel"
                  value={contactNumber}
                />
                <p className="mt-1.5 text-xs text-slate-500" id="onboarding-contact-helper">
                  An 11-digit mobile number starting with 09.
                </p>
              </div>

              <div className="ww-onb-fade-up" style={{ animationDelay: "70ms" }}>
                <FieldLabel htmlFor="onboarding-email">Email address</FieldLabel>
                <input
                  aria-describedby="onboarding-email-helper"
                  autoComplete="email"
                  className="ww-field mt-2 px-4 text-sm"
                  disabled={isSaving}
                  id="onboarding-email"
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                  }}
                  placeholder="name@example.com"
                  ref={emailInputRef}
                  type="email"
                  value={email}
                />
                <p className="mt-1.5 text-xs leading-5 text-slate-500" id="onboarding-email-helper">
                  Billing notices and service updates go to this address. You can change it later
                  from{" "}
                  <span className="font-semibold text-slate-600">
                    Profile &rarr; Account settings &rarr; Change email
                  </span>
                  , which sends a 6-digit verification code to your current email address.
                </p>

                {emailChanged ? (
                  <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <TriangleAlert
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                    />
                    <p className="text-xs leading-5 text-amber-800">
                      <span className="font-bold">Double-check this address.</span> WaterWise
                      sends your password reset codes here. If you make a typo, you will need the
                      water district office to restore your account.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="ww-onb-fade-up" style={{ animationDelay: "140ms" }}>
                <p className="text-sm font-bold text-navy-900">Password</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Your account was issued a default password by the water district office. Choose
                  your own password now.
                </p>

                <div className="mt-3">
                  <FieldLabel htmlFor="onboarding-new-password">Change password</FieldLabel>
                  <div className="relative">
                    <input
                      autoComplete="new-password"
                      className="ww-field mt-2 pl-4 pr-11 text-sm"
                      disabled={isSaving}
                      id="onboarding-new-password"
                      onChange={(event) => {
                        setNewPassword(event.target.value);
                        setError("");
                      }}
                      type={showPasswords ? "text" : "password"}
                      value={newPassword}
                    />
                    <button
                      aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      onClick={() => setShowPasswords((shown) => !shown)}
                      tabIndex={-1}
                      type="button"
                    >
                      {showPasswords ? (
                        <EyeOff aria-hidden="true" className="h-4 w-4" />
                      ) : (
                        <Eye aria-hidden="true" className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <RequirementList requirements={requirementsMet} />
                </div>

                <div className="mt-4">
                  <FieldLabel htmlFor="onboarding-confirm-password">Confirm password</FieldLabel>
                  <input
                    autoComplete="new-password"
                    className="ww-field mt-2 px-4 text-sm"
                    disabled={isSaving}
                    id="onboarding-confirm-password"
                    onChange={(event) => {
                      setConfirmation(event.target.value);
                      setError("");
                    }}
                    type={showPasswords ? "text" : "password"}
                    value={confirmation}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="mt-6 space-y-5">
              <div className="ww-onb-fade-up" style={{ animationDelay: "0ms" }}>
                <p className="text-sm font-bold text-navy-900">Username</p>
                <p className="mt-1 break-words text-sm text-navy-900">
                  {profile.username || "—"}
                </p>
                <p className="mt-1.5 text-xs leading-5 text-slate-500">
                  Your sign-in username. Your password can be changed from your profile.
                </p>
              </div>

              <div className="ww-onb-fade-up" style={{ animationDelay: "70ms" }}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-navy-900">Contact number</p>
                  <button
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-water-600 transition-colors hover:text-water-700"
                    onClick={() => {
                      setError("");
                      setKeptDetails(null);
                      setStep(0);
                    }}
                    type="button"
                  >
                    <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                    Edit
                  </button>
                </div>
                <p className="mt-1 text-sm text-navy-900">{contactNumber.trim() || "—"}</p>
              </div>

              <div className="ww-onb-fade-up" style={{ animationDelay: "140ms" }}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-navy-900">Email address</p>
                  <button
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-water-600 transition-colors hover:text-water-700"
                    onClick={() => {
                      setError("");
                      setKeptDetails(null);
                      setStep(0);
                    }}
                    type="button"
                  >
                    <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                    Edit
                  </button>
                </div>
                <p className="mt-1 break-words text-sm text-navy-900">{email.trim() || "—"}</p>
                <p className="mt-1.5 text-xs leading-5 text-slate-500">
                  Billing notices and service updates go to this address.
                </p>
              </div>

              <div className="ww-onb-fade-up" style={{ animationDelay: "210ms" }}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-navy-900">Password</p>
                  <button
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-water-600 transition-colors hover:text-water-700"
                    onClick={() => {
                      setError("");
                      setKeptDetails(null);
                      setStep(0);
                    }}
                    type="button"
                  >
                    <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                    Edit
                  </button>
                </div>
                <p className="mt-1 text-sm text-navy-900">
                  Your new password will be applied when you finish.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-2xl px-5 py-4 sm:px-8">
          {error ? (
            <p
              className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            {step === 1 ? (
              <button
                className="order-3 inline-flex items-center gap-1.5 self-center text-sm font-bold text-slate-500 transition-colors hover:text-navy-900 sm:order-1 sm:self-auto"
                onClick={() => {
                  setError("");
                  setKeptDetails(null);
                  setStep(0);
                }}
                type="button"
              >
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                Back
              </button>
            ) : null}

            <p className="order-1 text-center text-sm text-slate-600 sm:order-2 sm:flex-1">
              {stepMeta.helper}
            </p>

            <div className="order-2 sm:order-3 sm:w-auto sm:min-w-[220px]">
              <button
                className="ww-onb-cta ww-primary-button flex min-h-12 w-full items-center justify-center gap-2 px-6 text-sm"
                disabled={isSaving}
                onClick={step === 0 ? handleContinue : finishSetup}
                type="button"
              >
                {isSaving ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    {stepMeta.cta}
                    <ArrowRight aria-hidden="true" className="ww-onb-arrow h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </footer>

      <OnboardingDetailsConfirmModal
        isOpen={keptDetails !== null}
        kept={keptDetails ?? []}
        onCancel={() => setKeptDetails(null)}
        onConfirm={() => {
          setKeptDetails(null);
          proceedToReview();
        }}
      />
    </div>
  );
}
