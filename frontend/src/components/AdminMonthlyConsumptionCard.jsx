import { useCallback, useEffect, useState } from "react";
import { Droplets } from "lucide-react";
import { fetchOverallMonthlyPrediction } from "../services/consumptionAPI";
import AnalyticsMetricCard from "./AnalyticsMetricCard";

export default function AdminMonthlyConsumptionCard() {
  const [prediction, setPrediction] = useState(null);
  const [predictionPeriod, setPredictionPeriod] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPrediction = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetchOverallMonthlyPrediction();
      const data = response?.data ?? response;
      const predictedValue =
        data?.prediction ??
        data?.predictedConsumption ??
        data?.predicted_consumption ??
        data?.forecast ??
        data?.value ??
        0;
      const period =
        data?.predictionMonth ?? data?.prediction_month ?? data?.month ?? data?.period ?? "";
      const numericValue = Number(predictedValue);
      setPrediction(Number.isFinite(numericValue) ? numericValue : 0);
      setPredictionPeriod(period);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ??
          requestError?.message ??
          "Unable to load the monthly forecast.",
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
      description={predictionPeriod ? `Forecast for ${predictionPeriod}` : "Expected demand for the next month"}
      error={error}
      icon={Droplets}
      label="Next-Month Forecast"
      loading={loading}
      onRefresh={loadPrediction}
      testId="monthly-consumption-card"
      value={Number(prediction ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}
    />
  );
}
