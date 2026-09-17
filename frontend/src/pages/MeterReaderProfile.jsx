import { useCallback, useEffect, useState } from "react";
import { KeyRound, LogOut, Mail } from "lucide-react";
import { useNavigate } from "react-router";
import AdminProfileBanner from "../components/AdminProfileBanner";
import LoadingSkeleton from "../components/LoadingSkeleton";
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
        <LoadingSkeleton label="Loading meter reader profile" variant="profile" />
      </div>
    );
  }


  return (
    <div className="space-y-5 sm:space-y-6">
      <AdminProfileBanner account={reader} displayName={reader.name} roleLabel="Meter Reader" subtitle={"WaterWise Meter Reader"} tagline={<>&ldquo;Every reading counts<br />for a better tomorrow.&rdquo;</>} />





      <section aria-labelledby="account-settings-heading">
        <h2 className="text-base font-extrabold tracking-tight text-navy-900" id="account-settings-heading">Account settings</h2>
        <p className="mt-1 text-xs leading-6 text-slate-600">Manage your password, email address, and sign out.</p>
        <div className="mt-5 grid gap-3">
          <button className="flex min-h-16 items-center gap-3 rounded-xl bg-slate-50 px-4 py-1 text-left transition-colors hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600" onClick={() => navigate("/account/change-password")} type="button">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-100 text-water-700"><KeyRound aria-hidden="true" className="h-5 w-5" /></span>
            <span><span className="block text-sm font-bold text-navy-900">Change password</span><span className="mt-1 block text-xs leading-5 text-slate-500">Use your current password or email OTP.</span></span>
          </button>
          <button className="flex min-h-16 items-center gap-3 rounded-xl bg-slate-50 px-4 py-1 text-left transition-colors hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600" onClick={() => navigate("/account/change-email")} type="button">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-100 text-water-700"><Mail aria-hidden="true" className="h-5 w-5" /></span>
            <span><span className="block text-sm font-bold text-navy-900">Change email</span><span className="mt-1 block text-xs leading-5 text-slate-500">Verify through registered email.</span></span>
          </button>
          <button className="flex min-h-16 items-center gap-3 rounded-xl bg-red-50 px-4 py-1 text-left transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600" onClick={() => window.dispatchEvent(new Event("waterwise:request-logout"))} type="button">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700"><LogOut aria-hidden="true" className="h-5 w-5" /></span>
            <span><span className="block text-sm font-bold text-red-700">Log out</span><span className="mt-1 block text-xs leading-5 text-slate-500">End this session on this device.</span></span>
          </button>
        </div>
      </section>
    </div>
  );
}
