export type Kind = "lease" | "sale" | "consult" | "additional";
export type Status = "draft" | "submitted";
export type Answers = Record<string, string>;

export type Attachment = {
  id: string;
  slot: string;
  name: string;
  type: string;
  size: number;
  addedAt: number;
};

export type Packet = {
  id: string;
  kind: Kind;
  status: Status;
  createdAt: number;
  updatedAt: number;
  submittedAt?: number;
  answers: Answers;
  files?: Attachment[];
  ownerId?: string;
};

export type Blocker = {
  key: string;
  label: string;
  section: string;
};

export const KIND_ORDER: Kind[] = ["lease", "sale", "consult", "additional"];

export const KIND_META: Record<
  Kind,
  { title: string; short: string; pages: string; blurb: string }
> = {
  lease: {
    title: "Lease voucher",
    short: "Lease",
    pages: "3 pages",
    blurb: "New lease, sublease, or renewal, including the rent schedule.",
  },
  sale: {
    title: "Sale voucher",
    short: "Sale",
    pages: "2 pages",
    blurb: "Closed sale, from the document checklist through the invoice.",
  },
  consult: {
    title: "Consulting/Referral",
    short: "Consulting/Referral",
    pages: "2 pages",
    blurb: "Referral or consulting fee with the short backup checklist.",
  },
  additional: {
    title: "Additional Payment",
    short: "Additional Payment",
    pages: "1 page",
    blurb: "A later check on a deal that already has a voucher on file.",
  },
};

export function blockers(kind: Kind, answers: Answers): Blocker[] {
  const out: Blocker[] = [];
  if (!answers.address?.trim()) {
    out.push({ key: "address", label: "Street address", section: "property" });
  }
  if (!answers.city?.trim()) {
    out.push({ key: "city", label: "City, State, ZIP", section: "property" });
  }
  if (!answers.sf?.trim()) {
    out.push({ key: "sf", label: "Square Feet", section: "property" });
  }
  if (kind === "lease" && !answers.transaction) {
    out.push({
      key: "transaction",
      label: "Lease, sublease, or renewal",
      section: "property",
    });
  }
  if (kind === "consult" && !answers.engagement) {
    out.push({
      key: "engagement",
      label: "Referral or consulting",
      section: "property",
    });
  }
  if (kind === "sale" && answers.buyerType !== "user" && answers.buyerType !== "investor") {
    out.push({ key: "buyerType", label: "Buyer type", section: "property" });
  }
  if (hasBalance(answers.balance) && !answers.dueDate?.trim()) {
    out.push({ key: "dueDate", label: "Due Date", section: "money" });
  }
  if (distributionExceeds(answers)) {
    out.push({ key: "amountReceived", label: "Distribution over Amount Received", section: "money" });
  }
  if (!answers.agentSign?.trim()) {
    out.push({ key: "agentSign", label: "Agent signature", section: "sign" });
  }
  return out;
}

function moneyValue(value: string | undefined): number {
  if (!value?.trim()) return Number.NaN;
  const amount = Number(value.replace(/[$,%\s]/g, ""));
  return Number.isFinite(amount) ? amount : Number.NaN;
}

function distributionExceeds(answers: Answers): boolean {
  const received = moneyValue(answers.amountReceived);
  const gross = moneyValue(answers.gross);
  let total = 0;
  let any = false;
  for (let index = 1; index <= 4; index += 1) {
    const pct = moneyValue(answers[`split${index}Pct`]);
    if (answers[`split${index}Pct`]?.trim() && Number.isFinite(gross) && Number.isFinite(pct)) {
      total += (gross * pct) / 100;
      any = true;
    }
  }
  for (let index = 1; index <= 2; index += 1) {
    const commission = moneyValue(answers[`ext${index}Commission`]);
    if (answers[`ext${index}Commission`]?.trim() && Number.isFinite(commission)) {
      total += commission;
      any = true;
    }
  }
  return any && Number.isFinite(received) && total - received > 0.009;
}

export function hasBalance(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  const amount = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(amount) && amount !== 0;
}

export function streetAddress(value: string | undefined): string {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  const line = raw.split(/\r?\n/)[0]?.trim() ?? "";
  return line.split(",")[0]?.trim() ?? "";
}

export function packetTitle(packet: Packet): string {
  return streetAddress(packet.answers.address) || "Untitled property";
}
