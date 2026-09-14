import { Banknote, CheckCircle2, Clock3, ReceiptText, WalletCards } from "lucide-react";
import KPI from "./KPI";

const currency = (value) =>
  `₱${Number(value ?? 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;

export default function BillingSummaryCard({ billingData = [] }) {
  const totalBills = billingData.length;
  const paidBills = billingData.filter((bill) => bill.status === "Paid").length;
  const partiallyPaidBills = billingData.filter(
    (bill) => bill.status === "Partially Paid",
  ).length;
  const unpaidBills = billingData.filter((bill) => bill.status === "Unpaid").length;
  const openBills = partiallyPaidBills + unpaidBills;
  const totalBilling = billingData.reduce(
    (total, bill) => total + Number(bill.amountDue ?? 0),
    0,
  );
  const outstanding = billingData.reduce(
    (total, bill) => total + Number(bill.outstandingBalance ?? 0),
    0,
  );

  return (
    <section aria-label="Billing summary" className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
      <KPI
        cardTestId="total-billing-card"
        compact
        description="included in the total"
        descriptionHighlight={`${totalBills} billing ${totalBills === 1 ? "record" : "records"}`}
        descriptionIcon={ReceiptText}
        icon={Banknote}
        title="Total Billed"
        value={currency(totalBilling)}
        valueTestId="total-billing-value"
      />
      <KPI
        cardTestId="outstanding-billing-card"
        compact
        description={openBills ? "remaining to collect" : "nothing left to collect"}
        descriptionHighlight={openBills ? `${openBills} open bill${openBills === 1 ? "" : "s"}` : "No open bills"}
        descriptionIcon={openBills ? Clock3 : CheckCircle2}
        descriptionTone={openBills ? "warning" : "positive"}
        icon={WalletCards}
        title="Outstanding Balance"
        value={currency(outstanding)}
        valueTestId="outstanding-billing-value"
      />
      <KPI
        cardTestId="paid-bills-card"
        compact
        description="fully settled"
        descriptionHighlight={`${paidBills} bill${paidBills === 1 ? "" : "s"}`}
        descriptionIcon={CheckCircle2}
        descriptionTone="positive"
        icon={CheckCircle2}
        title="Paid Bills"
        value={paidBills}
        valueTestId="paid-bills-value"
      />
      <KPI
        cardTestId="open-bills-card"
        compact
        description={openBills ? `${partiallyPaidBills} partially paid` : "all bills are settled"}
        descriptionHighlight={openBills ? `${unpaidBills} unpaid` : "No open bills"}
        descriptionIcon={openBills ? Clock3 : CheckCircle2}
        descriptionTone={openBills ? "warning" : "positive"}
        icon={openBills ? Clock3 : CheckCircle2}
        title="Open Bills"
        value={openBills}
        valueTestId="open-bills-value"
      />
    </section>
  );
}
