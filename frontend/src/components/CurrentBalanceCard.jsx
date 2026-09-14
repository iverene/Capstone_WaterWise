import { CheckCircle2, Clock3, WalletCards } from "lucide-react";
import KPI from "./KPI";

export default function CurrentBalanceCard({ amountDue = 0 }) {
  const hasBalance = Number(amountDue) > 0;
  const value = `₱${Number(amountDue).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;

  return (
    <KPI
      description={hasBalance ? "outstanding household balance" : "your account is current"}
      descriptionHighlight={hasBalance ? "Payment needed" : "No unpaid bills"}
      descriptionIcon={hasBalance ? Clock3 : CheckCircle2}
      descriptionTone={hasBalance ? "warning" : "positive"}
      icon={WalletCards}
      title="Amount Due"
      value={value}
      valueTestId="balance-amount"
    />
  );
}
