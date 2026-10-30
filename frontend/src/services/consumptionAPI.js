import apiClient from "./apiClient";

const consumptionAPI = {
  get: (path, options) => apiClient.get(`/consumption${path}`, options),
};

//Get Consumption Ranking
export const fetchConsumptionRanking = async () => {
  const response = await consumptionAPI.get("/ranking");
  return response.data;
};

//History API

//Get Monthly Consumption History (optionally filtered by year, e.g. 2026)
export const fetchMonthlyHistory = async (year) => {
  const response = await consumptionAPI.get("/history/monthly", {
    params: year ? { year } : undefined,
  });
  return response.data;
};

//Get Yearly Consumption History
export const fetchYearlyHistory = async () => {
  const response = await consumptionAPI.get("/history/yearly");
  return response.data;
};

//Get Purok Monthly History (optionally filtered by year)
export const fetchPurokMonthlyHistory = async (purok, year) => {
  const response = await consumptionAPI.get(
    `/history/monthly/purok/${purok}`,
    { params: year ? { year } : undefined },
  );

  return response.data;
};

//Get Purok Yearly History
export const fetchPurokYearlyHistory = async (purok) => {
  const response = await consumptionAPI.get(
    `/history/yearly/purok/${purok}`
  );

  return response.data;
};

//Get All Puroks Monthly History (optionally filtered by year)
export const fetchAllPuroksMonthlyHistory = async (year) => {
  const response = await consumptionAPI.get(
    "/history/monthly/all-puroks",
    { params: year ? { year } : undefined },
  );

  return response.data;
};

//Get All Puroks Yearly History
export const fetchAllPuroksYearlyHistory = async () => {
  const response = await consumptionAPI.get(
    "/history/yearly/all-puroks"
  );

  return response.data;
};

//Generate All History Consumption (optionally filtered by year)
export const generateAllHistoryConsumption = async (year) => {
  const response = await consumptionAPI.get(
    "/history/overall",
    { params: year ? { year } : undefined },
  );

  return response.data;
};

export const fetchOverallConsumptionHistory =
  async (year) => {
    const response = await consumptionAPI.get(
      "/history/overall",
      { params: year ? { year } : undefined },
    );

    return response.data;
  };

//Forecast API

//Get Overall Monthly Forecast
export const fetchOverallMonthlyPrediction = async () => {
  const response = await consumptionAPI.get(
    "/prediction/monthly/overall"
  );

  return response.data;
};

//Get Overall Yearly Forecast
export const fetchOverallYearlyPrediction = async () => {
  const response = await consumptionAPI.get(
    "/prediction/yearly/overall"
  );

  return response.data;
};

//Get Per Purok Monthly Forecast
export const fetchPerPurokMonthlyPrediction = async (purok) => {
  const response = await consumptionAPI.get(
    `/prediction/monthly/purok/${purok}`
  );

  return response.data;
};

//Get Per Purok Yearly Forecast
export const fetchPerPurokYearlyPrediction = async (purok) => {
  const response = await consumptionAPI.get(
    `/prediction/yearly/purok/${purok}`
  );

  return response.data;
};

//Get All Puroks Monthly Forecast
export const fetchAllPuroksMonthlyPrediction = async () => {
  const response = await consumptionAPI.get(
    "/prediction/monthly/all-puroks"
  );

  return response.data;
};

//Get All Puroks Yearly Forecast
export const fetchAllPuroksYearlyPrediction = async () => {
  const response = await consumptionAPI.get(
    "/prediction/yearly/all-puroks"
  );

  return response.data;
};

export default consumptionAPI;
