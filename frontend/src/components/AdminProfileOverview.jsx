import { CalendarDays, Check, ChevronRight, Crown, Droplet, KeyRound, Lightbulb, Mail, Settings, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { useNavigate } from "react-router";
import "./AdminProfileOverview.css";

export default function AdminProfileOverview({ account, onTrustedDevices, onManageAccounts, onSystemSettings, settingsError }) {
  const navigate = useNavigate();
  const username = account?.username ?? account?.name ?? "Administrator";
  const role = account?.role === "super-admin" ? "Super Administrator" : "Administrator";
  const rawDate = account?.created_at ?? account?.createdAt;
  const joined = rawDate && !Number.isNaN(new Date(rawDate).getTime()) ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(rawDate)) : "Not available";
  const status = account?.status ? String(account.status) : "Not available";
  const active = status.toLowerCase() === "active";
  const changePassword = () => navigate("/account/change-password");
  const changeEmail = () => navigate("/account/change-email");
  const actions = [
    { Icon: KeyRound, title: "Change password", description: "Update your password with email OTP verification.", onClick: changePassword },
    { Icon: Mail, title: "Change email", description: "Verify your current registered email address.", onClick: changeEmail },
    { Icon: Smartphone, title: "Trusted devices", description: "Review browsers that can skip email OTP.", onClick: onTrustedDevices },
  ];
  return <div className="admin-profile-overview">
    <section className="ap-hero" aria-label="Administrator identity">
      <svg className="ap-landscape" viewBox="0 0 600 210" preserveAspectRatio="xMaxYMax slice" aria-hidden="true"><path d="m0 180 110-100 70 33 80-70 110 89 88-75 142 95v58H0Z" fill="#d8efff"/><path d="m80 210 180-139 95 88 91-49 154 83v17Z" fill="#bce3ff"/><path d="m260 71-45 72 46-18 32 32Z" fill="#edf8ff"/><path d="M0 197q180-64 310-10t290-3v26H0Z" fill="#90d0f5"/><path d="M0 205q200-28 340-4t260-4" stroke="#e6f7ff" strokeWidth="8"/></svg>
      <div className="ap-avatar">{username.charAt(0).toUpperCase()}{active && <i />}</div>
      <div className="ap-identity"><p className="ap-eyebrow">{role}</p><h2>{username}</h2><p>System Administrator</p><div className="ap-meta"><span><CalendarDays size={16} />{joined === "Not available" ? "Join date unavailable" : `Member since ${joined}`}</span><span><Mail size={16} />{account?.email ?? "Email not available"}</span></div></div>
      <div className="ap-hero-message"><Droplet size={58} /><blockquote>“Managing today for<br />a cleaner tomorrow.”</blockquote></div>
    </section>
    <nav className="ap-navigation" aria-label="Profile sections"><a href="#ap-information" className="ap-selected"><UserRound size={20} />Overview</a><button onClick={changePassword} type="button"><KeyRound size={20} />Security</button><button onClick={changeEmail} type="button"><Mail size={20} />Email</button><button onClick={onTrustedDevices} type="button"><Smartphone size={20} />Devices</button>{account?.role === "super-admin" && <a href="#ap-permissions"><ShieldCheck size={20} />Permissions</a>}</nav>
    <div className="ap-columns"><section className="ap-card" id="ap-information"><h2>Account information</h2><p>View your administrator details registered in the system.</p>
      <dl className="ap-details">{[[UserRound, "Username", username], [Mail, "Email address", account?.email ?? "Not available"], [ShieldCheck, "Role", role], [ShieldCheck, "Account status", status], [CalendarDays, "Date joined", joined]].map(([Icon, label, value]) => <div key={label}><dt><Icon size={19} />{label}</dt><dd>{label === "Account status" && active ? <span className="ap-status"><Check size={14} />Active</span> : value}</dd></div>)}</dl>

      <h2>Account settings</h2><p>Manage your password, email address, and trusted devices.</p><div className="ap-settings">{actions.map(({ Icon, title, description, onClick }) => <button key={title} onClick={onClick} type="button"><span className="ap-action-icon"><Icon size={24} /></span><span><strong>{title}</strong><small>{description}</small></span><ChevronRight size={18} /></button>)}</div>
    </section><aside className="ap-aside"><section className="ap-card"><div className="ap-card-heading"><span className="ap-action-icon ap-green"><ShieldCheck size={25} /></span><div><h3>Account status</h3><p>Your registered account access status.</p></div></div><div className={active ? "ap-status-panel" : "ap-status-panel ap-neutral"}><ShieldCheck size={25} /><div><strong>{active ? "Active account" : status}</strong><p>{active ? "Your account is enabled." : "Status shown from your account record."}</p></div></div></section><section className="ap-card ap-tips"><div className="ap-card-heading"><span className="ap-action-icon ap-yellow"><Lightbulb size={25} /></span><div><h3>Security tips</h3><p>Keep your account secure with these practices.</p></div></div><ul>{["Use a strong, unique password", "Keep your email account secure", "Review your trusted devices", "Log out on shared computers"].map(tip => <li key={tip}><Check size={16} />{tip}</li>)}</ul></section></aside></div>

    {account?.role === "super-admin" && <section className="ap-restricted" id="ap-permissions"><span className="ap-action-icon"><Crown size={28} /></span><div><p className="ap-eyebrow">Restricted management</p><h2>Super Admin only</h2><p>Create administrator and meter-reader accounts with email OTP verification.</p></div><div className="ap-restricted-actions"><button onClick={onManageAccounts} type="button"><UserRound size={18} />Manage accounts</button><button onClick={onSystemSettings} type="button"><Settings size={18} />System settings</button></div>{settingsError && <p className="ap-error" role="alert">{settingsError}</p>}</section>}
  </div>;
}
