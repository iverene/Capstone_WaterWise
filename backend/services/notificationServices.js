import { supabase } from "../config/supabase.js";
import { publishDataChange } from "./changeEventService.js";
import {
  addDays,
  currentManilaDate,
  dateAtUtcMidnight,
  daysBetween,
} from "../utils/billingPolicy.js";

const DEFAULT_REMINDER_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPCOMING_DUE_WINDOW_DAYS = 3;

export { currentManilaDate };

const currency = (value) =>
  new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    currencyDisplay: "symbol",
    minimumFractionDigits: 2,
    style: "currency",
  }).format(Number(value ?? 0));

const reminderForBill = (bill, today) => {
  const daysUntilDue = daysBetween(today, bill.due_date);
  const amount = currency(bill.remaining_balance);
  const common = {
    action_path: "/consumer/billing-ledger",
    announcement_date: today,
    announcement_type: "Billing Alert",
    billing_id: bill.id,
    consumer_id: bill.user_id,
  };

  if (daysUntilDue > 0) {
    return {
      ...common,
      event_key: `bill-due-soon:${bill.id}`,
      message: `Your outstanding balance of ${amount} is due on ${bill.due_date}. Please pay on or before the due date.`,
      notification_type: "bill_due_soon",
      priority: "normal",
      title: "Bill due soon",
    };
  }

  if (daysUntilDue === 0) {
    return {
      ...common,
      event_key: `bill-due-today:${bill.id}`,
      message: `Your outstanding balance of ${amount} is due today.`,
      notification_type: "bill_due_today",
      priority: "high",
      title: "Water bill due today",
    };
  }

  const overdueDays = Math.abs(daysUntilDue);
  const stage = overdueDays >= 90 ? 90 : overdueDays >= 60 ? 60 : overdueDays >= 30 ? 30 : 1;
  const priority = stage >= 60 ? "critical" : "high";

  return {
    ...common,
    event_key: `bill-overdue-${stage}:${bill.id}`,
    message: `Your balance of ${amount} is ${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue. Please settle it as soon as possible or contact the water district office for assistance.`,
    notification_type: stage === 1 ? "bill_overdue" : `bill_overdue_${stage}`,
    priority,
    title: stage === 1 ? "Water bill overdue" : `Water bill over ${stage} days overdue`,
  };
};

export async function processBillingReminders({ today = currentManilaDate() } = {}) {
  dateAtUtcMidnight(today);
  const reminderWindowEnd = addDays(today, UPCOMING_DUE_WINDOW_DAYS);
  const { data: bills, error: billingError } = await supabase
    .from("billing")
    .select("id, user_id, billing_date, due_date, remaining_balance, status")
    .gt("remaining_balance", 0)
    .neq("status", "Paid");

  if (billingError) {
    throw new Error(`Failed to retrieve bills for reminders: ${billingError.message}`);
  }

  const outstandingBills = bills ?? [];
  const reminders = outstandingBills
    .filter((bill) => bill.due_date <= reminderWindowEnd)
    .map((bill) => reminderForBill(bill, today));
  const billsByConsumer = outstandingBills.reduce((groups, bill) => {
    const consumerBills = groups.get(bill.user_id) ?? [];
    consumerBills.push(bill);
    groups.set(bill.user_id, consumerBills);
    return groups;
  }, new Map());
  const disconnectionNotices = Array.from(billsByConsumer.entries())
    .map(([consumerId, consumerBills]) => {
      const overdueBills = consumerBills
        .filter((bill) => bill.due_date < today)
        .sort((first, second) =>
          String(first.due_date).localeCompare(String(second.due_date)) || first.id - second.id,
        );
      if (overdueBills.length < 3) return null;

      const thirdOverdueBill = overdueBills[2];
      const totalBalance = overdueBills.reduce(
        (total, bill) => total + Number(bill.remaining_balance || 0),
        0,
      );

      return {
        action_path: "/consumer/billing-ledger",
        announcement_date: today,
        announcement_type: "Account Alert",
        billing_id: thirdOverdueBill.id,
        consumer_id: consumerId,
        event_key: `disconnection-grace:${consumerId}:${thirdOverdueBill.id}`,
        message: `Your account has been flagged for possible disconnection because you have ${overdueBills.length} overdue monthly bills totaling ${currency(totalBalance)}. You have a 3-day grace period to settle at least your oldest overdue bill. Please make your payment within the grace period to avoid water service disconnection. Contact the water district office if you need assistance.`,
        notification_type: "disconnection_warning",
        priority: "critical",
        title: "Account flagged — 3-day grace period",
      };
    })
    .filter(Boolean);
  const notifications = [...reminders, ...disconnectionNotices];
  if (notifications.length === 0) {
    return { checked: 0, created: 0, date: today };
  }

  const { data, error } = await supabase
    .from("notifications")
    .upsert(notifications, { ignoreDuplicates: true, onConflict: "event_key" })
    .select("id, event_key");

  if (error) {
    throw new Error(`Failed to create billing reminders: ${error.message}`);
  }

  return {
    checked: notifications.length,
    created: data?.length ?? 0,
    date: today,
  };
}

export function startNotificationReminderScheduler() {
  const configuredInterval = Number(process.env.NOTIFICATION_REMINDER_INTERVAL_MS);
  const intervalMs = Number.isFinite(configuredInterval) && configuredInterval >= 60_000
    ? configuredInterval
    : DEFAULT_REMINDER_INTERVAL_MS;
  let isRunning = false;

  const run = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const result = await processBillingReminders();
      if (result.created > 0) {
        publishDataChange({ actor: null, method: "SYSTEM", path: "/api/notifications" });
      }
      console.log(
        `Notification reminders checked ${result.checked} bill(s); created ${result.created}.`,
      );
    } catch (error) {
      console.error("Notification reminder processing failed:", error.message);
    } finally {
      isRunning = false;
    }
  };

  void run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
