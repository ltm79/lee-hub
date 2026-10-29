export type MarketPoint = {
  id: string;
  market: string;
  submarket: string;
  city: string;
  year: number;
  quarter: number;
  inventorySf: number | null;
  vacancyRate: number | null;
  availabilityRate: number | null;
  askingRent: number | null;
  directRent: number | null;
  leasingSf: number | null;
  absorptionSf: number | null;
  underConstructionSf: number | null;
  completionsSf: number | null;
  salePricePsf: number | null;
  capRate: number | null;
  salesVolume: number | null;
  salesSf: number | null;
  transactions: number | null;
  buildings: number | null;
  vacantSf: number | null;
  subletSf: number | null;
  availableSf: number | null;
  notes: string;
  source: string;
};

export type MarketInput = Omit<MarketPoint, "id" | "source"> & { id?: string; source?: string };

export const MARKET_FIELDS = [
  ["inventorySf", "Inventory SF"],
  ["vacancyRate", "Vacancy %"],
  ["availabilityRate", "Availability %"],
  ["askingRent", "Asking rent NNN"],
  ["directRent", "Direct rent"],
  ["leasingSf", "Leasing activity SF"],
  ["absorptionSf", "Net absorption SF"],
  ["underConstructionSf", "Under construction SF"],
  ["completionsSf", "Completions SF"],
  ["salePricePsf", "Sale price / SF"],
  ["capRate", "Cap rate %"],
  ["salesVolume", "Sales volume $"],
  ["salesSf", "Sales SF"],
  ["transactions", "Transactions"],
  ["buildings", "Buildings"],
  ["vacantSf", "Vacant SF"],
  ["subletSf", "Sublet SF"],
  ["availableSf", "Available SF"],
] as const;

export type MarketField = (typeof MARKET_FIELDS)[number][0];
