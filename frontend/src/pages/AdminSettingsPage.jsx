import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import Modal from "../components/Modal";
import LoadingSkeleton from "../components/LoadingSkeleton";
import OtpInput from "../components/OtpInput";
import PageHeader from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { requestSettingsChangeOtp, verifySettingsChangeOtp, updateSystemSetting, fetchSystemSettings } from "../services/systemSettingsService";
import { getStoredAccount } from "../services/authToken";
import { SETTINGS_PERMISSION_KEY } from "./AdminProfile";

const formatOtpCountdown = (totalSeconds) => `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;

function getStoredSettingsPermission() {
  try {
    const permission = JSON.parse(window.sessionStorage.getItem(SETTINGS_PERMISSION_KEY) ?? "null");
    // The permission belongs to the super-admin that verified it. Never
    // restore another account's entry (same-tab login switching).
    let currentAccountId = null;
    try {
      currentAccountId = getStoredAccount()?.id ?? null;
    } catch {
      currentAccountId = null;
    }
    if (
      permission?.token &&
      Number(permission.expiresAt) > Date.now() &&
      permission.accountId != null &&
      currentAccountId != null &&
      String(permission.accountId) === String(currentAccountId)
    ) return permission;
    window.sessionStorage.removeItem(SETTINGS_PERMISSION_KEY);
  } catch { window.sessionStorage.removeItem(SETTINGS_PERMISSION_KEY); }
  return null;
}

export default function AdminSettingsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const mountedRef = useRef(true);
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [otpChallenge, setOtpChallenge] = useState(null);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpSuccess, setOtpSuccess] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [needsReverify, setNeedsReverify] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setLoadError("");
      if (mountedRef.current) setNeedsReverify(false);
      const permission = getStoredSettingsPermission();
      if (!permission?.token) {
        if (mountedRef.current) {
          setLoadError("Your settings-view permission has expired. Return to your profile and verify again.");
          setSettings([]);
          setNeedsReverify(true);
        }
        return;
      }
      const result = await fetchSystemSettings(permission.token);
      if (mountedRef.current) setSettings(result.data ?? []);
    } catch (error) {
      const status = error.cause?.response?.status;
      const message = error.message ?? "";
      const isAuthError =
        status === 401 ||
        status === 403 ||
        /verify.*otp|expired|authorization|permission/i.test(message);
      if (isAuthError) {
        try {
          window.sessionStorage.removeItem(SETTINGS_PERMISSION_KEY);
        } catch {
          // Storage may be unavailable; the reverify screen still works.
        }
      }
      if (mountedRef.current) {
        setLoadError(message || "Unable to load system settings.");
        if (isAuthError) {
          setSettings([]);
          setNeedsReverify(true);
        }
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadSettings();
    return () => { mountedRef.current = false; };
  }, [loadSettings]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => setCooldownSeconds((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const startEdit = (key, currentValue) => {
    setEditingKey(key);
    setEditValue(String(currentValue));
    setSaveError("");
    setOtpChallenge(null);
    setOtp("");
    setOtpError("");
    setOtpSuccess(false);
    setCooldownSeconds(0);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue("");
    setSaveError("");
    setOtpChallenge(null);
    setOtp("");
    setOtpError("");
    setOtpSuccess(false);
    setCooldownSeconds(0);
  };

  const handleRequestOtp = async () => {
    try {
      setSaving(true);
      setSaveError("");
      setOtpError("");
      const result = await requestSettingsChangeOtp();
      setOtpChallenge(result);
      setCooldownSeconds(result.cooldownSeconds ?? 300);
      toast.success("Code sent", result.message);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyOtp = async (otpValue) => {
    if (!editingKey) {
      setSaveError("No setting is being edited. Close and reopen the editor.");
      return;
    }
    // Capture locals: the editor may be cancelled while the 600ms success
    // animation runs, which would otherwise PATCH /system-settings/null.
    const settingKey = editingKey;
    const settingValue = Number(editValue);
    if (!Number.isFinite(settingValue) || settingValue < 0) {
      setSaveError("Please enter a valid non-negative number.");
      return;
    }
    try {
      setVerifying(true);
      setOtpError("");
      const result = await verifySettingsChangeOtp(otpChallenge.challengeToken, otpValue);
      setOtpSuccess(true);
      setTimeout(async () => {
        try {
          await updateSystemSetting(settingKey, settingValue, result.authorizationToken);
          toast.success("Setting updated", `"${settingKey}" has been updated successfully.`);
          cancelEdit();
          loadSettings();
        } catch (error) {
          setSaveError(error.message);
          setOtpChallenge(null);
          setOtp("");
          setOtpSuccess(false);
        }
      }, 600);
    } catch (error) {
      setOtpError(error.message);
      setOtp("");
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    const numericValue = Number(editValue);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      setSaveError("Please enter a valid non-negative number.");
      return;
    }
    if (!otpChallenge) {
      await handleRequestOtp();
      return;
    }
  };

  return (
    <main className="space-y-4 sm:space-y-6">
      <button className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-bold text-water-700 hover:bg-water-50" onClick={() => navigate("/admin/profile", { replace: true })} type="button"><ArrowLeft className="h-4 w-4" />Back to administrator account</button>
      <PageHeader
        description="Manage system-wide configuration. Only the Super Admin can modify these settings."
        eyebrow="Administration"
        mobileCompact
        onBack={() => navigate("/admin/profile", { replace: true })}
        title="System Settings"
      />

      {loadError && (
        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span>{loadError}</span>
          <div className="flex shrink-0 items-center gap-3">
            {needsReverify ? (
              <button
                className="min-h-10 rounded-xl bg-water-600 px-4 font-bold text-white transition-colors hover:bg-water-700"
                onClick={() => navigate("/admin/profile", { replace: true })}
                type="button"
              >
                Return to profile to verify
              </button>
            ) : (
              <button
                className="font-bold underline"
                onClick={() => {
                  setLoading(true);
                  loadSettings();
                }}
                type="button"
              >
                Try again
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton count={3} label="Loading system settings" variant="list" />
      ) : (
        <div className="space-y-3">
          {settings.map((setting) => (
            <div key={setting.id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{setting.setting_key}</p>
                  <p className="mt-1 text-sm text-slate-600">{setting.description}</p>
                  {setting.updated_at && (
                    <p className="mt-1 text-xs text-slate-400">
                      Last updated: {new Date(setting.updated_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold text-slate-900">
                    {setting.setting_key === "rate_per_cubic_meter"
                      ? `₱${Number(setting.setting_value).toFixed(2)}`
                      : String(setting.setting_value)}
                  </span>
                  <button
                    className="min-h-10 rounded-xl border border-water-200 bg-water-50 px-4 text-sm font-semibold text-water-700 transition-colors hover:bg-water-100"
                    onClick={() => startEdit(setting.setting_key, setting.setting_value)}
                    type="button"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        closeLabel="Close settings editor"
        description={`Update "${editingKey}"`}
        dismissible={!saving && !verifying}
        eyebrow="System settings"
        isOpen={Boolean(editingKey)}
        onClose={cancelEdit}
        showCloseButton={false}
        size="sm"
        title="Update Setting"
      >
        <div className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
          {saveError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{saveError}</div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-900 sm:text-sm" htmlFor="setting-value">{editingKey === "rate_per_cubic_meter" ? "New value (₱ per m³)" : "New value"}</label>
            <input
              className="mt-2 block w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors focus:border-water-500 focus:bg-white focus:ring-4 focus:ring-water-100"
              id="setting-value"
              min="0"
              onChange={(e) => { setEditValue(e.target.value); setSaveError(""); }}
              step="0.01"
              type="number"
              value={editValue}
            />
          </div>

          {otpChallenge && (
            <>
              <p className="text-xs leading-5 text-slate-600 sm:text-sm">Enter the code sent to <strong>{otpChallenge.maskedEmail}</strong>. It expires in 5 minutes.</p>
              <div>
                <label className="text-xs font-semibold text-slate-900 sm:text-sm" htmlFor="settings-otp">Verification code</label>
                <div className="mt-2 sm:mt-3">
                  <OtpInput
                    compact
                    disabled={verifying || cooldownSeconds === 0}
                    id="settings-otp"
                    invalid={Boolean(otpError)}
                    onChange={(nextOtp) => { setOtp(nextOtp); setOtpError(""); setOtpSuccess(false); }}
                    onAutoVerify={(otpValue) => { if (/^\d{6}$/.test(otpValue)) handleVerifyOtp(otpValue); }}
                    success={otpSuccess}
                    value={otp}
                  />
                </div>
              </div>
              {cooldownSeconds === 0 && <p aria-live="polite" className="text-center text-xs font-semibold text-red-600 sm:text-sm">This code has expired. Request a new code below.</p>}
              {otpError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{otpError}</p>}
            </>
          )}

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            {otpChallenge ? (
              <>
                <button
                  className="order-1 text-xs font-bold text-water-700 disabled:cursor-not-allowed disabled:text-slate-400 sm:order-2 sm:text-sm"
                  disabled={saving || verifying || cooldownSeconds > 0}
                  onClick={handleRequestOtp}
                  type="button"
                >
                  {cooldownSeconds > 0 ? `Resend code in ${formatOtpCountdown(cooldownSeconds)}` : "Resend code"}
                </button>
                <button
                  className="order-2 min-h-10 rounded-xl px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 sm:order-1 sm:min-h-11"
                  disabled={verifying}
                  onClick={cancelEdit}
                  type="button"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  className="ww-primary-button flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold sm:min-h-11"
                  disabled={saving}
                  onClick={handleSave}
                  type="button"
                >
                  {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  {saving ? "Sending code…" : "Request verification code"}
                </button>
                <button
                  className="min-h-10 rounded-xl px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 sm:min-h-11"
                  disabled={saving}
                  onClick={cancelEdit}
                  type="button"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </Modal>
    </main>
  );
}
