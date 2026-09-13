import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Droplets,
  Gauge,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router-dom";
import AnnouncementPage from "../components/AnnouncementPage";
import KPI from "../components/KPI";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import { isCanceledRequest } from "../services/apiClient";
import { fetchConsumerHome } from "../services/consumerPortal.service";

const currency = (value) =>
  new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    minimumFractionDigits: 2,
    style: "currency",
  }).format(Number(value ?? 0));

const displayDate = (value) => value
  ? new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00Z`))
  : "No pending due date";

const compactDate = (value) => value
  ? new Intl.DateTimeFormat("en-PH", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00Z`))
  : "None";

export default function ConsumerHome() {
  const [home, setHome] = useState(null);
  const [error, setError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);

  const retry = useCallback(() => {
    setError("");
    setHome(null);
    setRequestVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchConsumerHome({ signal: controller.signal })
      .then(setHome)
      .catch((requestError) => {
        if (!isCanceledRequest(requestError)) setError(requestError.message);
      });
    return () => controller.abort();
  }, [requestVersion]);

  const pageHeader = (
    <PageHeader
      description="See your account, water use, upcoming payments, and the latest community updates in one place."
      descriptionClassName="!text-[13px] !leading-5 sm:!text-sm sm:!leading-6"
      title={home ? `Welcome home, ${(home.account.name ?? "").split(" ")[0] || "Resident"}` : "Consumer Home"}
    />
  );

  if (error) {
    return (
      <div className="space-y-5">
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

  if (!home) {
    return (
      <div className="space-y-5 sm:space-y-6">
        {pageHeader}
        <LoadingSkeleton label="Loading your home dashboard" variant="home-metrics" />
        <LoadingSkeleton count={2} label="Loading community announcements" variant="list" />
      </div>
    );
  }

  const usageDifference = home.reading.previousUsage == null
    ? null
    : home.reading.latestUsage - home.reading.previousUsage;
  const hasBalance = home.billing.outstandingBalance > 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      {pageHeader}

      {hasBalance && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5" aria-labelledby="payment-required-heading">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                <ReceiptText aria-hidden="true" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-800">Important now</p>
                <h2 className="mt-1 font-extrabold text-navy-900" id="payment-required-heading">Payment required</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  <strong className="font-extrabold text-amber-800">{currency(home.billing.outstandingBalance)}</strong> remains due
                  {home.billing.nextDueDate ? <> by <strong className="font-bold text-navy-900">{displayDate(home.billing.nextDueDate)}</strong></> : ""}.
                </p>
              </div>
            </div>
            <Link
              className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-navy-950 px-5 text-sm font-bold text-white hover:bg-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-900 focus-visible:ring-offset-2 sm:w-auto"
              to={home.billing.nextBillingId ? `/consumer/billing-ledger?billingId=${home.billing.nextBillingId}` : "/consumer/billing-ledger"}
            >
              View bill <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4" aria-label="Account summary">
        <KPI
          description={hasBalance ? "awaiting payment" : "account is clear"}
          descriptionHighlight={hasBalance
            ? `${home.billing.pendingCount} bill${home.billing.pendingCount === 1 ? "" : "s"}`
            : "No unpaid bills"}
          descriptionIcon={hasBalance ? ReceiptText : CheckCircle2}
          descriptionTone={hasBalance ? "warning" : "positive"}
          icon={WalletCards}
          title="Outstanding balance"
          value={currency(home.billing.outstandingBalance)}
        />
        <KPI
          description={home.billing.nextDueDate ? "payment deadline" : "account is clear"}
          descriptionHighlight={home.billing.nextDueDate ? displayDate(home.billing.nextDueDate) : "No due date"}
          descriptionIcon={home.billing.nextDueDate ? CalendarClock : CheckCircle2}
          descriptionTone={home.billing.nextDueDate ? "warning" : "positive"}
          icon={CalendarClock}
          title="Next due date"
          value={compactDate(home.billing.nextDueDate)}
        />
        <KPI
          description={usageDifference == null ? "no previous month" : usageDifference === 0 ? "from last month" : "than last month"}
          descriptionHighlight={usageDifference == null ? "First reading" : undefined}
          descriptionIcon={usageDifference == null ? Droplets : undefined}
          icon={Droplets}
          showTrendBadge={false}
          title="Latest consumption"
          trend={usageDifference == null
            ? undefined
            : usageDifference === 0
              ? "No change"
              : `${Math.abs(usageDifference).toFixed(1)} m³ ${usageDifference > 0 ? "higher" : "lower"}`}
          trendDirection={usageDifference > 0 ? "up" : usageDifference < 0 ? "down" : "neutral"}
          trendTone={usageDifference > 0 ? "warning" : usageDifference < 0 ? "positive" : "neutral"}
          unit="m³"
          value={home.reading.latestUsage.toFixed(1)}
        />
        <KPI
          description={home.reading.latestDate ? "recorded" : undefined}
          descriptionHighlight={home.reading.latestDate ? displayDate(home.reading.latestDate) : "No reading yet"}
          descriptionIcon={home.reading.latestDate ? CalendarClock : Gauge}
          descriptionTone={home.reading.latestDate ? "water" : "neutral"}
          icon={Gauge}
          title="Current meter reading"
          unit="m³"
          value={home.reading.currentReading.toFixed(1)}
        />
      </section>

      <div className="w-full">
        <section className="min-w-0" aria-labelledby="consumer-announcements-heading">
          <div className="mb-4">
            <h2 className="text-xl font-extrabold text-navy-900" id="consumer-announcements-heading">Latest announcements</h2>
          </div>
          <AnnouncementPage announcements={home.announcements} showEndMarker={false} showHeader={false} />
          <Link
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-water-700 hover:border-water-300 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
            to="/consumer/announcements"
          >
            See more announcements
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </section>
      </div>
    </div>
  );
}
