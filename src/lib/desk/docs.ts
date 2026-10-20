import type { Kind, Packet } from "@/lib/desk/types";

export type DocItem = { key: string; label: string };
export type DocGroup = { title: string; items: DocItem[] };

const LEASE_DOCS = [
  "Executed lease",
  "Property information sheet",
  "Lee & Associates disclosure",
  "Agency disclosure",
  "Listing agreement",
  "Offer / counter offer",
  "Finder's fee agreement",
];

const SUBLEASE_DOCS = [
  "Executed sublease",
  "Master lessor consent",
  "Master lease",
  "Property information sheet",
  "Lee & Associates disclosure",
  "Agency disclosure",
  "Listing agreement",
  "Offer / counter offer",
  "Finder's fee agreement",
];

const SALE_ROWS = [
  [2, "Final closing statement"],
  [3, "Escrow instructions / amendments"],
  [4, "Purchase and sale agreement"],
  [5, "Property information sheet"],
  [6, "Seller's mandatory disclosure"],
  [7, "Lee & Associates disclosure"],
  [8, "Agency disclosure"],
  [9, "NHDS report"],
  [10, "Preliminary title report"],
  [11, "Environmental / engineering reports"],
  [12, "Earthquake report (pre-1975)"],
  [13, "Listing agreement"],
  [14, "Offer / counter offer"],
  [15, "Finder's fee agreement"],
] as const;

const SALE_DOCS: DocItem[] = SALE_ROWS.map(([id, label]) => ({ key: `checkSale${id}`, label }));

function numbered(prefix: string, labels: readonly string[]): DocItem[] {
  return labels.map((label, index) => ({ key: `${prefix}${index + 1}`, label }));
}

function everyGroup(kind: Kind): DocGroup[] {
  if (kind === "lease") {
    return [
      { title: "Lease file", items: numbered("checkLease", LEASE_DOCS) },
      { title: "Sublease file", items: numbered("checkSub", SUBLEASE_DOCS) },
      {
        title: "Renewal file",
        items: [
          { key: "checkRen1", label: "Executed amendment / letter" },
          { key: "checkRen2", label: "Finder's fee agreement" },
        ],
      },
    ];
  }
  if (kind === "sale") return [{ title: "Sale file", items: SALE_DOCS }];
  if (kind === "consult") {
    return [
      {
        title: "Consulting",
        items: [
          { key: "checkCon1", label: "Compensation letter from client" },
          { key: "checkCon2", label: "Finder's fee agreement" },
        ],
      },
      {
        title: "Referral",
        items: [
          { key: "checkRef1", label: "Letter describing the transaction" },
          { key: "checkRef2", label: "Letter disclosing a non-agency transaction" },
          { key: "checkRef3", label: "Finder's fee agreement" },
        ],
      },
    ];
  }
  return [];
}

export function docGroups(kind: Kind, transaction?: string): DocGroup[] {
  const groups = everyGroup(kind);
  if (kind !== "lease") return groups;
  const title =
    transaction === "sublease" ? "Sublease file" : transaction === "renewal" ? "Renewal file" : transaction === "lease" ? "Lease file" : "";
  return title ? groups.filter((group) => group.title === title) : [];
}

export function docSlots(kind: Kind): string[] {
  return everyGroup(kind).flatMap((group) => group.items.map((item) => item.key));
}

export function slotLabel(kind: Kind, slot: string): string {
  if (slot === "other") return "Other";
  for (const group of everyGroup(kind)) {
    const hit = group.items.find((item) => item.key === slot);
    if (hit) return hit.label;
  }
  return "File";
}

export function packetFiles(packet: Packet) {
  return packet.files ?? [];
}

export function checkedWithoutFile(packet: Packet): number {
  const attached = new Set(packetFiles(packet).map((file) => file.slot));
  let missing = 0;
  for (const group of docGroups(packet.kind, packet.answers.transaction)) {
    for (const item of group.items) {
      if (packet.answers[item.key] === "1" && !attached.has(item.key)) missing += 1;
    }
  }
  return missing;
}
