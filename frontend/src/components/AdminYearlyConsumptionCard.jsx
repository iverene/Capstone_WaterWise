import { useCallback, useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { fetchOverallYearlyPrediction } from "../services/consumptionAPI";
import AnalyticsMetricCard from "./AnalyticsMetricCard";

export default function AdminYearlyConsumptionCard({ compact = false }) {
  const [prediction, setPrediction] = useState(null);
  const [predictionPeriod, setPredictionPeriod] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPrediction = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetchOverallYearlyPrediction();
      const data = response?.data ?? response;
      const predictedValue =
        data?.prediction ??
        data?.predictedConsumption ??
        data?.predicted_consumption ??
        data?.forecast ??
        data?.value ??
        0;
      const period =
        data?.predictionYear ?? data?.prediction_year ?? data?.year ?? data?.period ?? "";
      const numericValue = Number(predictedValue);
      setPrediction(Number.isFinite(numericValue) ? numericValue : 0);
      setPredictionPeriod(period);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ??
          requestError?.message ??
          "Unable to load the yearly forecast.",
      );
      setPrediction(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(loadPrediction);
  }, [loadPrediction]);

  return (
    <AnalyticsMetricCard
      compact={compact}
      description={predictionPeriod ? `Forecast for ${predictionPeriod}` : "Expected demand for the next year"}
      error={error}
      icon={CalendarDays}
      label="Next-Year Forecast"
      loading={loading}
      onRefresh={loadPrediction}
      testId="yearly-consumption-card"
      value={Number(prediction ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}
    />
  );
}
