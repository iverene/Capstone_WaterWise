import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

const shell = {
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  background: "#0b2b40",
  color: "#eaf4f8",
  minHeight: "100vh",
  margin: 0,
  padding: "24px 16px 48px",
};
const card = {
  background: "#ffffff",
  color: "#0b2b40",
  borderRadius: 12,
  padding: 16,
  margin: "12px auto",
  maxWidth: 860,
};
const input = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #94a3b8",
  marginTop: 6,
  fontSize: 14,
};
const button = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 8,
  border: "none",
  background: "#0e7c6b",
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  marginTop: 12,
};
const thtd = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid #e2e8f0",
  fontSize: 13,
};

function formatReset(seconds) {
  const total = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const r = total % 60;
  return r === 0 ? `${m}m` : `${m}:${String(r).padStart(2, "0")}`;
}

function Section({ title, bucket }) {
  if (!bucket) return null;
  return (
    <div style={card}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>{title}</h2>
      <p style={{ margin: "0 0 12px", color: "#475569", fontSize: 13 }}>
        Limit {bucket.max} / {formatReset(bucket.windowSeconds)} window
        {" · "}hits {bucket.hits} · blocked {bucket.blocked} · active keys {bucket.activeKeys}
      </p>
      {bucket.top?.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thtd}>Key (masked)</th>
              <th style={thtd}>Count</th>
              <th style={thtd}>Resets in</th>
            </tr>
          </thead>
          <tbody>
            {bucket.top.map((row) => (
              <tr key={row.key}>
                <td style={{ ...thtd, fontFamily: "monospace" }}>{row.key}</td>
                <td style={thtd}>{row.count}</td>
                <td style={thtd}>{formatReset(row.resetInSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: "#64748b", fontSize: 13 }}>No active keys in this window.</p>
      )}
    </div>
  );
}

export default function App() {
  const [step, setStep] = useState("login"); // login | otp | dash
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState(null);
  const [role, setRole] = useState("");
  const pollRef = useRef(null);

  async function loadStats() {
    const result = await api("/admin/rate-limits/status");
    setStats(result.data);
  }

  function startPolling() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        await loadStats();
      } catch (err) {
        if (err?.status === 401 || err?.status === 403) {
          stopPolling();
          setStep("login");
          setError("Session ended or not authorized. Please sign in again.");
        }
      }
    }, 5000);
  }

  function stopPolling() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  }

  useEffect(() => () => stopPolling(), []);

  async function enterDashboard(user) {
    // Super-admin only (fail-fast): the backend route also enforces it, so
    // non-super-admin sessions never reach the stats data.
    if (user?.role !== "super-admin") {
      setError("This dashboard needs a super-admin account.");
      try {
        await api("/auth/logout", { method: "POST" });
      } catch {
        // Non-fatal; just stay on the login step.
      }
      return;
    }
    setRole(user.role);
    setStep("dash");
    setError("");
    try {
      await loadStats();
    } catch (err) {
      setError(err.message);
      return;
    }
    startPolling();
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api("/auth/login", {
        method: "POST",
        body: { email: identifier.trim(), password },
      });
      if (result.requiresOtp) {
        setChallengeToken(result.challengeToken);
        setMaskedEmail(result.maskedEmail ?? "");
        setOtp("");
        setPassword("");
        setStep("otp");
        return;
      }
      await enterDashboard(result.user);
    } catch (err) {
      const retry = Number(err?.data?.retryAfterSeconds) || 0;
      setError(
        retry > 0
          ? `${err.message} Retry in ${formatReset(retry)}.`
          : err.message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(event) {
    event.preventDefault();
    if (busy || !/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit verification code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api("/auth/admin/verify-login-otp", {
        method: "POST",
        body: { challengeToken, otp },
      });
      setChallengeToken("");
      setOtp("");
      await enterDashboard(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    stopPolling();
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // Local session is dropped regardless.
    }
    setStats(null);
    setRole("");
    setStep("login");
  }

  return (
    <div style={shell}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, margin: "4px 0" }}>WaterWise Rate Limits</h1>
        <p style={{ margin: "0 0 12px", color: "#9fc3d4", fontSize: 13 }}>
          Standalone monitor (frontend2) · counters reset on backend restart · keys masked
        </p>
      </div>

      {step !== "dash" && (
        <form
          onSubmit={step === "otp" ? handleVerify : handleLogin}
          style={{ ...card, maxWidth: 420 }}
        >
          {step === "login" ? (
            <>
              <h2 style={{ margin: "0 0 8px" }}>Super-admin sign in</h2>
              <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px" }}>
                Rate-limit monitor — super-admin only.
              </p>
              <label style={{ fontSize: 13 }}>
                Email or username
                <input
                  autoComplete="username"
                  onChange={(e) => setIdentifier(e.target.value)}
                  style={input}
                  value={identifier}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                Password
                <input
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                  style={input}
                  type="password"
                  value={password}
                />
              </label>
            </>
          ) : (
            <>
              <h2 style={{ margin: "0 0 8px" }}>Enter code</h2>
              <p style={{ fontSize: 13, color: "#475569" }}>
                Sent to {maskedEmail || "your email"}. Expires in 5 minutes.
              </p>
              <input
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="6-digit code"
                style={{ ...input, letterSpacing: 4, textAlign: "center" }}
                value={otp}
              />
            </>
          )}
          {error && (
            <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>
          )}
          <button disabled={busy} style={button} type="submit">
            {busy ? "Please wait…" : step === "otp" ? "Verify" : "Sign in"}
          </button>
        </form>
      )}

      {step === "dash" && (
        <>
          <div style={{ ...card, display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1, fontSize: 13 }}>
              Signed in as <strong>{role}</strong>
              {stats?.generatedAt && (
                <> · updated {new Date(stats.generatedAt).toLocaleTimeString()}</>
              )}
            </div>
            <button onClick={handleLogout} style={{ ...button, width: "auto", marginTop: 0 }} type="button">
              Sign out
            </button>
          </div>
          {error && (
            <div style={card}>
              <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>
            </div>
          )}
          <Section title="Global — all /api/* per IP" bucket={stats?.global} />
          <Section title="Auth — login/OTP per IP+email" bucket={stats?.auth} />
        </>
      )}
    </div>
  );
}
