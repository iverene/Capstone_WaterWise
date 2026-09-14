import { useCallback, useEffect, useState } from "react";
import { Database } from "lucide-react";
import { fetchOverallConsumptionHistory } from "../services/consumptionAPI";
import AnalyticsMetricCard from "./AnalyticsMetricCard";

export default function AdminOverallConsumptionCard({ compact = false }) {
  const [consumption, setConsumption] = useState(null);
  const [recordCount, setRecordCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOverallConsumption = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetchOverallConsumptionHistory();
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
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ??
          requestError?.message ??
          "Unable to load historical consumption.",
      );
      setConsumption(null);
      setRecordCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(loadOverallConsumption);
  }, [loadOverallConsumption]);

  return (
    <AnalyticsMetricCard
      compact={compact}
      description={
        recordCount > 0
          ? `Baseline calculated from ${recordCount} historical ${recordCount === 1 ? "record" : "records"}`
          : "Recorded consumption used as the forecasting baseline"
      }
      error={error}
      icon={Database}
      label="Historical Baseline"
      loading={loading}
      onRefresh={loadOverallConsumption}
      testId="overall-consumption-card"
      value={Number(consumption ?? 0).toLocaleString("en-PH", {
        maximumFractionDigits: 2,
      })}
    />
  );
}
