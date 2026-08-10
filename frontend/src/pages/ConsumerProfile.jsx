import { useCallback, useEffect, useState } from "react";
import {
  AtSign,
  CalendarDays,
  CheckCircle2,
  CircleSlash2,
  Hash,
  Info,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  LoaderCircle,
  Smartphone,
  Trash2,
  UserRound,
} from "lucide-react";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import { isCanceledRequest } from "../services/apiClient";
import { fetchConsumerProfile } from "../services/consumerPortal.service";
import {
  disableCurrentPushNotifications,
  enablePushNotifications,
  fetchPushSubscriptions,
  getCurrentPushSubscription,
  pushSupported,
  removePushSubscription,
} from "../services/pushNotifications";

const hasValue = (value) => value !== null && value !== undefined && value !== "";

function DetailItem({ Icon, label, value }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-50 text-water-700">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-slate-500">{label}</dt>
        <dd className="mt-1 break-words text-sm font-bold text-navy-900 sm:text-base">
          {value}
        </dd>
      </div>
    </div>
  );
}

function DetailSection({ description, eyebrow, items, title }) {
  if (!items.length) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-extrabold tracking-tight text-navy-900">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        {items.map((item) => <DetailItem {...item} key={item.label} />)}
      </dl>
    </section>
  );
}

function NotificationDevices() {
  const [devices, setDevices] = useState([]);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const supported = pushSupported();

  const loadDevices = useCallback(async () => {
    if (!supported) return;
    const [records, current] = await Promise.all([
      fetchPushSubscriptions(),
      getCurrentPushSubscription(),
    ]);
    setDevices(records);
    setCurrentSubscription(current);
  }, [supported]);

  useEffect(() => {
    queueMicrotask(() => loadDevices().catch((error) => setMessage(error.message)));
  }, [loadDevices]);

  const run = async (action, successMessage) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await loadDevices();
      setMessage(successMessage);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-6" aria-labelledby="notification-devices-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">Notifications</p>
          <h2 className="mt-1 text-xl font-extrabold tracking-tight text-navy-900" id="notification-devices-heading">Push notification devices</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Receive billing, payment, service, and account alerts even when WaterWise is closed.</p>
        </div>
        {supported && (
          currentSubscription ? (
            <button className="min-h-11 rounded-xl border border-red-200 px-4 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-60" disabled={busy} onClick={() => run(disableCurrentPushNotifications, "Push notifications disabled on this device.")} type="button">Disable this device</button>
          ) : (
            <button className="ww-primary-button min-h-11 px-4 text-sm" disabled={busy} onClick={() => run(enablePushNotifications, "Push notifications enabled on this device.")} type="button">
              {busy ? "Enabling…" : "Enable on this device"}
            </button>
          )
        )}
      </div>

      {!supported && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">This browser does not support Web Push notifications.</p>}
      {message && <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-800" role="status">{message}</p>}

      {supported && (
        <div className="mt-5 space-y-3">
          {busy && devices.length === 0 && <div className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading notification devices…</div>}
          {!busy && devices.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No browser is currently registered for push notifications.</p>}
          {devices.map((device) => (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4" key={device.id}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-100 text-water-700"><Smartphone className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-navy-900">Registered browser</p>
                <p className="mt-1 truncate text-xs text-slate-500" title={device.user_agent}>{device.user_agent || "Browser details unavailable"}</p>
              </div>
              <button aria-label="Remove notification device" className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-60" disabled={busy} onClick={() => run(() => removePushSubscription(device.id), "Notification device removed.")} type="button"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ConsumerProfile({ consumer: consumerProp }) {
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
      description="Review the personal, contact, and service information registered to your household account."
      eyebrow="Resident portal"
      title="Household profile"
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
  const accountItems = [
    { Icon: Hash, label: "Account ID", value: consumer.accountId },
    { Icon: AtSign, label: "Username", value: consumer.username },
    { Icon: CalendarDays, label: "Member since", value: consumer.accountCreatedDate },
  ].filter((item) => hasValue(item.value));
  const contactItems = [
    { Icon: Mail, label: "Email address", value: consumer.email },
    { Icon: Phone, label: "Contact number", value: consumer.contactNumber },
    { Icon: MapPin, label: "Service area", value: consumer.purok },
  ].filter((item) => hasValue(item.value));
  return (
    <div className="space-y-5 sm:space-y-6">
      {pageHeader}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-6" aria-labelledby="profile-name">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-water-50 text-water-700 sm:h-16 sm:w-16">
              <UserRound aria-hidden="true" className="h-7 w-7 sm:h-8 sm:w-8" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">Account holder</p>
              <h2 className="mt-1 break-words text-2xl font-extrabold tracking-tight text-navy-900" id="profile-name">
                {consumer.name}
              </h2>
              {hasValue(consumer.purok) && <p className="mt-1 text-sm font-semibold text-slate-600">{consumer.purok}</p>}
            </div>
          </div>
          {hasValue(consumer.status) && (
            <span className={`inline-flex min-h-8 w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
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

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <DetailSection
          description="Identifiers stored with your resident account."
          eyebrow="Account"
          items={accountItems}
          title="Account information"
        />
        <DetailSection
          description="Contact details and the service area registered by the barangay office."
          eyebrow="Household"
          items={contactItems}
          title="Contact and location"
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-6" aria-labelledby="account-security-heading">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">Security</p>
        <h2 className="mt-1 text-xl font-extrabold tracking-tight text-navy-900" id="account-security-heading">Account security</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Update your sign-in password or registered email address securely.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 text-left transition-colors hover:border-water-300 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600" onClick={() => window.dispatchEvent(new Event("waterwise:open-change-password"))} type="button">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-100 text-water-700"><KeyRound aria-hidden="true" className="h-5 w-5" /></span>
            <span><span className="block text-sm font-bold text-navy-900">Change password</span><span className="mt-1 block text-xs leading-5 text-slate-500">Use your current password or email OTP.</span></span>
          </button>
          <button className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 text-left transition-colors hover:border-water-300 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600" onClick={() => window.dispatchEvent(new Event("waterwise:open-change-email"))} type="button">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-100 text-water-700"><Mail aria-hidden="true" className="h-5 w-5" /></span>
            <span><span className="block text-sm font-bold text-navy-900">Change email</span><span className="mt-1 block text-xs leading-5 text-slate-500">Verify through your current registered email.</span></span>
          </button>
        </div>
      </section>

      <NotificationDevices />

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:p-5" aria-labelledby="profile-correction-heading">
        <div className="flex gap-3">
          <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <div>
            <h2 className="text-sm font-bold text-navy-900" id="profile-correction-heading">Need to correct your details?</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              You can securely change your email using the account menu. If you cannot access or remember your current email, visit the Sucol Water System office. Contact the office for other profile corrections.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
