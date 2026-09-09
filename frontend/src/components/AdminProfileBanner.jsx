import { CalendarDays, Droplet, Mail, ShieldCheck } from "lucide-react";
import "./AdminProfileBanner.css";

export default function AdminProfileBanner({ account, details = [], displayName, roleLabel, subtitle = "System Administrator", tagline = <>?Managing today for<br />a cleaner tomorrow.?</> }) {
  const username = displayName ?? account?.username ?? account?.name ?? "Administrator";
  const rawJoined = account?.created_at ?? account?.createdAt;
  const parsedJoined = rawJoined ? new Date(rawJoined) : null;
  const joined = account?.accountCreatedDate || (parsedJoined && !Number.isNaN(parsedJoined.getTime())
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(parsedJoined)
    : "Not available");
  const active = String(account?.status ?? "").toLowerCase() === "active";
  return <section className={`admin-profile-banner ${details.length ? "has-details" : ""}`} aria-label={`${roleLabel ?? "Administrator"} identity`}>
    <svg className="admin-banner-landscape" viewBox="0 0 620 180" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
      <path d="M0 170 130 65l65 30 95-65 100 74 76-41 154 81v36H0Z" fill="#d8efff" />
      <path d="m125 180 165-150 90 98 87-50 153 87v15Z" fill="#b5e1fc" />
      <path d="m290 30-43 76 41-23 27 33-8-48Z" fill="#edf9ff" />
      <path d="m340 180 127-102 69 86 84-42v58Z" fill="#99d2f3" />
      <path d="m228 160 12-28h-6l14-26 13 26h-6l13 28Zm53 8 14-33h-7l16-35 17 35h-7l14 33Zm73 3 12-26h-6l14-26 12 26h-5l12 26Z" fill="#69b9e7" />
      <path d="M0 172q165-38 313-8t307-7v23H0Z" fill="#b4e4fc" />
      <path d="M120 176q149-16 240-3t260-1" stroke="#f1fbff" strokeWidth="5" />
      <path d="M598 166q1-43-19-85" stroke="#2596d5" strokeWidth="3" />
      <path d="M591 128q-36-5-28-30 22 6 28 30Zm5 22q-33-1-29-19 20-2 29 19Zm-11-42q-30-12-24-33 19 5 24 33Zm7 22q-3-32 17-40 6 21-17 40Zm5 25q2-27 20-30 2 20-20 30Z" fill="#51b2e6" />
    </svg>
    <div className="admin-banner-avatar">{username.charAt(0).toUpperCase()}{active && <i />}</div>
    <div className="admin-banner-identity"><p>{roleLabel ?? (account?.role === "super-admin" ? "Super Administrator" : "Administrator")}</p><h2>{username}</h2><span className={`admin-banner-status ${active ? "is-active" : ""}`}><ShieldCheck size={13} />{active ? "Active account" : account?.status ?? "Status unavailable"}</span><span>{subtitle}</span><div className="admin-banner-email"><CalendarDays size={14} aria-hidden="true" /><span>Date joined: {joined}</span></div>{!details.length && <div className="admin-banner-email"><Mail size={14} /><span>{account?.email ?? "Email not available"}</span></div>}</div>
    <div className="admin-banner-art" aria-hidden="true"><Droplet size={57} /></div>
    <blockquote>{tagline}</blockquote>
    {details.length > 0 && <dl className="profile-banner-details">{details.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value ?? "Not available"}</dd></div>)}</dl>}

  </section>;
}
