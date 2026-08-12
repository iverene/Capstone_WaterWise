import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  CheckCircle2,
  CircleSlash2,
  KeyRound,
  Mail,
  UserRound,
} from "lucide-react";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import { useNavigate } from "react-router";
import { isCanceledRequest } from "../services/apiClient";
import { fetchConsumerProfile } from "../services/consumerPortal.service";
import {
  disableCurrentPushNotifications,
  enablePushNotifications,
  getCurrentPushSubscription,
  pushSupported,
} from "../services/pushNotifications";

const hasValue = (value) => value !== null && value !== undefined && value !== "";

function PushNotificationSetting() {
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const supported = pushSupported();

  const loadCurrentSubscription = useCallback(async () => {
    if (!supported) return;
    setCurrentSubscription(await getCurrentPushSubscription());
  }, [supported]);

  useEffect(() => {
    queueMicrotask(() => loadCurrentSubscription().catch((error) => setMessage(error.message)));
  }, [loadCurrentSubscription]);

  const toggleNotifications = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (currentSubscription) {
        await disableCurrentPushNotifications();
        setMessage("Push notifications are off on this device.");
      } else {
        await enablePushNotifications();
        setMessage("Push notifications are on for this device.");
      }
      await loadCurrentSubscription();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return <div>
    <div className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-100 text-water-700"><Bell aria-hidden="true" className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-navy-900">Push notifications</span><span className="mt-1 block text-xs leading-5 text-slate-500">Receive notification and alerts.</span></span>
      <button aria-checked={Boolean(currentSubscription)} aria-label="Toggle push notifications on this device" className={`relative h-7 w-12 shrink-0 rounded-full transition ${currentSubscription ? "bg-water-600" : "bg-slate-300"} disabled:opacity-60`} disabled={busy || !supported} onClick={toggleNotifications} role="switch" type="button"><span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${currentSubscription ? "translate-x-5" : "translate-x-0"}`} /></button>
    </div>
    {!supported && <p className="mt-2 text-xs font-semibold text-amber-700">This browser does not support push notifications.</p>}
    {message && <p className="mt-2 text-xs font-semibold text-slate-600" role="status">{message}</p>}
  </div>;
}

export default function ConsumerProfile({ consumer: consumerProp }) {
  const navigate = useNavigate();
  const usesApi = consumerProp === undefined;
  const [loadedConsumer, setLoadedConsumer] = useState(null);
  const [error, setError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);

  const retry = useCallback(() => {
    setLoadedConsumer(null);
    setError("");
    setRequestVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (!usesApi) return undefined;

    const controller = new AbortController();
    fetchConsumerProfile({ signal: controller.signal })
      .then(setLoadedConsumer)
      .catch((requestError) => {
        if (!isCanceledRequest(requestError)) setError(requestError.message);
      });

    return () => controller.abort();
  }, [requestVersion, usesApi]);

  useEffect(() => {
    const handleEmailChange = (event) => {
      setLoadedConsumer((current) => current ? { ...current, email: event.detail?.email ?? current.email } : current);
    };
    window.addEventListener("waterwise:email-changed", handleEmailChange);
    return () => window.removeEventListener("waterwise:email-changed", handleEmailChange);
  }, []);

  const consumer = usesApi ? loadedConsumer : consumerProp;
  const pageHeader = (
    <PageHeader
      compact
      description="Review the personal  information registered to your account."
      eyebrow="Resident profile"
    />
  );

  if (error) {
    return (
      <div className="space-y-5 sm:space-y-6">
        {pageHeader}
        <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span>{error}</span>
          <button className="min-h-11 rounded-xl bg-red-700 px-4 font-bold text-white hover:bg-red-800" onClick={retry} type="button">
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!consumer) {
    return (
      <div className="space-y-5 sm:space-y-6">
        {pageHeader}
        <LoadingSkeleton label="Loading consumer profile" variant="profile" />
      </div>
    );
  }

  const isActive = String(consumer.status ?? "").toLowerCase() === "active";
  const StatusIcon = isActive ? CheckCircle2 : CircleSlash2;
  const statusLabel = String(consumer.status ?? "")
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
  return (
    <div className="space-y-5 sm:space-y-6">
      {pageHeader}

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card sm:p-4" aria-labelledby="profile-name">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-water-50 text-water-700">
              <UserRound aria-hidden="true" className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-water-700">Account holder</p>
              <h2 className="mt-1 break-words text-lg font-extrabold tracking-tight text-navy-900 sm:text-xl" id="profile-name">
                {consumer.name}
              </h2>
              {hasValue(consumer.purok) && <p className="mt-1 text-[11px] font-semibold text-slate-600 sm:text-xs">{consumer.purok}</p>}
            </div>
          </div>
          {hasValue(consumer.status) && (
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
        <h2 className="text-xl font-extrabold tracking-tight text-navy-900" id="account-center-heading">Account center</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Review the information registered to your household account.</p>
        <button className="mt-5 flex min-h-16 w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-1   text-left transition hover:border-water-300 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600" onClick={() => navigate("/consumer/account-information")} type="button">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-100 text-water-700"><UserRound aria-hidden="true" className="h-5 w-5" /></span>
            <span><span className="block text-sm font-extrabold text-navy-900">Account information</span><span className="mt-1 block text-xs leading-5 text-slate-500">View your registered account service details.</span></span>
          </span>
        </button>
      </section>

      <section aria-labelledby="account-settings-heading">
        <h2 className="text-xl font-extrabold tracking-tight text-navy-900" id="account-settings-heading">Account settings</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Manage your password, email address, and notifications.</p>
        <div className="mt-5 grid gap-3">
          <button className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-1 text-left transition-colors hover:border-water-300 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600" onClick={() => window.dispatchEvent(new Event("waterwise:open-change-password"))} type="button">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-100 text-water-700"><KeyRound aria-hidden="true" className="h-5 w-5" /></span>
            <span><span className="block text-sm font-bold text-navy-900">Change password</span><span className="mt-1 block text-xs leading-5 text-slate-500">Use your current password or email OTP.</span></span>
          </button>
          <button className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-1 text-left transition-colors hover:border-water-300 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600" onClick={() => window.dispatchEvent(new Event("waterwise:open-change-email"))} type="button">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-100 text-water-700"><Mail aria-hidden="true" className="h-5 w-5" /></span>
            <span><span className="block text-sm font-bold text-navy-900">Change email</span><span className="mt-1 block text-xs leading-5 text-slate-500">Verify through your current registered email.</span></span>
          </button>
          <PushNotificationSetting />
        </div>
      </section>
    </div>
  );
}
