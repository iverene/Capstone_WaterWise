import { Banknote, CheckCircle2, Clock3, ReceiptText, WalletCards } from "lucide-react";
import KPI from "./KPI";

const currency = (value) =>
  `₱${Number(value ?? 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;

export default function BillingSummaryCard({ animateValue = false, billingData = [] }) {
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
        animateValue={animateValue}
        cardTestId="total-billing-card"
        compact
        description="In Total"
        descriptionHighlight={`${totalBills} Billing ${totalBills === 1 ? "Record" : "Records"}`}
        descriptionIcon={ReceiptText}
        icon={Banknote}
        title="Total Billed"
        value={currency(totalBilling)}
        valueTestId="total-billing-value"
      />
      <KPI
        animateValue={animateValue}
        cardTestId="outstanding-billing-card"
        compact
        description={openBills ? "Uncollected" : "All Collected"}
        descriptionHighlight={openBills ? `${openBills} Open Bill${openBills === 1 ? "" : "s"}` : "No Open Bills"}
        descriptionIcon={openBills ? Clock3 : CheckCircle2}
        descriptionTone={openBills ? "warning" : "positive"}
        icon={WalletCards}
        title="Outstanding Balance"
        value={currency(outstanding)}
        valueTestId="outstanding-billing-value"
      />
      <KPI
        animateValue={animateValue}
        cardTestId="paid-bills-card"
        compact
        description="Fully Settled"
        descriptionHighlight={`${paidBills} Bill${paidBills === 1 ? "" : "s"}`}
        descriptionIcon={CheckCircle2}
        descriptionTone="positive"
        icon={CheckCircle2}
        title="Paid Bills"
        value={paidBills}
        valueTestId="paid-bills-value"
      />
      <KPI
        animateValue={animateValue}
        cardTestId="open-bills-card"
        compact
        description={openBills ? `${partiallyPaidBills} Partially Paid` : "All Settled"}
        descriptionHighlight={openBills ? `${unpaidBills} Unpaid` : "No Open Bills"}
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
