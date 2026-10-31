import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, AtSign, CalendarDays, Hash, Mail, MapPin, Phone } from "lucide-react";
import { useNavigate } from "react-router";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import { isCanceledRequest } from "../services/apiClient";
import { fetchConsumerProfile } from "../services/consumerPortal.service";

const hasValue = (value) => value !== null && value !== undefined && value !== "";

function InformationCard({ Icon, label, value }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-water-50 text-water-700"><Icon aria-hidden="true" className="h-4 w-4" /></span>
      <div className="min-w-0"><dt className="text-[11px] font-semibold text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-bold text-navy-900">{value}</dd></div>
    </div>
  );
}

function InformationSection({ description, eyebrow, items, title }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-water-700">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-extrabold tracking-tight text-navy-900">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">{items.map((item) => <InformationCard {...item} key={item.label} />)}</dl>
    </section>
  );
}

export default function ConsumerAccountInformation() {
  const navigate = useNavigate();
  const [consumer, setConsumer] = useState(null);
  const [error, setError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);

  const retry = useCallback(() => {
    setConsumer(null);
    setError("");
    setRequestVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchConsumerProfile({ signal: controller.signal }).then(setConsumer).catch((requestError) => {
      if (!isCanceledRequest(requestError)) setError(requestError.message);
    });
    return () => controller.abort();
  }, [requestVersion]);

  useEffect(() => {
    const handleTargetedRefresh = (event) => {
      if (event.detail?.path === "/consumer/account-information") {
        setRequestVersion((version) => version + 1);
      }
    };
    window.addEventListener("waterwise:targeted-refresh", handleTargetedRefresh);
    return () => window.removeEventListener("waterwise:targeted-refresh", handleTargetedRefresh);
  }, []);

  const accountItems = consumer ? [
    { Icon: Hash, label: "Account ID", value: consumer.accountId },
    { Icon: AtSign, label: "Username", value: consumer.username },
    { Icon: CalendarDays, label: "Member since", value: consumer.accountCreatedDate },
  ].filter((item) => hasValue(item.value)) : [];
  const householdItems = consumer ? [
    { Icon: Mail, label: "Email address", value: consumer.email },
    { Icon: Phone, label: "Contact number", value: consumer.contactNumber },
    { Icon: MapPin, label: "Service area", value: consumer.purok },
  ].filter((item) => hasValue(item.value)) : [];

  return (
    <div className="space-y-5 sm:space-y-6">
      <button className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-bold text-water-700 hover:bg-water-50 hover:text-water-900" onClick={() => navigate("/consumer/profile-details")} type="button"><ArrowLeft className="h-4 w-4" />Back to household profile</button>
      <PageHeader compact description="Review the account, contact, and service details registered to your household." title="Account and Household Information" />
      {error && <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between" role="alert"><span>{error}</span><button className="min-h-11 rounded-xl bg-red-700 px-4 font-bold text-white" onClick={retry} type="button">Try again</button></div>}
      {!consumer && !error && <LoadingSkeleton label="Loading account and household information" variant="profile" />}
      {consumer && <div className="grid items-start gap-4"><InformationSection description="Identifiers stored with your resident account." eyebrow="Account" items={accountItems} title="Account information" /><InformationSection description="Contact details and the service area registered by the barangay office." eyebrow="Household" items={householdItems} title="Contact and location" /></div>}
    </div>
  );
}
