import {
  ai,
  GEMINI_MODELS,
  isGeminiConfigured,
} from "../config/gemini.js";

import {
  getOverallMonthlyHistory,
  getOverallYearlyHistory,
  getPerPurokMonthlyHistory,
  getPerPurokYearlyHistory,
  getAllPuroksMonthlyHistory,
  getAllPuroksYearlyHistory,
} from "./consumptionServices.js";
import { getPurokPredictionData } from "../models/consumptionModels.js";
import { getRecommendationEventContext } from "../models/eventModels.js";
import { getConsumptionSourceVersion } from "../models/predictionModels.js";
import {
  getStoredRecommendation,
  storeRecommendation,
} from "../models/recommendationModels.js";

const pendingRecommendationRequests = new Map();

// ==========================================
// HELPERS
// ==========================================

const cleanGeminiResponse = (
  responseText
) => {
  if (
    typeof responseText !==
    "string"
  ) {
    throw new Error(
      "Gemini returned an invalid response."
    );
  }

  return responseText
    .trim()
    .replace(
      /^```(?:json)?\s*/i,
      ""
    )
    .replace(
      /\s*```$/,
      ""
    )
    .trim();
};

const parseGeminiResponse = (
  responseText
) => {
  const cleanedResponse =
    cleanGeminiResponse(
      responseText
    );

  try {
    return JSON.parse(
      cleanedResponse
    );
  } catch {
    throw new Error(
      `Gemini returned invalid JSON: ${cleanedResponse}`
    );
  }
};

const hasHistoricalData = (
  historical
) => {
  return (
    Array.isArray(historical) &&
    historical.length > 0
  );
};

const toParagraph = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const formatEventContext = (events) => {
  if (!Array.isArray(events) || events.length === 0) {
    return "No community events were recorded in this period.";
  }
  return JSON.stringify(events);
};

const resolveOverallMonthlyTargetYear = async () => {
  try {
    const records = await getPurokPredictionData();
    const years = records.map((record) => Number(record.year)).filter(Number.isFinite);
    return years.length > 0 ? Math.max(...years) : null;
  } catch {
    return null;
  }
};

const createEmptyRecommendation =
  (purok = undefined) => {
    const result = {
      summary:
        "No sufficient historical consumption data is available to generate recommendations.",
      recommendations: [],
    };

    if (purok) {
      result.purok = purok;
    }

    return result;
  };

const normalizeRecommendation =
  (recommendation) => {
    return {
      title: toParagraph(
        recommendation?.title ??
          ""
      ),

      description: toParagraph(
        recommendation
          ?.description ?? ""
      ),
    };
  };

const normalizeRecommendationResult =
  (
    result,
    purok = undefined
  ) => {
    const recommendations =
      Array.isArray(
        result?.recommendations
      )
        ? result.recommendations
            .slice(0, 1)
            .map(
              normalizeRecommendation
            )
            .filter(
              (item) =>
                item.title ||
                item.description
            )
        : [];

    const normalizedResult = {
      summary: toParagraph(
        result?.summary ??
          "No recommendation summary was provided."
      ),

      recommendations,
    };

    if (purok) {
      normalizedResult.purok =
        purok;
    }

    return normalizedResult;
  };

// ==========================================
// GEMINI HELPER
// ==========================================

const generateRecommendations =
  async (prompt) => {
    if (
      !isGeminiConfigured()
    ) {
      throw new Error(
        "Gemini API key is not configured."
      );
    }

    let lastError = null;

    for (
      const model of
      GEMINI_MODELS
    ) {
      try {
        console.log(
          `Trying Gemini model: ${model}`
        );

        const response =
          await ai.models
            .generateContent({
              model,
              contents: prompt,
            });

        const responseText =
          typeof response.text ===
          "function"
            ? response.text()
            : response.text;

        const parsedResponse =
          parseGeminiResponse(
            responseText
          );

        console.log(
          `Recommendation generation succeeded using: ${model}`
        );

        return parsedResponse;
      } catch (error) {
        console.warn(
          `Gemini model ${model} failed: ${error.message}`
        );

        lastError = error;
      }
    }

    throw (
      lastError ??
      new Error(
        "All Gemini models failed."
      )
    );
  };

// ==========================================
// OVERALL MONTHLY
// ==========================================

const generateOverallMonthlyRecommendationsUncached =
  async () => {
    const historical =
      await getOverallMonthlyHistory();

    if (
      !hasHistoricalData(
        historical
      )
    ) {
      return createEmptyRecommendation();
    }

    const targetYear = await resolveOverallMonthlyTargetYear();
    const events = await getRecommendationEventContext(
      targetYear ? { years: [targetYear] } : { limit: 50 },
    );

    const prompt = `
You are an AI decision support assistant for a water utility administrator.

Historical monthly water consumption${targetYear ? ` for ${targetYear}` : ""}:

${JSON.stringify(historical)}

Community events recorded in the same period (check the event date before linking it to a month):

${formatEventContext(events)}

Generate only practical and actionable administrative recommendations based on the observed consumption trend.

Rules:
- Base every recommendation primarily on the supplied historical consumption data.
- Before finalizing the recommendation, check whether any listed community event falls in or near a month with a noticeable increase or decrease.
- You may mention a relevant event as possible context (for example, "coincided with <event title> on <date>") but do not assert that the event caused the change.
- If no event aligns with the trend, ignore the events section.
- Do not assume the exact cause of an increase or decrease.
- Do not speculate about leaks, illegal connections, damaged pipes, faulty meters, weather conditions, or population growth unless directly supported by the data.
- If consumption remains stable, recommend routine monitoring and continued observation.
- If consumption shows a noticeable increase or decrease, recommend appropriate administrative actions without assuming a cause.
- Generate exactly one concise recommendation paragraph.
- Keep every recommendation concise, practical, and actionable.
- Return only valid JSON.
- Do not use Markdown code fences.
- Do not include text outside the JSON.

Expected format:

{
  "summary": "",
  "recommendations": [
    {
      "title": "",
      "description": ""
    }
  ]
}
`;

    const result =
      await generateRecommendations(
        prompt
      );

    return normalizeRecommendationResult(
      result
    );
  };

// ==========================================
// OVERALL YEARLY
// ==========================================

const generateOverallYearlyRecommendationsUncached =
  async () => {
    const historical =
      await getOverallYearlyHistory();

    if (
      !hasHistoricalData(
        historical
      )
    ) {
      return createEmptyRecommendation();
    }

    const historicalYears = historical
      .map((item) => Number(item.year))
      .filter(Number.isFinite);
    const events = await getRecommendationEventContext(
      historicalYears.length > 0 ? { years: historicalYears } : { limit: 50 },
    );

    const prompt = `
You are an AI decision support assistant for a water utility administrator.

Historical yearly water consumption:

${JSON.stringify(historical)}

Community events recorded in the same years (check the event date before linking it to a year):

${formatEventContext(events)}

Generate only practical and actionable administrative recommendations based on the observed consumption trend.

Rules:
- Base every recommendation primarily on the supplied historical consumption data.
- Before finalizing the recommendation, check whether any listed community event falls in or near a year with a noticeable increase or decrease.
- You may mention a relevant event as possible context (for example, "coincided with <event title> on <date>") but do not assert that the event caused the change.
- If no event aligns with the trend, ignore the events section.
- Do not assume the exact cause of an increase or decrease.
- Do not speculate about leaks, illegal connections, damaged pipes, faulty meters, weather conditions, or population growth unless directly supported by the data.
- If consumption remains stable, recommend routine monitoring and continued observation.
- If consumption shows a noticeable increase or decrease, recommend appropriate administrative actions without assuming a cause.
- Generate exactly one concise recommendation paragraph.
- Keep every recommendation concise, practical, and actionable.
- Return only valid JSON.
- Do not use Markdown code fences.
- Do not include text outside the JSON.

Expected format:

{
  "summary": "",
  "recommendations": [
    {
      "title": "",
      "description": ""
    }
  ]
}
`;

    const result =
      await generateRecommendations(
        prompt
      );

    return normalizeRecommendationResult(
      result
    );
  };

// ==========================================
// PER-PUROK MONTHLY
// ==========================================

const generatePerPurokMonthlyRecommendationsUncached =
  async (purok) => {
    if (!purok?.trim()) {
      throw new Error(
        "Purok is required."
      );
    }

    const normalizedPurok =
      purok.trim();

    const historical =
      await getPerPurokMonthlyHistory(
        normalizedPurok
      );

    if (
      !hasHistoricalData(
        historical
      )
    ) {
      return createEmptyRecommendation(
        normalizedPurok
      );
    }

    const prompt = `
You are an AI decision support assistant for a water utility administrator.

Purok:
${normalizedPurok}

Historical monthly water consumption:

${JSON.stringify(historical)}

Generate only practical and actionable administrative recommendations for this purok based on the observed consumption trend.

Rules:
- Base every recommendation only on the supplied historical data.
- Preserve the supplied purok name exactly.
- Do not assume the exact cause of an increase or decrease.
- Do not speculate about leaks, illegal connections, damaged pipes, faulty meters, weather conditions, or population growth unless directly supported by the data.
- If consumption remains stable, recommend routine monitoring and continued observation.
- If consumption shows a noticeable increase or decrease, recommend appropriate administrative actions without assuming a cause.
- Generate exactly one concise recommendation paragraph.
- Keep every recommendation concise, practical, and actionable.
- Return only valid JSON.
- Do not use Markdown code fences.
- Do not include text outside the JSON.

Expected format:

{
  "purok": "${normalizedPurok}",
  "summary": "",
  "recommendations": [
    {
      "title": "",
      "description": ""
    }
  ]
}
`;

    const result =
      await generateRecommendations(
        prompt
      );

    return normalizeRecommendationResult(
      result,
      normalizedPurok
    );
  };

// ==========================================
// PER-PUROK YEARLY
// ==========================================

const generatePerPurokYearlyRecommendationsUncached =
  async (purok) => {
    if (!purok?.trim()) {
      throw new Error(
        "Purok is required."
      );
    }

    const normalizedPurok =
      purok.trim();

    const historical =
      await getPerPurokYearlyHistory(
        normalizedPurok
      );

    if (
      !hasHistoricalData(
        historical
      )
    ) {
      return createEmptyRecommendation(
        normalizedPurok
      );
    }

    const prompt = `
You are an AI decision support assistant for a water utility administrator.

Purok:
${normalizedPurok}

Historical yearly water consumption:

${JSON.stringify(historical)}

Generate only practical and actionable administrative recommendations for this purok based on the observed consumption trend.

Rules:
- Base every recommendation only on the supplied historical data.
- Preserve the supplied purok name exactly.
- Do not assume the exact cause of an increase or decrease.
- Do not speculate about leaks, illegal connections, damaged pipes, faulty meters, weather conditions, or population growth unless directly supported by the data.
- If consumption remains stable, recommend routine monitoring and continued observation.
- If consumption shows a noticeable increase or decrease, recommend appropriate administrative actions without assuming a cause.
- Generate exactly one concise recommendation paragraph.
- Keep every recommendation concise, practical, and actionable.
- Return only valid JSON.
- Do not use Markdown code fences.
- Do not include text outside the JSON.

Expected format:

{
  "purok": "${normalizedPurok}",
  "summary": "",
  "recommendations": [
    {
      "title": "",
      "description": ""
    }
  ]
}
`;

    const result =
      await generateRecommendations(
        prompt
      );

    return normalizeRecommendationResult(
      result,
      normalizedPurok
    );
  };

// ==========================================
// ALL-PUROKS MONTHLY
// ==========================================

const generateAllPuroksMonthlyRecommendationsUncached =
  async () => {
    const historical =
      await getAllPuroksMonthlyHistory();

    if (
      !hasHistoricalData(
        historical
      )
    ) {
      return [];
    }

    const puroks =
      historical
        .map(
          (item) => item.purok
        )
        .filter(Boolean);

    const prompt = `
You are an AI decision support assistant for a water utility administrator.

Historical monthly water consumption for every purok:

${JSON.stringify(historical)}

Generate only practical and actionable administrative recommendations for every purok based on the observed consumption trends.

Rules:
- Base every recommendation only on the supplied historical data.
- Return exactly one result for every supplied purok.
- Preserve every purok name exactly.
- Do not assume the exact cause of an increase or decrease.
- Do not speculate about leaks, illegal connections, damaged pipes, faulty meters, weather conditions, or population growth unless directly supported by the data.
- If a purok has stable consumption, recommend routine monitoring and continued observation.
- If a purok shows a noticeable increase or decrease, recommend appropriate administrative actions without assuming a cause.
- Generate exactly one concise recommendation paragraph for each purok.
- Keep every recommendation concise, practical, and actionable.
- Return only a valid JSON array.
- Do not use Markdown code fences.
- Do not include text outside the JSON.

Expected format:

[
  {
    "purok": "Purok 1",
    "summary": "",
    "recommendations": [
      {
        "title": "",
        "description": ""
      }
    ]
  }
]
`;

    const result =
      await generateRecommendations(
        prompt
      );

    if (!Array.isArray(result)) {
      throw new Error(
        "Gemini monthly recommendations must return an array."
      );
    }

    const resultMap =
      new Map(
        result.map((item) => [
          item.purok,
          item,
        ])
      );

    return puroks.map(
      (purok) => {
        const recommendation =
          resultMap.get(purok);

        if (!recommendation) {
          return createEmptyRecommendation(
            purok
          );
        }

        return normalizeRecommendationResult(
          recommendation,
          purok
        );
      }
    );
  };

// ==========================================
// ALL-PUROKS YEARLY
// ==========================================

const generateAllPuroksYearlyRecommendationsUncached =
  async () => {
    const historical =
      await getAllPuroksYearlyHistory();

    if (
      !hasHistoricalData(
        historical
      )
    ) {
      return [];
    }

    const puroks =
      historical
        .map(
          (item) => item.purok
        )
        .filter(Boolean);

    const prompt = `
You are an AI decision support assistant for a water utility administrator.

Historical yearly water consumption for every purok:

${JSON.stringify(historical)}

Generate only practical and actionable administrative recommendations for every purok based on the observed consumption trends.

Rules:
- Base every recommendation only on the supplied historical data.
- Return exactly one result for every supplied purok.
- Preserve every purok name exactly.
- Do not assume the exact cause of an increase or decrease.
- Do not speculate about leaks, illegal connections, damaged pipes, faulty meters, weather conditions, or population growth unless directly supported by the data.
- If a purok has stable consumption, recommend routine monitoring and continued observation.
- If a purok shows a noticeable increase or decrease, recommend appropriate administrative actions without assuming a cause.
- Generate exactly one concise recommendation paragraph for each purok.
- Keep every recommendation concise, practical, and actionable.
- Return only a valid JSON array.
- Do not use Markdown code fences.
- Do not include text outside the JSON.

Expected format:

[
  {
    "purok": "Purok 1",
    "summary": "",
    "recommendations": [
      {
        "title": "",
        "description": ""
      }
    ]
  }
]
`;

    const result =
      await generateRecommendations(
        prompt
      );

    if (!Array.isArray(result)) {
      throw new Error(
        "Gemini yearly recommendations must return an array."
      );
    }

    const resultMap =
      new Map(
        result.map((item) => [
          item.purok,
          item,
        ])
      );

    return puroks.map(
      (purok) => {
        const recommendation =
          resultMap.get(purok);

        if (!recommendation) {
          return createEmptyRecommendation(
            purok
          );
        }

        return normalizeRecommendationResult(
          recommendation,
          purok
        );
      }
    );
  };

const getOrGenerateRecommendations = async (
  { cacheKey, period, purok = null, scope },
  generator,
) => {
  const sourceVersion = await getConsumptionSourceVersion();
  const storedRecommendation = await getStoredRecommendation(
    cacheKey,
    sourceVersion.signature,
  );

  if (storedRecommendation !== null) {
    return Array.isArray(storedRecommendation)
      ? storedRecommendation.map((item) =>
          normalizeRecommendationResult(item, item?.purok)
        )
      : normalizeRecommendationResult(
          storedRecommendation,
          storedRecommendation?.purok,
        );
  }

  const pendingKey = `${cacheKey}:${sourceVersion.signature}`;
  if (pendingRecommendationRequests.has(pendingKey)) {
    return pendingRecommendationRequests.get(pendingKey);
  }

  const recommendationTask = (async () => {
    const recommendation = await generator();
    return storeRecommendation({
      cacheKey,
      period,
      purok,
      recommendation,
      scope,
      sourceVersion,
    });
  })();

  pendingRecommendationRequests.set(
    pendingKey,
    recommendationTask,
  );

  try {
    return await recommendationTask;
  } finally {
    pendingRecommendationRequests.delete(
      pendingKey,
    );
  }
};

export const generateOverallMonthlyRecommendations = async () =>
  getOrGenerateRecommendations(
    {
      cacheKey: "overall:monthly",
      period: "monthly",
      scope: "overall",
    },
    generateOverallMonthlyRecommendationsUncached,
  );

export const generateOverallYearlyRecommendations = async () =>
  getOrGenerateRecommendations(
    {
      cacheKey: "overall:yearly",
      period: "yearly",
      scope: "overall",
    },
    generateOverallYearlyRecommendationsUncached,
  );

export const generatePerPurokMonthlyRecommendations = async (purok) =>
  getOrGenerateRecommendations(
    {
      cacheKey: `purok:monthly:${encodeURIComponent(purok)}`,
      period: "monthly",
      purok,
      scope: "purok",
    },
    () => generatePerPurokMonthlyRecommendationsUncached(purok),
  );

export const generatePerPurokYearlyRecommendations = async (purok) =>
  getOrGenerateRecommendations(
    {
      cacheKey: `purok:yearly:${encodeURIComponent(purok)}`,
      period: "yearly",
      purok,
      scope: "purok",
    },
    () => generatePerPurokYearlyRecommendationsUncached(purok),
  );

export const generateAllPuroksMonthlyRecommendations = async () =>
  getOrGenerateRecommendations(
    {
      cacheKey: "all-puroks:monthly",
      period: "monthly",
      scope: "all-puroks",
    },
    generateAllPuroksMonthlyRecommendationsUncached,
  );

export const generateAllPuroksYearlyRecommendations = async () =>
  getOrGenerateRecommendations(
    {
      cacheKey: "all-puroks:yearly",
      period: "yearly",
      scope: "all-puroks",
    },
    generateAllPuroksYearlyRecommendationsUncached,
  );

// ==========================================
// ALL RECOMMENDATIONS
// ==========================================

export const generateAllRecommendationsService =
  async () => {
    const [
      overallMonthly,
      overallYearly,
      allPuroksMonthly,
      allPuroksYearly,
    ] = await Promise.all([
      generateOverallMonthlyRecommendations(),
      generateOverallYearlyRecommendations(),
      generateAllPuroksMonthlyRecommendations(),
      generateAllPuroksYearlyRecommendations(),
    ]);

    return {
      overallMonthly,
      overallYearly,
      allPuroksMonthly,
      allPuroksYearly,
    };
  };
