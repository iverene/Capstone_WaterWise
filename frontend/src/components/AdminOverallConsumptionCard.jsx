import { useCallback, useEffect, useState } from "react";
import { Database } from "lucide-react";
import { fetchMonthlyHistory, fetchOverallConsumptionHistory } from "../services/consumptionAPI";
import AnalyticsMetricCard from "./AnalyticsMetricCard";

const extractMonthlyCount = (monthlyResponse) => {
  const monthlyData = monthlyResponse?.data?.data ?? monthlyResponse?.data ?? monthlyResponse;
  const monthlyList = Array.isArray(monthlyData)
    ? monthlyData
    : (monthlyData?.monthlyHistory ?? monthlyData?.history ?? []);
  return Array.isArray(monthlyList) ? monthlyList.length : null;
};

export default function AdminOverallConsumptionCard({ animateValue = false, compact = false }) {
  const [consumption, setConsumption] = useState(null);
  const [recordCount, setRecordCount] = useState(0);
  const [monthlyCount, setMonthlyCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOverallConsumption = useCallback(async ({ showLoading = true } = {}) => {
    try {
      if (showLoading) setLoading(true);
      setError("");
      const [overallResponse, monthlyResponse] = await Promise.all([
        fetchOverallConsumptionHistory(),
        fetchMonthlyHistory().catch(() => null),
      ]);
      const response = overallResponse;
      const responseData = response?.data?.data ?? response?.data ?? response;
      const directTotal =
        responseData?.overallConsumption ??
        responseData?.overall_consumption ??
        responseData?.totalConsumption ??
        responseData?.total_consumption ??
        responseData?.total ??
        responseData?.consumption ??
        responseData?.value;
      const directCount =
        responseData?.recordCount ?? responseData?.record_count ?? responseData?.count ?? 0;

      if (directTotal !== undefined && directTotal !== null) {
        const numericTotal = Number(directTotal);
        setConsumption(Number.isFinite(numericTotal) ? numericTotal : 0);
        setRecordCount(Number(directCount) || 0);
        setMonthlyCount(extractMonthlyCount(monthlyResponse));
        return;
      }

      const records = Array.isArray(responseData)
        ? responseData
        : (responseData?.history ??
          responseData?.records ??
          responseData?.readings ??
          responseData?.consumptions ??
          responseData?.monthlyHistory ??
          responseData?.monthly_history ??
          []);

      if (!Array.isArray(records)) {
        setConsumption(0);
        setRecordCount(0);
        setMonthlyCount(0);
        return;
      }

      const total = records.reduce((sum, item) => {
        const rawValue =
          item?.consumption ??
          item?.totalConsumption ??
          item?.total_consumption ??
          item?.consumptionValue ??
          item?.consumption_value ??
          item?.usage ??
          item?.volume ??
          item?.amount ??
          item?.value ??
          0;
        const numericValue = Number(rawValue);
        return sum + (Number.isFinite(numericValue) ? numericValue : 0);
      }, 0);

      setConsumption(total);
      setRecordCount(records.length);
      setMonthlyCount(extractMonthlyCount(monthlyResponse) ?? records.length);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ??
          requestError?.message ??
          "Unable to load historical consumption.",
      );
      setConsumption(null);
      setRecordCount(0);
      setMonthlyCount(0);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(loadOverallConsumption);
    const handleTargetedRefresh = (event) => {
      if (event.detail?.path === "/admin/analytics") {
        void loadOverallConsumption({ showLoading: false });
      }
    };
    window.addEventListener("waterwise:targeted-refresh", handleTargetedRefresh);
    return () => window.removeEventListener("waterwise:targeted-refresh", handleTargetedRefresh);
  }, [loadOverallConsumption]);

  const description = (() => {
    if (monthlyCount === null) {
      return recordCount > 0
        ? <>Baseline calculated from {recordCount} historical {recordCount === 1 ? "record" : "records"}</>
        : "No History Yet";
    }
    if (monthlyCount === 0) return "No History Yet";
    const baselineRecords = Math.floor(monthlyCount / 6);
    if (baselineRecords < 1) {
      return <>1 historical baseline is not enough — {monthlyCount} month{monthlyCount === 1 ? "" : "s"} with record{monthlyCount === 1 ? "" : "s"}</>;
    }
    return <>Baseline calculated from {baselineRecords} historical {baselineRecords === 1 ? "record" : "records"}</>;
  })();

  return (
    <AnalyticsMetricCard
      animateValue={animateValue}
      compact={compact}
      description={description}
      error={error}
      icon={Database}
      label="Historical Baseline"
      loading={loading}
      onRefresh={loadOverallConsumption}
      showRefreshButton={false}
      testId="overall-consumption-card"
      value={Number(consumption ?? 0).toLocaleString("en-PH", {
        maximumFractionDigits: 2,
      })}
    />
  );
}
