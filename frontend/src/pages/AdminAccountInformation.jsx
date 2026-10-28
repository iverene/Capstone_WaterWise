import { useEffect, useState } from "react";
import { ArrowLeft, AtSign, Mail, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import { getCurrentAccount } from "../services/auth.service";
import { isCanceledRequest } from "../services/apiClient";

function InformationRow({ Icon, label, value }) {
  return <div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-water-50 text-water-700"><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="text-[11px] font-semibold text-slate-500">{label}</p><p className="mt-1 break-all text-sm font-bold text-navy-900">{value}</p></div></div>;
}

export default function AdminAccountInformation() {
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getCurrentAccount({ signal: controller.signal })
      .then(({ user }) => setAccount(user))
      .catch((requestError) => {
        if (!isCanceledRequest(requestError)) {
          setError(requestError.message || "Unable to load administrator account information.");
        }
      });
    return () => controller.abort();
  }, []);

  const roleLabel = account?.role === "super-admin" ? "Super Administrator" : "Administrator";

  return <div className="space-y-5 sm:space-y-6">
    <button className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-bold text-water-700 hover:bg-water-50 hover:text-water-900" onClick={() => navigate("/admin/profile")} type="button"><ArrowLeft className="h-4 w-4" />Back to administrator account</button>
    <PageHeader compact description="Review the identity and contact information registered to your administrator account." title="Administrator Account Information" />
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">{error}</div>}
    {!account && !error && <LoadingSkeleton label="Loading administrator account information" variant="profile" />}
    {account && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-water-700">Account</p><h2 className="mt-1 text-xl font-extrabold tracking-tight text-navy-900">Account information</h2><p className="mt-1 text-sm leading-6 text-slate-600">Credentials and role assigned to your WaterWise administrator account.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><InformationRow Icon={AtSign} label="Username" value={account?.username ?? account?.name ?? "Administrator"} /><InformationRow Icon={Mail} label="Email address" value={account?.email ?? "Not available"} /><InformationRow Icon={ShieldCheck} label="Account role" value={roleLabel} /></div>
    </section>}
  </div>;
}
