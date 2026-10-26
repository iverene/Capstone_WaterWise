import { apiRequest } from "./apiClient";
import { getStoredAccount } from "./authToken";
import { toLocalMobileNumber } from "../utils/phoneNumber";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});

function formatDate(value) {
  return value ? dateFormatter.format(new Date(`${value}T00:00:00Z`)) : "";
}

function formatMonth(value) {
  return value
    ? monthFormatter.format(new Date(`${String(value).slice(0, 7)}-01T00:00:00Z`))
    : "No readings";
}

function isCurrentMonth(value) {
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return String(value ?? "").slice(0, 7) === currentMonth;
}

function currentManilaDateString(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Manila",
    year: "numeric",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function overdueDaysFor(dueDate, today) {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate))) return 0;
  const elapsed = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`);
  if (!Number.isFinite(elapsed)) return 0;
  return Math.max(0, Math.floor(elapsed / 86_400_000));
}

async function requireConsumerAccount() {
  const user = getStoredAccount();
  if (!user || user.role !== "consumer") {
    throw new Error("An authenticated consumer account is required.");
  }
  return user;
}

function composeProfileName(profile, fallback = "") {
  const composed = [profile.first_name, profile.middle_name, profile.last_name]
    .map((part) => String(part ?? "").trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(" ");
  return composed || profile.full_name || fallback;
}

function normalizeBilling(record, profile, reading, today = currentManilaDateString()) {
  const remainingBalance = Number(record.remaining_balance ?? 0);
  const storedStatus = record.status ?? "Unpaid";
  const overdueDays = remainingBalance > 0 && storedStatus !== "Paid"
    ? overdueDaysFor(record.due_date, today)
    : 0;
  return {
    id: record.id,
    invoiceNumber: `INV-${record.id}`,
    name: composeProfileName(profile),
    consumerName: composeProfileName(profile),
    billingPeriod: formatMonth(record.billing_date),
    readingDate: reading?.reading_date ?? record.billing_date,
    cubicMetersConsumed: Number(reading?.consumption ?? 0),
    amountDue: Number(record.total_bill ?? 0),
    remainingBalance,
    outstandingBalance: remainingBalance,
    status: overdueDays > 0 ? "Overdue" : storedStatus,
    previousStatus: storedStatus,
    overdueDays,
    address: profile.purok_no != null ? `Purok ${profile.purok_no}` : "",
    previousReading: Number(reading?.previous_reading ?? 0),
    currentReading: Number(reading?.present_reading ?? 0),
    dueDate: record.due_date,
    createdAt: reading?.created_at ?? record.created_at,
  };
}

function notificationActionPath(notification, notificationType, isBillingAlert) {
  if (notificationType === "account_status_changed") {
    return "/consumer/profile-details";
  }
  if (notificationType === "payment_received" && notification.payment_id) {
    return `/consumer/payments?paymentId=${notification.payment_id}`;
  }
  if (notificationType === "bill_generated" && notification.billing_id) {
    return `/consumer/billing-ledger?billingId=${notification.billing_id}&view=consumption-receipt`;
  }
  if (isBillingAlert && notification.billing_id) {
    return `/consumer/billing-ledger?billingId=${notification.billing_id}`;
  }
  return notification.action_path ?? (isBillingAlert ? "/consumer/billing-ledger" : undefined);
}

function normalizeConsumerAnnouncements(notifications) {
  return (notifications ?? [])
    .filter((notification) => {
      const type = String(notification.notification_type ?? "announcement").toLowerCase();
      return notification.consumer_id == null && ["announcement", "service_alert"].includes(type);
    })
    .map((notification) => ({
      id: notification.id,
      title: notification.title,
      content: notification.message,
      publicationDate: notification.announcement_date,
      relatedEvent: notification.announcement_type,
      priority: notification.priority ?? "normal",
      createdAt: notification.created_at,
    }));
}

export async function fetchConsumerProfile(options) {
  const account = await requireConsumerAccount();
  const profilePayload = await apiRequest(`/consumers/${account.id}`, options);
  const consumer = profilePayload.data;

  return {
    accountId: consumer.id,
    name: composeProfileName(consumer, consumer.username),
    username: consumer.username,
    purok: consumer.purok_no != null ? `Purok ${consumer.purok_no}` : null,
    purokNo: consumer.purok_no ?? null,
    email: consumer.email,
    contactNumber: consumer.contact_number ? toLocalMobileNumber(consumer.contact_number) : null,
    status: consumer.status,
    onboardingCompleted: consumer.onboarding_completed === true,
    accountCreatedDate: formatDate(String(consumer.created_at ?? "").slice(0, 10)),
  };
}

// Self-service profile update. Only contact number and purok are accepted by
// the backend; anything else is rejected with 403 rather than ignored.
export async function updateConsumerProfile({ contactNumber, purokNo, email }, options) {
  try {
    const body = {};
    if (contactNumber !== undefined) body.contactNumber = contactNumber;
    if (purokNo !== undefined) body.purokNo = purokNo;
    if (email !== undefined) body.email = email;

    const payload = await apiRequest("/consumers/me", {
      method: "PATCH",
      body: JSON.stringify(body),
      ...options,
    });
    return payload.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.message ?? "Unable to update your profile.",
      { cause: error },
    );
  }
}

export async function completeConsumerOnboarding(password) {
  try {
    const payload = await apiRequest("/consumers/me/onboarding", {
      method: "PATCH",
      body: JSON.stringify(password ? { password } : {}),
    });
    return payload.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.message ?? "Unable to complete onboarding.",
      { cause: error },
    );
  }
}

export async function fetchConsumerHome(options) {
  const account = await requireConsumerAccount();
  const [profilePayload, billingPayload, consumptionPayload, notificationPayload] =
    await Promise.all([
      apiRequest(`/consumers/${account.id}`, options),
      apiRequest(`/billing/consumer/${account.id}`, options),
      apiRequest(`/consumption/consumer/${account.id}`, options),
      apiRequest(`/notifications?consumerId=${encodeURIComponent(account.id)}`, options),
    ]);

  const profile = profilePayload.data;
  const billings = billingPayload.data ?? [];
  const readings = consumptionPayload.data ?? [];
  const pendingBills = billings
    .filter((record) => Number(record.remaining_balance ?? 0) > 0)
    .sort((left, right) => String(left.due_date).localeCompare(String(right.due_date)));
  const latestReading = readings.at(-1) ?? null;
  const previousReading = readings.at(-2) ?? null;
  const latestUsage = Number(latestReading?.consumption ?? 0);
  const previousUsage = previousReading == null
    ? null
    : Number(previousReading.consumption ?? 0);
  const announcements = normalizeConsumerAnnouncements(notificationPayload.data).slice(0, 5);

  return {
    account: {
      id: profile.id,
      name: composeProfileName(profile, profile.username),
      purok: profile.purok_no == null ? "Purok not assigned" : `Purok ${profile.purok_no}`,
      status: profile.status ?? "active",
    },
    announcements,
    billing: {
      outstandingBalance: pendingBills.reduce(
        (total, record) => total + Number(record.remaining_balance ?? 0),
        0,
      ),
      pendingCount: pendingBills.length,
      nextDueDate: pendingBills[0]?.due_date ?? null,
      nextBillingId: pendingBills[0]?.id ?? null,
    },
    reading: {
      currentReading: Number(latestReading?.present_reading ?? 0),
      latestDate: latestReading?.reading_date ?? null,
      latestUsage,
      previousUsage,
      recordedMonths: readings.length,
    },
  };
}

export async function fetchConsumerAnnouncements(options) {
  const account = await requireConsumerAccount();
  const payload = await apiRequest(
    `/notifications?consumerId=${encodeURIComponent(account.id)}`,
    options,
  );
  return normalizeConsumerAnnouncements(payload.data);
}

export async function fetchBillingLedger(options) {
  const account = await requireConsumerAccount();
  const [profilePayload, billingPayload, consumptionPayload, paymentPayload] = await Promise.all([
    apiRequest(`/consumers/${account.id}`, options),
    apiRequest(`/billing/consumer/${account.id}`, options),
    apiRequest(`/consumption/consumer/${account.id}`, options),
    apiRequest(`/payments/consumer/${account.id}`, options),
  ]);
  const profile = profilePayload.data;
  const readingsById = new Map(
    (consumptionPayload.data ?? []).map((reading) => [reading.id, reading])
  );
  const historyData = (billingPayload.data ?? []).map((record) =>
    normalizeBilling(record, profile, readingsById.get(record.consumption_id))
  );
  const outstandingBalance = historyData.reduce(
    (total, record) => total + record.remainingBalance,
    0,
  );
  const nextOutstandingBill = historyData
    .filter((record) => record.remainingBalance > 0)
    .sort((left, right) => String(left.dueDate).localeCompare(String(right.dueDate)))[0];
  const billsById = new Map(historyData.map((record) => [record.id, record]));
  const paymentRecords = [...(paymentPayload.data ?? [])].sort((left, right) => {
    const createdComparison = String(right.created_at ?? "").localeCompare(String(left.created_at ?? ""));
    return createdComparison || Number(right.id ?? 0) - Number(left.id ?? 0);
  });
  const payments = paymentRecords.map((record) => {
    const bill = billsById.get(record.billing_id);
    const remainingBalance = Number(record.remaining_balance ?? 0);
    const statusAfterPayment = remainingBalance === 0 ? "Paid" : "Partially Paid";
    return {
      id: record.id,
      billingId: record.billing_id,
      invoiceNumber: bill?.invoiceNumber ?? `INV-${record.billing_id}`,
      consumerName: composeProfileName(profile),
      paymentDate: record.payment_date,
      paymentMethod: record.payment_method ?? "Cash",
      referenceNumber: record.reference_number ?? "",
      amountPaid: Number(record.total_paid ?? 0),
      amountTendered: Number(record.amount_tendered ?? record.total_paid ?? 0),
      changeGiven: Number(record.change_given ?? 0),
      remainingBalance,
      balanceAfterPayment: remainingBalance,
      paymentStatus: statusAfterPayment,
      statusAfterPayment,
      currentBillStatus: bill?.status ?? statusAfterPayment,
      currentBillRemainingBalance: Number(bill?.remainingBalance ?? remainingBalance),
      createdAt: record.created_at,
    };
  });

  return {
    historyData,
    ledgerAccount: {
      accountId: `ACC-${profile.id}`,
      name: composeProfileName(profile),
      outstandingBalance,
      dueDate: formatDate(nextOutstandingBill?.dueDate),
    },
    officialReceipt: null,
    payments,
  };
}

export async function fetchCurrentBalance(options) {
  const account = await requireConsumerAccount();
  const payload = await apiRequest(`/billing/consumer/${account.id}`, options);
  return (payload.data ?? [])
    .filter((record) => isCurrentMonth(record.billing_date))
    .reduce(
    (total, record) => total + Number(record.remaining_balance ?? 0),
    0,
  );
}

export async function fetchNotifications(options) {
  const account = await requireConsumerAccount();
  const payload = await apiRequest(
    `/notifications?consumerId=${encodeURIComponent(account.id)}`,
    options,
  );

  return (payload.data ?? []).map((notification) => {
    const notificationType = String(
      notification.notification_type ?? "announcement",
    ).toLowerCase();
    const isBillingAlert =
      notificationType.startsWith("bill_") ||
      notificationType === "payment_received" ||
      ["billing alert", "payment alert"].includes(
        String(notification.announcement_type).toLowerCase(),
      );

    return {
      id: notification.id,
      category: isBillingAlert ? "bill" : "announcement",
      type: notificationType,
      priority: notification.priority ?? "normal",
      title: notification.title,
      message: notification.message,
      date: notification.announcement_date,
      createdAt: notification.created_at,
      isRead: Boolean(notification.is_read),
      actionPath: notificationActionPath(
        notification,
        notificationType,
        isBillingAlert,
      ),
      billingId: notification.billing_id,
      consumptionId: notification.consumption_id,
      paymentId: notification.payment_id,
    };
  });
}

export async function markNotificationRead(notificationId, options) {
  return apiRequest(`/notifications/${notificationId}/read`, {
    ...options,
    method: "PUT",
  });
}

export async function markAllNotificationsRead(options) {
  return apiRequest("/notifications/read-all", {
    ...options,
    method: "PUT",
  });
}

export async function deleteNotifications(notificationIds, options) {
  return apiRequest("/notifications/delete", {
    ...options,
    method: "POST",
    body: { notificationIds },
  });
}
