import { useEffect, useState } from "react";
import { AtSign, ChevronLeft, ChevronRight, Eye, EyeOff, KeyRound, LoaderCircle, Mail, Monitor, Settings, ShieldCheck, Smartphone, Trash2, UserPlus, UserRound } from "lucide-react";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";
import { createStaffAccount, fetchStaffAccounts, fetchTrustedDevices, requestStaffActionOtp, revokeOtherTrustedDevices, revokeTrustedDevice, updateAdminAccount, updateMeterReaderAccount, verifyStaffActionOtp } from "../services/auth.service";
import { getStoredAccount } from "../services/authToken";

const STAFF_PAGE_SIZE = 2;

function describeDevice(userAgent = "") {
  const mobile = /Android|iPhone|iPad/i.test(userAgent);
  const platform = /iPhone/i.test(userAgent)
    ? "iPhone"
    : /iPad/i.test(userAgent)
      ? "iPad"
      : /Android/i.test(userAgent)
        ? "Android device"
        : /Windows/i.test(userAgent)
          ? "Windows PC"
          : /Macintosh|Mac OS/i.test(userAgent)
            ? "Mac"
            : /Linux/i.test(userAgent)
              ? "Linux computer"
              : "Unknown device";
  const browser = /Edg\//i.test(userAgent)
    ? "Microsoft Edge"
    : /Chrome\//i.test(userAgent)
      ? "Google Chrome"
      : /Firefox\//i.test(userAgent)
        ? "Mozilla Firefox"
        : /Safari\//i.test(userAgent)
          ? "Safari"
          : "Unknown browser";
  return { browser, Icon: mobile ? Smartphone : Monitor, platform };
}

const formatDeviceDate = (value) => new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date(value));

export default function AdminProfile() {
  const toast = useToast();
  const [account, setAccount] = useState(getStoredAccount);
  const [staffType, setStaffType] = useState("");
  const [staffForm, setStaffForm] = useState({ username: "", email: "", password: "", confirmPassword: "" });
  const [staffError, setStaffError] = useState("");
  const [showTemporaryPassword, setShowTemporaryPassword] = useState(false);
  const [showConfirmTemporaryPassword, setShowConfirmTemporaryPassword] = useState(false);
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [staffDirectory, setStaffDirectory] = useState({ admins: [], meterReaders: [] });
  const [directoryType, setDirectoryType] = useState("admins");
  const [directoryPage, setDirectoryPage] = useState(1);
  const [directoryMeta, setDirectoryMeta] = useState({ total: 0, totalPages: 1 });
  const [directoryError, setDirectoryError] = useState("");
  const [isDirectoryLoading, setIsDirectoryLoading] = useState(account?.role === "super-admin");
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [adminUpdates, setAdminUpdates] = useState({ email: "", password: "", confirmPassword: "" });
  const [adminError, setAdminError] = useState("");
  const [isUpdatingAdmin, setIsUpdatingAdmin] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showAdminConfirmPassword, setShowAdminConfirmPassword] = useState(false);
  const [selectedMeterReader, setSelectedMeterReader] = useState(null);
  const [meterReaderUpdates, setMeterReaderUpdates] = useState({ email: "", password: "", confirmPassword: "" });
  const [meterReaderError, setMeterReaderError] = useState("");
  const [isUpdatingMeterReader, setIsUpdatingMeterReader] = useState(false);
  const [showMeterReaderPassword, setShowMeterReaderPassword] = useState(false);
  const [showMeterReaderConfirmPassword, setShowMeterReaderConfirmPassword] = useState(false);
  const [staffAuthorization, setStaffAuthorization] = useState(null);
  const [staffOtp, setStaffOtp] = useState("");
  const [staffOtpError, setStaffOtpError] = useState("");
  const [isAuthorizingStaff, setIsAuthorizingStaff] = useState(false);
  const [isTrustedDevicesOpen, setIsTrustedDevicesOpen] = useState(false);
  const [trustedDevices, setTrustedDevices] = useState([]);
  const [trustedDevicesError, setTrustedDevicesError] = useState("");
  const [isTrustedDevicesLoading, setIsTrustedDevicesLoading] = useState(false);
  const [revokingDeviceId, setRevokingDeviceId] = useState(null);

  useEffect(() => {
    const handleEmailChange = (event) => setAccount((current) => ({ ...current, email: event.detail?.email ?? current.email }));
    window.addEventListener("waterwise:email-changed", handleEmailChange);
    return () => window.removeEventListener("waterwise:email-changed", handleEmailChange);
  }, []);

  useEffect(() => {
    if (account?.role !== "super-admin") return;
    fetchStaffAccounts(directoryType, directoryPage, STAFF_PAGE_SIZE)
      .then((result) => {
        setStaffDirectory((current) => ({ ...current, [directoryType]: result.items ?? [] }));
        setDirectoryMeta({ total: result.total ?? 0, totalPages: result.totalPages ?? 1 });
      })
      .catch((error) => setDirectoryError(error.message))
      .finally(() => setIsDirectoryLoading(false));
  }, [account?.role, directoryPage, directoryType]);

  const loadTrustedDevices = async () => {
    setIsTrustedDevicesLoading(true); setTrustedDevicesError("");
    try {
      const result = await fetchTrustedDevices();
      setTrustedDevices(result.devices ?? []);
    } catch (error) {
      setTrustedDevicesError(error.message);
    } finally { setIsTrustedDevicesLoading(false); }
  };

  const openTrustedDevices = () => {
    setIsTrustedDevicesOpen(true);
    loadTrustedDevices();
  };

  const removeTrustedDevice = async (device) => {
    setRevokingDeviceId(device.id); setTrustedDevicesError("");
    try {
      await revokeTrustedDevice(device.id);
      setTrustedDevices((current) => current.filter((item) => item.id !== device.id));
      toast.success("Device removed", device.isCurrent ? "This browser will require OTP on the next sign-in." : "That browser will require OTP on its next sign-in.");
    } catch (error) {
      setTrustedDevicesError(error.message);
    } finally { setRevokingDeviceId(null); }
  };

  const removeOtherTrustedDevices = async () => {
    setRevokingDeviceId("others"); setTrustedDevicesError("");
    try {
      await revokeOtherTrustedDevices();
      setTrustedDevices((current) => current.filter((device) => device.isCurrent));
      toast.success("Other devices removed", "They will require OTP the next time they sign in.");
    } catch (error) {
      setTrustedDevicesError(error.message);
    } finally { setRevokingDeviceId(null); }
  };

  const beginStaffAuthorization = async (pendingAction) => {
    setIsAuthorizingStaff(true); setStaffOtpError("");
    try {
      const result = await requestStaffActionOtp(pendingAction.action, pendingAction.targetId);
      setStaffAuthorization({ ...pendingAction, challengeToken: result.challengeToken, maskedEmail: result.maskedEmail });
      setStaffOtp("");
    } catch (error) {
      if (pendingAction.action.startsWith("create-")) setStaffError(error.message);
      else if (pendingAction.action === "update-admin") setAdminError(error.message);
      else setMeterReaderError(error.message);
    } finally { setIsAuthorizingStaff(false); }
  };

  const createStaff = async (event) => {
    event.preventDefault();
    const username = staffForm.username.trim();
    const email = staffForm.email.trim();
    if (!username) return setStaffError("Enter a username.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setStaffError("Enter a valid complete email address.");
    if (!(staffForm.password.length >= 8 && /[a-z]/.test(staffForm.password) && /[A-Z]/.test(staffForm.password) && /\d/.test(staffForm.password) && /[^A-Za-z0-9]/.test(staffForm.password))) return setStaffError("Temporary password must contain uppercase, lowercase, a number, and a symbol.");
    if (staffForm.password !== staffForm.confirmPassword) return setStaffError("Temporary passwords do not match.");
    setStaffError("");
    await beginStaffAuthorization({ action: staffType === "admin" ? "create-admin" : "create-meter-reader", accountType: staffType, payload: { username, email, password: staffForm.password } });
  };

  const completeAuthorizedAction = async (authorizationToken) => {
    const pending = staffAuthorization;
    if (pending.action.startsWith("create-")) {
      setIsCreatingStaff(true);
      try {
      const result = await createStaffAccount(pending.accountType, pending.payload, authorizationToken);
      const username = pending.payload.username;
      const createdDirectoryType = pending.accountType === "admin" ? "admins" : "meterReaders";
      if (directoryType === createdDirectoryType && directoryPage === 1) {
        setStaffDirectory((current) => ({ ...current, [createdDirectoryType]: [result.data, ...current[createdDirectoryType]].slice(0, STAFF_PAGE_SIZE) }));
        setDirectoryMeta((current) => ({ total: current.total + 1, totalPages: Math.max(1, Math.ceil((current.total + 1) / STAFF_PAGE_SIZE)) }));
      }
      toast.success("Staff account created", `${pending.accountType === "admin" ? "Admin" : "Meter reader"} ${username} can now sign in using the temporary password.`);
      setStaffForm({ username: "", email: "", password: "", confirmPassword: "" });
      setShowTemporaryPassword(false);
      setShowConfirmTemporaryPassword(false);
      setStaffType("");
      } catch (error) { setStaffError(error.message); }
      finally { setIsCreatingStaff(false); }
      return;
    }
    if (pending.action === "update-meter-reader") {
      setIsUpdatingMeterReader(true);
      try {
        const result = await updateMeterReaderAccount(pending.targetId, pending.payload, authorizationToken);
        setStaffDirectory((current) => ({ ...current, meterReaders: current.meterReaders.map((item) => item.id === result.data.id ? result.data : item) }));
        toast.success("Meter reader updated", `${result.data.username}'s account changes were saved.`);
        setSelectedMeterReader(null);
      } catch (error) { setMeterReaderError(error.message); }
      finally { setIsUpdatingMeterReader(false); }
      return;
    }
    setIsUpdatingAdmin(true);
    try {
      const result = await updateAdminAccount(pending.targetId, pending.payload, authorizationToken);
      setStaffDirectory((current) => ({ ...current, admins: current.admins.map((item) => item.id === result.data.id ? result.data : item) }));
      toast.success("Administrator updated", `${result.data.username}'s account changes were saved.`);
      setSelectedAdmin(null);
    } catch (error) { setAdminError(error.message); }
    finally { setIsUpdatingAdmin(false); }
  };

  const updateMeterReader = async (event) => {
    event.preventDefault();
    const updates = {};
    const email = meterReaderUpdates.email.trim();
    if (email && email !== selectedMeterReader.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMeterReaderError("Enter a valid complete email address.");
      updates.email = email;
    }
    if (meterReaderUpdates.password) {
      if (!(meterReaderUpdates.password.length >= 8 && /[a-z]/.test(meterReaderUpdates.password) && /[A-Z]/.test(meterReaderUpdates.password) && /\d/.test(meterReaderUpdates.password) && /[^A-Za-z0-9]/.test(meterReaderUpdates.password))) return setMeterReaderError("Temporary password must contain uppercase, lowercase, a number, and a symbol.");
      if (meterReaderUpdates.password !== meterReaderUpdates.confirmPassword) return setMeterReaderError("Temporary passwords do not match.");
      updates.password = meterReaderUpdates.password;
    }
    if (!Object.keys(updates).length) return setMeterReaderError("Change the email or enter a new temporary password.");
    setMeterReaderError("");
    await beginStaffAuthorization({ action: "update-meter-reader", targetId: selectedMeterReader.id, payload: updates });
  };

  const updateRegularAdmin = async (event) => {
    event.preventDefault();
    const updates = {};
    const email = adminUpdates.email.trim();
    if (email && email !== selectedAdmin.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setAdminError("Enter a valid complete email address.");
      updates.email = email;
    }
    if (adminUpdates.password) {
      if (!(adminUpdates.password.length >= 8 && /[a-z]/.test(adminUpdates.password) && /[A-Z]/.test(adminUpdates.password) && /\d/.test(adminUpdates.password) && /[^A-Za-z0-9]/.test(adminUpdates.password))) return setAdminError("Temporary password must contain uppercase, lowercase, a number, and a symbol.");
      if (adminUpdates.password !== adminUpdates.confirmPassword) return setAdminError("Temporary passwords do not match.");
      updates.password = adminUpdates.password;
    }
    if (!Object.keys(updates).length) return setAdminError("Change the email or enter a new temporary password.");
    setAdminError("");
    await beginStaffAuthorization({ action: "update-admin", targetId: selectedAdmin.id, payload: updates });
  };

  const verifyStaffAuthorization = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(staffOtp)) return setStaffOtpError("Enter the 6-digit verification code.");
    setIsAuthorizingStaff(true); setStaffOtpError("");
    try {
      const result = await verifyStaffActionOtp(staffAuthorization.challengeToken, staffOtp);
      setStaffAuthorization(null); setStaffOtp("");
      await completeAuthorizedAction(result.authorizationToken);
    } catch (error) { setStaffOtpError(error.message); }
    finally { setIsAuthorizingStaff(false); }
  };

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <PageHeader description="Review your administrator identity and manage secure account credentials." eyebrow="Administrator account" title="Profile management" />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <div className="flex items-center gap-4"><span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-water-50 text-water-700"><UserRound className="h-8 w-8" /></span><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">{account?.role === "super-admin" ? "Super Administrator" : "Administrator"}</p><h2 className="mt-1 break-words text-2xl font-extrabold text-navy-900">{account?.username ?? account?.name ?? "Administrator"}</h2><p className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-emerald-700"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>Active {account?.role === "super-admin" ? "super administrator" : "administrator"} account</span></p></div></div>
      </section>
      {account?.role === "super-admin" && <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.7fr)] lg:items-stretch lg:gap-6">
      <section className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6 lg:h-full">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">Super Admin only</p><h2 className="mt-1 text-xl font-extrabold text-navy-900">Create staff account</h2><p className="mt-1 text-sm leading-6 text-slate-600">Create a regular Admin or Meter Reader account with a temporary password. This section is hidden from normal administrators.</p>
        <div className="mt-5 grid gap-3 lg:flex-1 lg:grid-rows-2">
          <button className="group flex min-h-24 min-w-0 items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition-colors hover:border-water-300 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600" onClick={() => setStaffType("admin")} type="button"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-water-100 text-water-700"><UserPlus className="h-6 w-6" /></span><span className="min-w-0"><span className="block font-bold text-navy-900">Create Admin</span><span className="mt-1 block text-xs leading-5 text-slate-500">Add a regular administrator account.</span></span></button>
          <button className="group flex min-h-24 min-w-0 items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition-colors hover:border-water-300 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600" onClick={() => setStaffType("meter-reader")} type="button"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-water-100 text-water-700"><UserRound className="h-6 w-6" /></span><span className="min-w-0"><span className="block font-bold text-navy-900">Create Meter Reader</span><span className="mt-1 block text-xs leading-5 text-slate-500">Add field personnel for meter readings.</span></span></button>
        </div>
      </section>
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">Super Admin only</p><h2 className="mt-1 text-xl font-extrabold text-navy-900">Staff directory</h2><p className="mt-1 text-sm leading-6 text-slate-600">Review staff accounts and update regular Admin or Meter Reader credentials. Super Admin accounts are protected.</p>
          <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1"><button className={`min-h-11 rounded-lg text-sm font-bold ${directoryType === "admins" ? "bg-white text-water-800 shadow-sm" : "text-slate-600"}`} onClick={() => { if (directoryType === "admins") return; setIsDirectoryLoading(true); setDirectoryError(""); setDirectoryType("admins"); setDirectoryPage(1); }} type="button">Admins</button><button className={`min-h-11 rounded-lg text-sm font-bold ${directoryType === "meterReaders" ? "bg-white text-water-800 shadow-sm" : "text-slate-600"}`} onClick={() => { if (directoryType === "meterReaders") return; setIsDirectoryLoading(true); setDirectoryError(""); setDirectoryType("meterReaders"); setDirectoryPage(1); }} type="button">Meter Readers</button></div>
        {isDirectoryLoading && <div className="flex min-h-28 items-center justify-center gap-2 text-sm font-semibold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" />Loading staff accounts…</div>}
        {directoryError && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{directoryError}</p>}
          {!isDirectoryLoading && !directoryError && <div className="mt-4 grid gap-3">
          {(directoryType === "admins" ? staffDirectory.admins : staffDirectory.meterReaders).map((staff) => <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between" key={staff.id}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-navy-900">{staff.username}</p><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${staff.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{staff.status}</span>{staff.role === "super-admin" && <span className="rounded-full bg-water-100 px-2 py-0.5 text-xs font-bold text-water-800">Super Admin</span>}</div><p className="mt-1 break-all text-sm text-slate-600">{staff.email}</p></div>{directoryType === "meterReaders" && <button className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-navy-900 hover:bg-water-50" onClick={() => { setSelectedMeterReader(staff); setMeterReaderUpdates({ email: staff.email, password: "", confirmPassword: "" }); setMeterReaderError(""); setShowMeterReaderPassword(false); setShowMeterReaderConfirmPassword(false); }} type="button"><Settings className="h-4 w-4" />Manage account</button>}{directoryType === "admins" && staff.role !== "super-admin" && <button className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-navy-900 hover:bg-water-50" onClick={() => { setSelectedAdmin(staff); setAdminUpdates({ email: staff.email, password: "", confirmPassword: "" }); setAdminError(""); setShowAdminPassword(false); setShowAdminConfirmPassword(false); }} type="button"><Settings className="h-4 w-4" />Manage account</button>}{directoryType === "admins" && staff.role === "super-admin" && <span className="inline-flex min-h-11 shrink-0 items-center gap-2 px-2 text-sm font-semibold text-slate-500"><ShieldCheck className="h-4 w-4" />Protected account</span>}</div>)}
            {(directoryType === "admins" ? staffDirectory.admins : staffDirectory.meterReaders).length === 0 && <p className="py-8 text-center text-sm text-slate-500">No {directoryType === "admins" ? "administrator" : "meter reader"} accounts found.</p>}
            {directoryMeta.total > 0 && <div className="mt-1 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-semibold text-slate-600">Showing <span className="font-extrabold text-navy-900">{(directoryPage - 1) * STAFF_PAGE_SIZE + 1}–{Math.min(directoryPage * STAFF_PAGE_SIZE, directoryMeta.total)}</span> of <span className="font-extrabold text-navy-900">{directoryMeta.total}</span></p><div className="flex items-center justify-between gap-3 sm:justify-end"><button aria-label="Previous page" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 disabled:cursor-not-allowed disabled:opacity-40" disabled={directoryPage <= 1} onClick={() => { setIsDirectoryLoading(true); setDirectoryError(""); setDirectoryPage((page) => Math.max(1, page - 1)); }} type="button"><ChevronLeft className="h-5 w-5" /></button><span className="min-w-20 text-center text-sm font-bold text-navy-900">Page {directoryPage} of {directoryMeta.totalPages}</span><button aria-label="Next page" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 disabled:cursor-not-allowed disabled:opacity-40" disabled={directoryPage >= directoryMeta.totalPages} onClick={() => { setIsDirectoryLoading(true); setDirectoryError(""); setDirectoryPage((page) => Math.min(directoryMeta.totalPages, page + 1)); }} type="button"><ChevronRight className="h-5 w-5" /></button></div></div>}
          </div>}
      </section>
      </div>}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">Account</p><h2 className="mt-1 text-xl font-extrabold text-navy-900">Account information</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><AtSign className="h-5 w-5 text-water-700" /><div><p className="text-xs text-slate-500">Username</p><p className="mt-1 font-bold text-navy-900">{account?.username ?? account?.name}</p></div></div><div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><Mail className="h-5 w-5 text-water-700" /><div className="min-w-0"><p className="text-xs text-slate-500">Email address</p><p className="mt-1 break-all font-bold text-navy-900">{account?.email}</p></div></div></div>
      </section>
      {isTrustedDevicesOpen && <Modal description="Review browsers that can skip email OTP. Removing a device makes it verify again on its next sign-in." eyebrow="Account security" isOpen onClose={() => setIsTrustedDevicesOpen(false)} size="md" title="Trusted devices">
        <div className="p-5 sm:p-6">
          {isTrustedDevicesLoading && <div className="flex min-h-40 items-center justify-center gap-2 text-sm font-semibold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" />Loading trusted devices...</div>}
          {!isTrustedDevicesLoading && trustedDevicesError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{trustedDevicesError}</p>}
          {!isTrustedDevicesLoading && !trustedDevicesError && trustedDevices.length === 0 && <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-10 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-slate-400" /><p className="mt-3 font-bold text-navy-900">No trusted devices</p><p className="mt-1 text-sm text-slate-500">A browser appears here after a successful admin OTP verification.</p></div>}
          {!isTrustedDevicesLoading && trustedDevices.length > 0 && <div className="overflow-hidden rounded-xl border border-slate-200">
            {trustedDevices.map((device) => {
              const { browser, Icon, platform } = describeDevice(device.userAgent);
              return <div className="flex items-start gap-3 border-b border-slate-200 p-4 last:border-b-0" key={device.id}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-water-50 text-water-700"><Icon className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-navy-900">{platform}</p>{device.isCurrent && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">This device</span>}</div><p className="mt-1 text-sm text-slate-600">{browser}</p><p className="mt-1 text-xs leading-5 text-slate-500">Last used {formatDeviceDate(device.lastUsedAt)}<span aria-hidden="true"> · </span>Expires {formatDeviceDate(device.expiresAt)}</p></div>
                <button aria-label={`Remove ${platform}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50" disabled={revokingDeviceId !== null} onClick={() => removeTrustedDevice(device)} title="Remove trusted device" type="button">{revokingDeviceId === device.id ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}</button>
              </div>;
            })}
          </div>}
          {!isTrustedDevicesLoading && trustedDevices.some((device) => device.isCurrent) && trustedDevices.some((device) => !device.isCurrent) && <button className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={revokingDeviceId !== null} onClick={removeOtherTrustedDevices} type="button">{revokingDeviceId === "others" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Remove all other devices</button>}
        </div>
      </Modal>}
      {staffType && <Modal description={`Enter the new ${staffType === "admin" ? "administrator" : "meter reader"} credentials and assign a temporary password.`} eyebrow="Super Admin only" isOpen onClose={() => { setStaffType(""); setStaffError(""); setStaffForm({ username: "", email: "", password: "", confirmPassword: "" }); setShowTemporaryPassword(false); setShowConfirmTemporaryPassword(false); }} size="sm" title={`Create ${staffType === "admin" ? "Admin" : "Meter Reader"}`}>
        <form className="grid gap-4 p-5 sm:p-6" onSubmit={createStaff}>
          <div><label className="text-sm font-semibold" htmlFor="staff-username">Username</label><input autoComplete="off" className="ww-field mt-2 px-4 py-3" id="staff-username" onChange={(event) => { setStaffForm((current) => ({ ...current, username: event.target.value })); setStaffError(""); }} placeholder={staffType === "admin" ? "e.g. admin02" : "e.g. reader01"} value={staffForm.username} /></div>
          <div><label className="text-sm font-semibold" htmlFor="staff-email">Email address</label><input autoComplete="off" className="ww-field mt-2 px-4 py-3" id="staff-email" onChange={(event) => { setStaffForm((current) => ({ ...current, email: event.target.value })); setStaffError(""); }} placeholder={staffType === "admin" ? "e.g. admin02@example.com" : "e.g. reader01@example.com"} type="email" value={staffForm.email} /></div>
          <div><label className="text-sm font-semibold" htmlFor="staff-temporary-password">Temporary password</label><div className="relative mt-2"><input autoComplete="new-password" className="ww-field py-3 pl-4 pr-12" id="staff-temporary-password" onChange={(event) => { setStaffForm((current) => ({ ...current, password: event.target.value })); setStaffError(""); }} placeholder="e.g. Staff@2026" type={showTemporaryPassword ? "text" : "password"} value={staffForm.password} /><button aria-label={showTemporaryPassword ? "Hide temporary password" : "Show temporary password"} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500" onClick={() => setShowTemporaryPassword((visible) => !visible)} type="button">{showTemporaryPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div><p className="mt-1.5 text-xs leading-5 text-slate-500">Example: Staff@2026. Use at least 8 characters with uppercase, lowercase, a number, and a symbol.</p></div>
          <div><label className="text-sm font-semibold" htmlFor="staff-confirm-temporary-password">Confirm temporary password</label><div className="relative mt-2"><input autoComplete="new-password" className="ww-field py-3 pl-4 pr-12" id="staff-confirm-temporary-password" onChange={(event) => { setStaffForm((current) => ({ ...current, confirmPassword: event.target.value })); setStaffError(""); }} placeholder="Re-enter temporary password" type={showConfirmTemporaryPassword ? "text" : "password"} value={staffForm.confirmPassword} /><button aria-label={showConfirmTemporaryPassword ? "Hide confirmed temporary password" : "Show confirmed temporary password"} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500" onClick={() => setShowConfirmTemporaryPassword((visible) => !visible)} type="button">{showConfirmTemporaryPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></div>
          {staffError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{staffError}</p>}
          <button className="ww-primary-button flex min-h-12 items-center justify-center gap-2" disabled={isCreatingStaff || isAuthorizingStaff} type="submit"><UserPlus className="h-5 w-5" />{isAuthorizingStaff ? "Sending OTP…" : isCreatingStaff ? "Creating account…" : `Create ${staffType === "admin" ? "Admin" : "Meter Reader"}`}</button>
        </form>
      </Modal>}
      {selectedAdmin && <Modal description={`Update ${selectedAdmin.username}'s email or assign a new temporary password.`} eyebrow="Regular administrator management" isOpen onClose={() => { setSelectedAdmin(null); setShowAdminPassword(false); setShowAdminConfirmPassword(false); }} size="sm" title="Manage administrator">
        <form className="grid gap-4 p-5 sm:p-6" onSubmit={updateRegularAdmin}>
          <div><label className="text-sm font-semibold" htmlFor="managed-admin-email">Email address</label><input className="ww-field mt-2 px-4 py-3" id="managed-admin-email" onChange={(event) => { setAdminUpdates((current) => ({ ...current, email: event.target.value })); setAdminError(""); }} type="email" value={adminUpdates.email} /></div>
          <div><label className="text-sm font-semibold" htmlFor="managed-admin-password">New temporary password <span className="font-normal text-slate-500">(optional)</span></label><div className="relative mt-2"><input autoComplete="new-password" className="ww-field py-3 pl-4 pr-12" id="managed-admin-password" onChange={(event) => { setAdminUpdates((current) => ({ ...current, password: event.target.value })); setAdminError(""); }} placeholder="e.g. Staff@2026" type={showAdminPassword ? "text" : "password"} value={adminUpdates.password} /><button aria-label={showAdminPassword ? "Hide administrator password" : "Show administrator password"} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500" onClick={() => setShowAdminPassword((visible) => !visible)} type="button">{showAdminPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div><p className="mt-1.5 text-xs leading-5 text-slate-500">Leave blank to keep the existing password.</p></div>
          <div><label className="text-sm font-semibold" htmlFor="managed-admin-confirm-password">Confirm new temporary password <span className="font-normal text-slate-500">(optional)</span></label><div className="relative mt-2"><input autoComplete="new-password" className="ww-field py-3 pl-4 pr-12" id="managed-admin-confirm-password" onChange={(event) => { setAdminUpdates((current) => ({ ...current, confirmPassword: event.target.value })); setAdminError(""); }} placeholder="Re-enter temporary password" type={showAdminConfirmPassword ? "text" : "password"} value={adminUpdates.confirmPassword} /><button aria-label={showAdminConfirmPassword ? "Hide confirmed administrator password" : "Show confirmed administrator password"} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500" onClick={() => setShowAdminConfirmPassword((visible) => !visible)} type="button">{showAdminConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></div>
          {adminError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{adminError}</p>}
          <button className="ww-primary-button min-h-12" disabled={isUpdatingAdmin || isAuthorizingStaff} type="submit">{isAuthorizingStaff ? "Sending OTP…" : isUpdatingAdmin ? "Saving changes…" : "Save changes"}</button>
        </form>
      </Modal>}
      {selectedMeterReader && <Modal description={`Update ${selectedMeterReader.username}'s email or assign a new temporary password.`} eyebrow="Meter reader management" isOpen onClose={() => { setSelectedMeterReader(null); setShowMeterReaderPassword(false); setShowMeterReaderConfirmPassword(false); }} size="sm" title="Manage meter reader">
        <form className="grid gap-4 p-5 sm:p-6" onSubmit={updateMeterReader}>
          <div><label className="text-sm font-semibold" htmlFor="managed-reader-email">Email address</label><input className="ww-field mt-2 px-4 py-3" id="managed-reader-email" onChange={(event) => { setMeterReaderUpdates((current) => ({ ...current, email: event.target.value })); setMeterReaderError(""); }} type="email" value={meterReaderUpdates.email} /></div>
          <div><label className="text-sm font-semibold" htmlFor="managed-reader-password">New temporary password <span className="font-normal text-slate-500">(optional)</span></label><div className="relative mt-2"><input autoComplete="new-password" className="ww-field py-3 pl-4 pr-12" id="managed-reader-password" onChange={(event) => { setMeterReaderUpdates((current) => ({ ...current, password: event.target.value })); setMeterReaderError(""); }} placeholder="e.g. Staff@2026" type={showMeterReaderPassword ? "text" : "password"} value={meterReaderUpdates.password} /><button aria-label={showMeterReaderPassword ? "Hide meter reader password" : "Show meter reader password"} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500" onClick={() => setShowMeterReaderPassword((visible) => !visible)} type="button">{showMeterReaderPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div><p className="mt-1.5 text-xs leading-5 text-slate-500">Leave blank to keep the existing password.</p></div>
          <div><label className="text-sm font-semibold" htmlFor="managed-reader-confirm-password">Confirm new temporary password <span className="font-normal text-slate-500">(optional)</span></label><div className="relative mt-2"><input autoComplete="new-password" className="ww-field py-3 pl-4 pr-12" id="managed-reader-confirm-password" onChange={(event) => { setMeterReaderUpdates((current) => ({ ...current, confirmPassword: event.target.value })); setMeterReaderError(""); }} placeholder="Re-enter temporary password" type={showMeterReaderConfirmPassword ? "text" : "password"} value={meterReaderUpdates.confirmPassword} /><button aria-label={showMeterReaderConfirmPassword ? "Hide confirmed meter reader password" : "Show confirmed meter reader password"} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500" onClick={() => setShowMeterReaderConfirmPassword((visible) => !visible)} type="button">{showMeterReaderConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></div>
          {meterReaderError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{meterReaderError}</p>}
          <button className="ww-primary-button min-h-12" disabled={isUpdatingMeterReader || isAuthorizingStaff} type="submit">{isAuthorizingStaff ? "Sending OTP…" : isUpdatingMeterReader ? "Saving changes…" : "Save changes"}</button>
        </form>
      </Modal>}
      {staffAuthorization && <Modal description={`Enter the 6-digit code sent to ${staffAuthorization.maskedEmail}. This approval can be used only for the current staff action.`} eyebrow="Super Admin verification" isOpen onClose={() => { setStaffAuthorization(null); setStaffOtp(""); setStaffOtpError(""); }} size="sm" title="Confirm staff action">
        <form className="grid gap-4 p-5 sm:p-6" onSubmit={verifyStaffAuthorization}>
          <div className="rounded-xl border border-water-200 bg-water-50 p-4 text-sm leading-6 text-water-900"><ShieldCheck className="mr-2 inline h-5 w-5" />For extra security, this action requires approval through the Super Admin’s registered email.</div>
          <div><label className="text-sm font-semibold" htmlFor="staff-action-otp">Verification code</label><input autoComplete="one-time-code" className="ww-field mt-2 px-4 py-3 text-center font-mono text-xl tracking-[0.35em]" id="staff-action-otp" inputMode="numeric" maxLength={6} onChange={(event) => { setStaffOtp(event.target.value.replace(/\D/g, "")); setStaffOtpError(""); }} placeholder="000000" value={staffOtp} /></div>
          {staffOtpError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{staffOtpError}</p>}
          <button className="ww-primary-button flex min-h-12 items-center justify-center gap-2" disabled={isAuthorizingStaff} type="submit">{isAuthorizingStaff && <LoaderCircle className="h-5 w-5 animate-spin" />}{isAuthorizingStaff ? "Verifying…" : "Verify and continue"}</button>
          <button className="w-full text-sm font-bold text-water-700" disabled={isAuthorizingStaff} onClick={() => beginStaffAuthorization(staffAuthorization)} type="button">Resend code</button>
        </form>
      </Modal>}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">Security</p><h2 className="mt-1 text-xl font-extrabold text-navy-900">Profile security</h2><p className="mt-1 text-sm text-slate-600">Security changes are verified through your registered administrator email.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><button className="flex min-h-20 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-water-50" onClick={openTrustedDevices} type="button"><ShieldCheck className="h-5 w-5 shrink-0 text-water-700" /><span className="min-w-0 flex-1"><span className="block text-sm font-bold">Trusted devices</span><span className="mt-1 block text-xs leading-5 text-slate-500">Review browsers that can skip email OTP.</span></span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" /></button><button className="flex min-h-20 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-water-50" onClick={() => window.dispatchEvent(new CustomEvent("waterwise:open-change-password", { detail: { emailOnly: true } }))} type="button"><KeyRound className="h-5 w-5 shrink-0 text-water-700" /><span><span className="block text-sm font-bold">Change password</span><span className="mt-1 block text-xs leading-5 text-slate-500">Verify using email OTP only.</span></span></button><button className="flex min-h-20 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-water-50" onClick={() => window.dispatchEvent(new Event("waterwise:open-change-email"))} type="button"><Mail className="h-5 w-5 shrink-0 text-water-700" /><span><span className="block text-sm font-bold">Change email</span><span className="mt-1 block text-xs leading-5 text-slate-500">Verify your current email first.</span></span></button></div>
      </section>
    </div>
  );
}
