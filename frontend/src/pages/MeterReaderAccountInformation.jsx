import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, AtSign, CalendarDays, Hash, Mail } from "lucide-react";
import { useNavigate } from "react-router";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import { isCanceledRequest } from "../services/apiClient";
import { fetchMeterReaderProfile } from "../services/meterReaderProfile.service";

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

export default function MeterReaderAccountInformation() {
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
    fetchMeterReaderProfile({ signal: controller.signal }).then(setReader).catch((requestError) => {
      if (!isCanceledRequest(requestError)) setError(requestError.message);
    });
    return () => controller.abort();
  }, [requestVersion]);

  const accountItems = reader ? [
    { Icon: Hash, label: "Account ID", value: reader.accountId },
    { Icon: AtSign, label: "Username", value: reader.username },
    { Icon: CalendarDays, label: "Member since", value: reader.accountCreatedDate },
  ].filter((item) => hasValue(item.value)) : [];
  const contactItems = reader ? [
    { Icon: Mail, label: "Email address", value: reader.email },
  ].filter((item) => hasValue(item.value)) : [];

  return (
    <div className="space-y-5 sm:space-y-6">
      <button className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-bold text-water-700 hover:bg-water-50 hover:text-water-900" onClick={() => navigate("/meter-reader/profile")} type="button"><ArrowLeft className="h-4 w-4" />Back to profile</button>
      <PageHeader compact description="Review the account and contact details registered to your meter reader account." title="Account Information" />
      {error && <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between" role="alert"><span>{error}</span><button className="min-h-11 rounded-xl bg-red-700 px-4 font-bold text-white" onClick={retry} type="button">Try again</button></div>}
      {!reader && !error && <LoadingSkeleton label="Loading account information" variant="profile" />}
      {reader && <div className="grid items-start gap-4"><InformationSection description="Identifiers stored with your meter reader account." eyebrow="Account" items={accountItems} title="Account information" /><InformationSection description="Contact details registered with your account." eyebrow="Contact" items={contactItems} title="Contact information" /></div>}
    </div>
  );
}
