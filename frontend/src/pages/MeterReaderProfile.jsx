import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleSlash2, KeyRound, Mail, UserRound } from "lucide-react";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import { useNavigate } from "react-router";
import { isCanceledRequest } from "../services/apiClient";
import { fetchMeterReaderProfile } from "../services/meterReaderProfile.service";

export default function MeterReaderProfile() {
  const navigate = useNavigate();
  const [reader, setReader] = useState(null);
  const [error, setError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);

  const retry = useCallback(() => {
    setReader(null);
    setError("");
    setRequestVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchMeterReaderProfile({ signal: controller.signal })
      .then(setReader)
      .catch((requestError) => {
        if (!isCanceledRequest(requestError)) setError(requestError.message);
      });
    return () => controller.abort();
  }, [requestVersion]);

  useEffect(() => {
    const handleEmailChange = (event) => {
      setReader((current) => current ? { ...current, email: event.detail?.email ?? current.email } : current);
    };
    window.addEventListener("waterwise:email-changed", handleEmailChange);
    return () => window.removeEventListener("waterwise:email-changed", handleEmailChange);
  }, []);

  if (error) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <PageHeader compact description="Review the personal information registered to your account." eyebrow="Meter reader profile" />
        <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span>{error}</span>
          <button className="min-h-11 rounded-xl bg-red-700 px-4 font-bold text-white hover:bg-red-800" onClick={retry} type="button">
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!reader) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <PageHeader compact description="Review the personal information registered to your account." eyebrow="Meter reader profile" />
        <LoadingSkeleton label="Loading meter reader profile" variant="profile" />
      </div>
    );
  }

  const isActive = String(reader.status ?? "").toLowerCase() === "active";
  const StatusIcon = isActive ? CheckCircle2 : CircleSlash2;
  const statusLabel = String(reader.status ?? "")
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader compact description="Review the personal information registered to your account." eyebrow="Meter reader profile" />

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card sm:p-4" aria-labelledby="profile-name">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-water-50 text-water-700">
              <UserRound aria-hidden="true" className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-water-700">Account holder</p>
              <h2 className="mt-1 break-words text-sm font-extrabold tracking-tight text-navy-900 sm:text-base" id="profile-name">
                {reader.name}
              </h2>
            </div>
          </div>
          {reader.status && (
            <span className={`inline-flex min-h-7 w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
              isActive
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-300 bg-slate-100 text-slate-700"
            }`}>
              <StatusIcon aria-hidden="true" className="h-3.5 w-3.5" />
              {statusLabel} account
            </span>
          )}
        </div>
      </section>

      <section aria-labelledby="account-center-heading">
        <h2 className="text-base font-extrabold tracking-tight text-navy-900" id="account-center-heading">Account center</h2>
        <p className="mt-1 text-xs leading-6 text-slate-600">Review your account info.</p>
        <button className="mt-5 flex min-h-16 w-full items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-1 text-left transition hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600" onClick={() => navigate("/meter-reader/account-information")} type="button">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-100 text-water-700"><UserRound aria-hidden="true" className="h-5 w-5" /></span>
            <span><span className="block text-sm font-extrabold text-navy-900">Account information</span><span className="mt-1 block text-xs leading-5 text-slate-500">View account details.</span></span>
          </span>
        </button>
      </section>

      <section aria-labelledby="account-settings-heading">
        <h2 className="text-base font-extrabold tracking-tight text-navy-900" id="account-settings-heading">Account settings</h2>
        <p className="mt-1 text-xs leading-6 text-slate-600">Manage your password and email address.</p>
        <div className="mt-5 grid gap-3">
          <button className="flex min-h-16 items-center gap-3 rounded-xl bg-slate-50 px-4 py-1 text-left transition-colors hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600" onClick={() => window.dispatchEvent(new Event("waterwise:open-change-password"))} type="button">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-100 text-water-700"><KeyRound aria-hidden="true" className="h-5 w-5" /></span>
            <span><span className="block text-sm font-bold text-navy-900">Change password</span><span className="mt-1 block text-xs leading-5 text-slate-500">Use your current password or email OTP.</span></span>
          </button>
          <button className="flex min-h-16 items-center gap-3 rounded-xl bg-slate-50 px-4 py-1 text-left transition-colors hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600" onClick={() => window.dispatchEvent(new Event("waterwise:open-change-email"))} type="button">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-100 text-water-700"><Mail aria-hidden="true" className="h-5 w-5" /></span>
            <span><span className="block text-sm font-bold text-navy-900">Change email</span><span className="mt-1 block text-xs leading-5 text-slate-500">Verify through registered email.</span></span>
          </button>
        </div>
      </section>
    </div>
  );
}
