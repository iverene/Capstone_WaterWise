import { useEffect, useMemo, useState } from "react";
import { FiCheckCircle, FiPlus, FiUsers } from "react-icons/fi";
import ResidentRegistrationIntro from "../components/ResidentRegistrationIntro";
import { UserRound, X } from "lucide-react";
import "../components/ResidentRegistration.css";
import ConsumerForm from "../components/ConsumerForm";
import ConsumerListTable from "../components/ConsumerListTable";
import Filter from "../components/Filter";
import KPI from "../components/KPI";
import Modal from "../components/Modal";
import OtpInput from "../components/OtpInput";
import PageHeader from "../components/PageHeader";
import Search from "../components/Search";
import { useToast } from "../components/Toast";
import { createConsumer, fetchConsumerDirectory, requestConsumerPasswordOtp, updateConsumer, verifyConsumerPasswordOtp } from "../services/consumerDirectoryAPI";

function toManagementConsumer(consumer) {
  if (!consumer) return null;
  const firstName = consumer.firstName ?? consumer.first_name ?? "";
  const middleName = consumer.middleName ?? consumer.middle_name ?? "";
  const lastName = consumer.lastName ?? consumer.last_name ?? "";
  const composedName = [firstName, middleName, lastName]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return {
    id: consumer.id,
    accountName: consumer.username ?? consumer.consumerNo ?? "",
    firstName,
    middleName,
    lastName,
    fullName: composedName || consumer.full_name || consumer.consumerName || consumer.name || "",
    purok: consumer.purok ?? (consumer.purok_no == null ? "Unassigned" : `Purok ${consumer.purok_no}`),
    email: consumer.email ?? "Not available",
    contactNumber: consumer.contactNumber ?? consumer.contact_number ?? "",
    status: consumer.status ?? "inactive",
  };
}

function getConsumerRequestError(requestError, fallback) {
  const fieldErrors = Object.values(requestError.response?.data?.errors ?? {}).filter(Boolean);
  return fieldErrors.length ? fieldErrors.join(" ") : requestError.response?.data?.message ?? fallback;
}

const formatOtpCountdown = (totalSeconds) => `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;

function ConsumerManagementPage() {
  const toast = useToast();
  const [consumers, setConsumers] = useState([]);
  const [selectedConsumer, setSelectedConsumer] = useState(null);
  const [formMode, setFormMode] = useState("");
  const [query, setQuery] = useState("");
  const [purok, setPurok] = useState("all");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [passwordChallenge, setPasswordChallenge] = useState(null);
  const [pendingConsumerUpdate, setPendingConsumerUpdate] = useState(null);
  const [passwordOtp, setPasswordOtp] = useState("");
  const [passwordOtpSuccess, setPasswordOtpSuccess] = useState(false);
  const [passwordOtpError, setPasswordOtpError] = useState("");
  const [isPasswordVerifying, setIsPasswordVerifying] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;

    fetchConsumerDirectory({ signal: controller.signal })
      .then((records) => {
        if (isActive) {
          setConsumers(records.map(toManagementConsumer).filter(Boolean));
        }
      })
      .catch((requestError) => {
        if (isActive && requestError.code !== "ERR_CANCELED") {
          setError(requestError.response?.data?.message ?? "Unable to load consumers.");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    const intervalId = window.setInterval(() => {
      fetchConsumerDirectory()
        .then((records) => {
          if (isActive) {
            setConsumers(records.map(toManagementConsumer).filter(Boolean));
          }
        })
        .catch(() => {});
    }, 15000);

    return () => {
      isActive = false;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, []);

  const addConsumer = async (consumer) => {
    try {
      setError("");
      const created = await createConsumer(consumer);
      const savedConsumer = toManagementConsumer(created);
      if (!savedConsumer) throw new Error("The server did not return the created resident.");
      setConsumers((current) => [savedConsumer, ...current]);
      setSelectedConsumer(null);
      setFormMode("");
      toast.success("Resident added", `${savedConsumer.fullName}'s account is ready to use.`);
      return true;
    } catch (requestError) {
      const message = getConsumerRequestError(requestError, "Unable to create resident.");
      setError(message);
      toast.error("Resident not added", message);
      return false;
    }
  };

  const saveConsumerUpdate = async (consumer, passwordAuthorization) => {
    try {
      setError("");
      const updated = await updateConsumer(selectedConsumer.id, consumer, { passwordAuthorization });
      const savedConsumer = toManagementConsumer(updated);
      if (!savedConsumer) throw new Error("The server did not return the updated resident.");
      setConsumers((current) => current.map((item) => item.id === savedConsumer.id ? savedConsumer : item));
      setSelectedConsumer(null);
      setFormMode("");
      toast.success("Resident updated", `${savedConsumer.fullName}'s profile changes were saved.`);
      return true;
    } catch (requestError) {
      const message = getConsumerRequestError(requestError, "Unable to update resident.");
      setError(message);
      toast.error("Resident not updated", message);
      return false;
    }
  };

  const editConsumer = async (consumer) => {
    if (!consumer.password) return saveConsumerUpdate(consumer);
    setIsPasswordVerifying(true); setError(""); setPasswordOtpError("");
    try {
      const result = await requestConsumerPasswordOtp(selectedConsumer.id);
      setPendingConsumerUpdate(consumer);
      setPasswordChallenge(result);
      setPasswordOtp("");
      setResendSeconds(Number(result.cooldownSeconds ?? 300));
    } catch (requestError) {
      const message = getConsumerRequestError(requestError, "Unable to send the verification code.");
      setError(message);
      toast.error("Verification unavailable", message);
    } finally { setIsPasswordVerifying(false); }
    return false;
  };

  const resendPasswordOtp = async () => {
    if (!selectedConsumer?.id || !passwordChallenge) return;
    setIsPasswordVerifying(true); setPasswordOtpError("");
    try {
      const result = await requestConsumerPasswordOtp(selectedConsumer.id);
      setPasswordChallenge(result); setPasswordOtp(""); setPasswordOtpSuccess(false);
      setResendSeconds(Number(result.cooldownSeconds ?? 300));
    } catch (requestError) {
      setPasswordOtpError(getConsumerRequestError(requestError, "Unable to send the verification code."));
    } finally { setIsPasswordVerifying(false); }
  };

  const confirmPasswordChange = async (event) => {
    event.preventDefault();
    if (!passwordChallenge?.challengeToken) return setPasswordOtpError("This verification session is invalid. Request a new code.");
    if (!/^\d{6}$/.test(passwordOtp)) return setPasswordOtpError("Enter the 6-digit verification code.");
    setIsPasswordVerifying(true); setPasswordOtpError("");
    try {
      const result = await verifyConsumerPasswordOtp(passwordChallenge.challengeToken, passwordOtp);
      const saved = await saveConsumerUpdate(pendingConsumerUpdate, result.authorizationToken);
      if (saved) { setPasswordChallenge(null); setPendingConsumerUpdate(null); setPasswordOtp(""); setResendSeconds(0); }
    } catch (requestError) {
      setPasswordOtpError(getConsumerRequestError(requestError, "Unable to verify the code."));
    } finally { setIsPasswordVerifying(false); }
  };

  const visibleConsumers = useMemo(() => {
    const term = query.trim().toLowerCase();
    return consumers.filter((consumer) =>
      (!term || [consumer.accountName, consumer.fullName, consumer.firstName, consumer.middleName, consumer.lastName]
        .some((value) => String(value).toLowerCase().includes(term))) &&
      (purok === "all" || consumer.purok === purok),
    );
  }, [consumers, purok, query]);

  const purokOptions = useMemo(() => {
    const values = [...new Set(consumers.map((consumer) => String(consumer?.purok ?? "").trim()).filter(Boolean))]
      .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
    return [
      { label: "All puroks", value: "all" },
      ...values.map((value) => ({ label: value, value })),
    ];
  }, [consumers]);

  const selectConsumer = (consumer) => {
    setSelectedConsumer(consumer);
    setFormMode("edit");
  };

  const closeForm = () => {
    setFormMode("");
    setSelectedConsumer(null);
    setError("");
    setPasswordChallenge(null);
    setPendingConsumerUpdate(null);
    setPasswordOtp("");
    setPasswordOtpError("");
  };

  const openAddResident = () => {
    setSelectedConsumer(null);
    setFormMode("add");
  };

  return (
    <main className="space-y-6">
      <PageHeader description="Register community accounts, review service locations, and monitor billing readiness from one workspace." title="Resident Management" />

      <section aria-label="Resident summary" className="grid grid-cols-2 gap-2 sm:gap-3">
        <KPI compact description="Community" icon={FiUsers} title="Total Residents" value={consumers.length} />
        <KPI compact description="Service-Ready" icon={FiCheckCircle} title="Active Accounts" value={consumers.filter((item) => item.status?.toLowerCase() === "active").length} />
      </section>

      <Modal
        ariaLabel="Add a new resident"
        className={formMode === "add" ? "resident-registration-modal" : ""}
        showHeader={formMode !== "add"}
        closeLabel="Close resident form"
        description={formMode === "edit" ? "Update the resident's service information." : "Enter the resident's details and create secure sign-in credentials."}
        eyebrow="Resident account"
        isOpen={Boolean(formMode)}
        onClose={closeForm}
        panelRoundedClass="rounded-xl"
        showCloseButton={false}
        size={formMode === "add" ? "xl" : "lg"}
        title={formMode === "edit" ? "Edit Resident" : "Add Resident"}
      >
        <div className={formMode === "add" ? "resident-registration-layout" : ""}>
          {formMode === "add" && <ResidentRegistrationIntro />}
          <div className={formMode === "add" ? "resident-registration-content" : ""}>
            {formMode === "add" && <header className="resident-registration-heading"><span className="resident-heading-icon"><UserRound aria-hidden="true" size={34} /></span><div><h2>Resident Information</h2><p>Enter the resident's details and create secure sign-in credentials.</p></div><button aria-label="Close resident form" className="resident-registration-close" onClick={closeForm} type="button"><X size={21} /></button></header>}
            {error && (
              <p
                className="mx-5 mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 sm:mx-6"
                role="alert"
              >
                {error}
              </p>
            )}
            <ConsumerForm
              allowPasswordChange={formMode === "edit"}
              embedded
              registrationDesign={formMode === "add"}
              initialData={formMode === "edit" ? selectedConsumer : null}
              key={`${formMode}-${selectedConsumer?.id ?? "new"}`}
              onCancel={closeForm}
              onSubmit={formMode === "edit" ? editConsumer : addConsumer}
              requirePassword={formMode === "add"}
            />
          </div>
        </div>
      </Modal>

      <Modal description="This code can be used only for this resident password change." eyebrow="Password security" isOpen={Boolean(passwordChallenge)} onClose={() => { if (!isPasswordVerifying) { setPasswordChallenge(null); setPendingConsumerUpdate(null); setPasswordOtp(""); setPasswordOtpError(""); setResendSeconds(0); } }} size="sm" title="Verify Resident Password Change">
        {passwordChallenge && (
        <form className="space-y-3 p-5 sm:space-y-4 sm:p-6" onSubmit={confirmPasswordChange}>
          <p className="text-xs leading-5 text-slate-600 sm:text-sm">Enter the code sent to <strong>{passwordChallenge?.maskedEmail ?? "your email"}</strong>. It expires in 5 minutes.</p>
          <div><label className="text-xs font-semibold text-slate-900 sm:text-sm" htmlFor="resident-password-otp">Verification code</label><div className="mt-2 sm:mt-3"><OtpInput compact disabled={isPasswordVerifying} id="resident-password-otp" invalid={Boolean(passwordOtpError)} onChange={(nextOtp) => { setPasswordOtp(nextOtp); setPasswordOtpError(""); setPasswordOtpSuccess(false); }} onAutoVerify={(otpValue) => { if (/^\d{6}$/.test(otpValue) && passwordChallenge?.challengeToken) { setIsPasswordVerifying(true); setPasswordOtpError(""); verifyConsumerPasswordOtp(passwordChallenge.challengeToken, otpValue).then(result => { setPasswordOtpSuccess(true); setTimeout(() => { saveConsumerUpdate(pendingConsumerUpdate, result.authorizationToken).then(saved => { if (saved) { setPasswordChallenge(null); setPendingConsumerUpdate(null); setPasswordOtp(""); setPasswordOtpSuccess(false); } }); }, 600); }).catch(e => { setPasswordOtpError(getConsumerRequestError(e, "Unable to verify the code.")); setPasswordOtp(""); }).finally(() => setIsPasswordVerifying(false)); } }} success={passwordOtpSuccess} value={passwordOtp} /></div></div>
          {passwordOtpError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{passwordOtpError}</p>}
          <button className="w-full text-xs font-bold text-water-700 disabled:cursor-not-allowed disabled:text-slate-400 sm:text-sm" disabled={isPasswordVerifying || resendSeconds > 0} onClick={resendPasswordOtp} type="button">{resendSeconds > 0 ? `Resend code in ${formatOtpCountdown(resendSeconds)}` : "Resend code"}</button>
        </form>
        )}
      </Modal>

      {error && !formMode && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">{error}</p>}

      <div
        aria-label="Resident table controls"
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
        role="search"
      >
        <Search ariaLabel="Search residents by username or name" className="flex-1" onValueChange={setQuery} placeholder="Search username or name" value={query} />
        <Filter ariaLabel="Filter residents by purok" className="w-full sm:w-48" onValueChange={setPurok} options={purokOptions} value={purok} />
      </div>

      <div className="flex justify-end">
        <button
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-water-600 px-5 text-sm font-bold text-white shadow-card transition-colors hover:bg-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2"
          onClick={openAddResident}
          type="button"
        >
          <FiPlus aria-hidden="true" className="h-5 w-5" />
          Add Resident
        </button>
      </div>

      <ConsumerListTable
        consumers={visibleConsumers}
        isLoading={isLoading}
        onEdit={selectConsumer}
      />
    </main>
  );
}

export default ConsumerManagementPage;
