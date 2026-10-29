import type { Answers, Kind, Packet } from "@/lib/desk/types";

export type DocItem = { key: string; label: string };
export type DocGroup = { title: string; items: DocItem[] };

const LEASE_DOCS = [
  "1. Executed Lease",
  "2. Property Information Sheet",
  "3. Lee & Associates Disclosure",
  "4. Agency Disclosure",
  "5. Listing Agreement",
  "6. Offer / Counter Offer",
  "7. Finder's Fee Agreement",
];

const SUBLEASE_DOCS = [
  "1. Executed Sublease",
  "2. Master Lessor Consent",
  "3. Master Lease",
  "4. Property Information Sheet",
  "5. Lee & Associates Disclosure",
  "6. Agency Disclosure",
  "7. Listing Agreement",
  "8. Offer / Counter Offer",
  "9. Finder's Fee Agreement",
];

const SALE_ROWS = [
  [2, "1. Final Closing Statement"],
  [3, "2. Escrow Instructions / Amendments"],
  [4, "3. Purchase and Sale Agreement"],
  [5, "4. Property Information Sheet"],
  [6, "5. Seller's Mandatory Disclosure"],
  [7, "6. Lee & Associates Disclosure"],
  [8, "7. Agency Disclosure"],
  [9, "8. NHDS Report"],
  [10, "9. Preliminary Title Report"],
  [11, "10. Environmental / Engineering Reports"],
  [12, "11. Earthquake Report (pre 1975)"],
  [13, "12. Listing Agreement"],
  [14, "13. Offer / Counter Offer"],
  [15, "14. Finder's Fee Agreement"],
] as const;

const SALE_DOCS: DocItem[] = SALE_ROWS.map(([id, label]) => ({ key: `checkSale${id}`, label }));

function numbered(prefix: string, labels: readonly string[]): DocItem[] {
  return labels.map((label, index) => ({ key: `${prefix}${index + 1}`, label }));
}

function everyGroup(kind: Kind): DocGroup[] {
  if (kind === "lease") {
    return [
      { title: "Lease", items: numbered("checkLease", LEASE_DOCS) },
      { title: "Sublease", items: numbered("checkSub", SUBLEASE_DOCS) },
      {
        title: "Lease Renewal",
        items: [
          { key: "checkRen1", label: "1. Executed Amendment / Letter" },
          { key: "checkRen2", label: "2. Finder's Fee Agreement" },
        ],
      },
    ];
  }
  if (kind === "sale") return [{ title: "Voucher Document Checklist", items: SALE_DOCS }];
  if (kind === "consult") {
    return [
      {
        title: "Consulting",
        items: [
          { key: "checkCon1", label: "Compensation Letter from Client" },
          { key: "checkCon2", label: "Finder's Fee Agreement" },
        ],
      },
      {
        title: "Referral",
        items: [
          { key: "checkRef1", label: "Letter Describing Transaction" },
          { key: "checkRef2", label: "Letter Disclosing Non-Agency Transaction" },
          { key: "checkRef3", label: "Finder's Fee Agreement" },
        ],
      },
    ];
  }
  return [];
}

export function docGroups(kind: Kind, answers: Answers = {}): DocGroup[] {
  const groups = everyGroup(kind);
  if (kind === "lease") {
    const title =
      answers.transaction === "sublease"
        ? "Sublease"
        : answers.transaction === "renewal"
          ? "Lease Renewal"
          : answers.transaction === "lease"
            ? "Lease"
            : "";
    return title ? groups.filter((group) => group.title === title) : groups;
  }
  if (kind === "consult") {
    const title = answers.engagement === "consulting" ? "Consulting" : answers.engagement === "referral" ? "Referral" : "";
    return title ? groups.filter((group) => group.title === title) : groups;
  }
  return groups;
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
  for (const group of docGroups(packet.kind, packet.answers)) {
    for (const item of group.items) {
      if (packet.answers[item.key] === "1" && !attached.has(item.key)) missing += 1;
    }
  }
  return missing;
}
