import { ai, GEMINI_MODELS, isGeminiConfigured } from "../config/gemini.js";
import {
  getAllPuroksMonthlyHistory,
  getAllPuroksYearlyHistory,
  getOverallMonthlyHistory,
  getOverallYearlyHistory,
  getPerPurokMonthlyHistory,
  getPerPurokYearlyHistory,
} from "./consumptionServices.js";
import {
  getConsumptionSourceVersion,
  getLatestStoredPrediction,
  getStoredPrediction,
  storePrediction,
} from "../models/predictionModels.js";

const pendingPredictions = new Map();

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const parseGeminiJson = (responseText) => {
  if (typeof responseText !== "string") {
    throw new Error("Gemini returned an invalid response.");
  }

  const cleanedText = responseText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleanedText);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${cleanedText}`);
  }
};

const generatePrediction = async (prompt) => {
  if (!isGeminiConfigured()) {
    throw new Error("Gemini API is not configured.");
  }

  let lastError;

  for (const model of GEMINI_MODELS) {
    try {
      const response = await ai.models.generateContent({ model, contents: prompt });
      const responseText =
        typeof response.text === "function" ? response.text() : response.text;

      return parseGeminiJson(responseText);
    } catch (error) {
      console.warn(`Gemini model ${model} failed:`, error.message);
      lastError = error;
    }
  }

  throw lastError ?? new Error("All Gemini models failed.");
};

const singlePredictionPrompt = ({ historical, period, purok }) => `
You are a water demand forecasting AI.

${purok ? `Purok: ${purok}` : "Scope: Overall water consumption"}
Historical ${period} water consumption:
${JSON.stringify(historical)}

Predict only the next ${period === "monthly" ? "month's" : "year's"} water consumption.
Return only valid JSON without Markdown or explanations.
Use this exact format:
{
  ${purok ? `"purok": "${purok}",` : ""}
  "predictedConsumption": 0
}
`;

const allPuroksPrompt = ({ historical, period }) => `
You are a water demand forecasting AI.

Historical ${period} water consumption of every purok:
${JSON.stringify(historical)}

Predict the next ${period === "monthly" ? "month's" : "year's"} consumption for every supplied purok.
Keep purok names unchanged and return one non-negative prediction per purok.
Return only a valid JSON array without Markdown or explanations:
[{"purok":"Purok 1","predictedConsumption":0}]
`;

const normalizePrediction = (result, purok) => ({
  ...(purok ? { purok } : {}),
  predictedConsumption: Math.max(0, toNumber(result.predictedConsumption)),
});

const generateSinglePrediction = async ({ historical, period, purok }) => {
  if (historical.length === 0) return normalizePrediction({}, purok);

  const result = await generatePrediction(
    singlePredictionPrompt({ historical, period, purok })
  );

  return normalizePrediction(result, purok);
};

const generatePurokListPrediction = async ({ historical, period }) => {
  if (historical.length === 0) return [];

  const result = await generatePrediction(allPuroksPrompt({ historical, period }));
  if (!Array.isArray(result)) {
    throw new Error(`Gemini ${period} purok prediction must return an array.`);
  }

  const resultMap = new Map(result.map((item) => [item.purok, item]));

  return historical.map(({ purok }) =>
    normalizePrediction(resultMap.get(purok) ?? {}, purok)
  );
};

const getOrGeneratePrediction = async (
  { cacheKey, scope, period, purok = null },
  generator,
) => {
  const sourceVersion = await getConsumptionSourceVersion({ includeEvents: false });
  const storedPrediction = await getStoredPrediction(
    cacheKey,
    sourceVersion.signature,
  );

  if (storedPrediction !== null) return storedPrediction;

  const pendingKey = `${cacheKey}:${sourceVersion.signature}`;
  if (pendingPredictions.has(pendingKey)) {
    return pendingPredictions.get(pendingKey);
  }

  const predictionTask = (async () => {
    const prediction = await generator();
    return storePrediction({
      cacheKey,
      scope,
      period,
      purok,
      prediction,
      sourceVersion,
    });
  })();

  pendingPredictions.set(pendingKey, predictionTask);

  try {
    return await predictionTask;
  } finally {
    pendingPredictions.delete(pendingKey);
  }
};

export const generateOverallMonthlyPrediction = async () =>
  getOrGeneratePrediction(
    {
      cacheKey: "overall:monthly",
      scope: "overall",
      period: "monthly",
    },
    async () =>
      generateSinglePrediction({
        historical: await getOverallMonthlyHistory(),
        period: "monthly",
      }),
  );

export const generateOverallYearlyPrediction = async () =>
  getOrGeneratePrediction(
    {
      cacheKey: "overall:yearly",
      scope: "overall",
      period: "yearly",
    },
    async () =>
      generateSinglePrediction({
        historical: await getOverallYearlyHistory(),
        period: "yearly",
      }),
  );

export const generatePerPurokMonthlyPrediction = async (purok) =>
  getOrGeneratePrediction(
    {
      cacheKey: `purok:monthly:${purok}`,
      scope: "purok",
      period: "monthly",
      purok,
    },
    async () =>
      generateSinglePrediction({
        historical: await getPerPurokMonthlyHistory(purok),
        period: "monthly",
        purok,
      }),
  );

export const generatePerPurokYearlyPrediction = async (purok) =>
  getOrGeneratePrediction(
    {
      cacheKey: `purok:yearly:${purok}`,
      scope: "purok",
      period: "yearly",
      purok,
    },
    async () =>
      generateSinglePrediction({
        historical: await getPerPurokYearlyHistory(purok),
        period: "yearly",
        purok,
      }),
  );

export const generateAllPuroksMonthlyPrediction = async () =>
  getOrGeneratePrediction(
    {
      cacheKey: "all-puroks:monthly",
      scope: "all-puroks",
      period: "monthly",
    },
    async () =>
      generatePurokListPrediction({
        historical: await getAllPuroksMonthlyHistory(),
        period: "monthly",
      }),
  );

export const generateAllPuroksYearlyPrediction = async () =>
  getOrGeneratePrediction(
    {
      cacheKey: "all-puroks:yearly",
      scope: "all-puroks",
      period: "yearly",
    },
    async () =>
      generatePurokListPrediction({
        historical: await getAllPuroksYearlyHistory(),
        period: "yearly",
      }),
  );

export const generateAllPredictionsService = async () => {
  // Keep scheduled Gemini work sequential to stay friendly to free-tier rate
  // limits. Each generator still skips Gemini when its source signature is
  // already cached.
  const overallMonthly = await generateOverallMonthlyPrediction();
  const overallYearly = await generateOverallYearlyPrediction();
  const allPuroksMonthly = await generateAllPuroksMonthlyPrediction();
  const allPuroksYearly = await generateAllPuroksYearlyPrediction();

  return { overallMonthly, overallYearly, allPuroksMonthly, allPuroksYearly };
};

export const readOverallMonthlyPrediction = () =>
  getLatestStoredPrediction("overall:monthly");

export const readOverallYearlyPrediction = () =>
  getLatestStoredPrediction("overall:yearly");

export const readPerPurokMonthlyPrediction = (purok) =>
  getLatestStoredPrediction(`purok:monthly:${purok}`);

export const readPerPurokYearlyPrediction = (purok) =>
  getLatestStoredPrediction(`purok:yearly:${purok}`);

export const readAllPuroksMonthlyPrediction = () =>
  getLatestStoredPrediction("all-puroks:monthly");

export const readAllPuroksYearlyPrediction = () =>
  getLatestStoredPrediction("all-puroks:yearly");
