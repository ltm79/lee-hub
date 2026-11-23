export const SUBMARKETS = [
  "LA Central",
  "San Gabriel Valley",
  "Mid Counties",
  "South Bay",
  "Inland Empire West",
  "Inland Empire East",
] as const;

export type SubmarketName = (typeof SUBMARKETS)[number];
