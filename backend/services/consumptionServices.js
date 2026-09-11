import {
  createConsumptionReading,
  getPurokConsumptionRanking,
  getPurokPredictionData,
} from "../models/consumptionModels.js";

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const consumptionFields = (record) =>
  MONTHS.filter((month) =>
    Object.prototype.hasOwnProperty.call(record, month)
  );

const yearlyTotal = (record) =>
  consumptionFields(record).reduce(
    (total, month) => total + toNumber(record[month]),
    0
  );

export const createReading = async (reading) =>
  createConsumptionReading(reading);

export const getConsumptionRanking = async () => {
  const data = await getPurokConsumptionRanking();

  return [...data]
    .sort((a, b) => toNumber(b.consumption) - toNumber(a.consumption))
    .map((item, index) => ({
      rank: index + 1,
      ...item,
      consumption: toNumber(item.consumption),
    }));
};

const resolveTargetYear = (records, requestedYear) => {
  if (records.length === 0) return null;
  if (requestedYear !== undefined && requestedYear !== null && requestedYear !== "") {
    const parsed = Number(requestedYear);
    if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2100) {
      const error = new TypeError("Year filter must be a valid year (1900-2100).");
      error.statusCode = 400;
      throw error;
    }
    return parsed;
  }
  return Math.max(...records.map((record) => toNumber(record.year)));
};

export const getOverallMonthlyHistory = async (requestedYear) => {
  const records = await getPurokPredictionData();
  if (records.length === 0) return [];

  const targetYear = resolveTargetYear(records, requestedYear);
  const totals = {};
  const recordedMonths = new Set();

  records
    .filter((record) => toNumber(record.year) === targetYear)
    .forEach((record) => {
      (record.recordedMonths ?? []).forEach((month) =>
        recordedMonths.add(month)
      );
      consumptionFields(record).forEach((month) => {
        totals[month] = (totals[month] ?? 0) + toNumber(record[month]);
      });
    });

  return MONTHS
    .filter((month) => recordedMonths.has(month))
    .map((month) => ({ month, consumption: toNumber(totals[month]) }));
};

export const getOverallYearlyHistory = async () => {
  const records = await getPurokPredictionData();
  const totals = {};

  records.forEach((record) => {
    const year = toNumber(record.year);
    if (year) totals[year] = (totals[year] ?? 0) + yearlyTotal(record);
  });

  return Object.entries(totals)
    .sort(([yearA], [yearB]) => Number(yearA) - Number(yearB))
    .map(([year, consumption]) => ({
      year: Number(year),
      consumption: toNumber(consumption),
    }));
};

export const getPerPurokMonthlyHistory = async (purok, requestedYear) => {
  const records = (await getPurokPredictionData())
    .filter((record) => record.purok === purok);

  if (records.length === 0) return [];

  const targetYear = resolveTargetYear(records, requestedYear);
  const record = records.find((item) => toNumber(item.year) === targetYear);

  return record
    ? consumptionFields(record)
        .filter((month) => (record.recordedMonths ?? []).includes(month))
        .map((month) => ({
          month,
          consumption: toNumber(record[month]),
        }))
    : [];
};

export const getPerPurokYearlyHistory = async (purok) => {
  const records = await getPurokPredictionData();

  return records
    .filter((record) => record.purok === purok)
    .sort((a, b) => toNumber(a.year) - toNumber(b.year))
    .map((record) => ({
      year: toNumber(record.year),
      consumption: yearlyTotal(record),
    }));
};

export const getAllPuroksMonthlyHistory = async (requestedYear) => {
  const records = await getPurokPredictionData();
  if (records.length === 0) return [];

  const targetYear = resolveTargetYear(records, requestedYear);

  return records
    .filter((record) => toNumber(record.year) === targetYear)
    .map((record) => ({
      purok: record.purok,
      latestYear: targetYear,
      historical: consumptionFields(record)
        .filter((month) => (record.recordedMonths ?? []).includes(month))
        .map((month) => ({
          month,
          consumption: toNumber(record[month]),
        })),
    }));
};

export const getAllPuroksYearlyHistory = async () => {
  const records = await getPurokPredictionData();
  const puroks = [...new Set(records.map((record) => record.purok).filter(Boolean))];

  return puroks.map((purok) => ({
    purok,
    historical: records
      .filter((record) => record.purok === purok)
      .sort((a, b) => toNumber(a.year) - toNumber(b.year))
      .map((record) => ({
        year: toNumber(record.year),
        consumption: yearlyTotal(record),
      })),
  }));
};
