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
  if (!answers.agentSign?.trim()) {
    out.push({ key: "agentSign", label: "Agent signature", section: "sign" });
  }
  return out;
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
