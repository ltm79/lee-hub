import { packetFiles, slotLabel } from "@/lib/desk/docs";
import { KIND_META, packetTitle, type Packet } from "@/lib/desk/types";

function line(label: string, value: string | undefined): string | null {
  const text = value?.trim();
  return text ? `${label}: ${text}` : null;
}

function block(title: string, rows: Array<string | null>): string[] {
  const kept = rows.filter((row): row is string => Boolean(row));
  if (kept.length === 0) return [];
  return ["", title, ...kept];
}

export function voucherLetter(packet: Packet, fileNames: string[]): string {
  const answers = packet.answers;
  const kind = KIND_META[packet.kind].title;
  const splits: string[] = [];
  for (let i = 1; i <= 8; i += 1) {
    const agent = answers[`split${i}Agent`]?.trim();
    if (!agent) continue;
    const pct = answers[`split${i}Pct`]?.trim();
    const entity = answers[`split${i}Entity`]?.trim();
    splits.push([agent, pct ? `${pct}%` : "", entity].filter(Boolean).join(" · "));
  }
  const entities: string[] = [];
  for (let i = 1; i <= 2; i += 1) {
    const company = answers[`ext${i}Company`]?.trim();
    if (!company) continue;
    const contact = answers[`ext${i}Contact`]?.trim();
    const amount = answers[`ext${i}Commission`]?.trim();
    entities.push([company, contact, amount].filter(Boolean).join(" · "));
  }
  const files = packetFiles(packet).map(
    (file) => `${slotLabel(packet.kind, file.slot)} — ${file.name}`,
  );

  return [
    `Lee & Associates ${kind}`,
    packetTitle(packet),
    answers.city?.trim() ?? "",
    "",
    "This voucher was sent from Deal Desk. The filled office form is attached as a PDF. Backup documents are attached separately — there is no zip file.",
    ...block("Property", [
      line("Address", answers.address),
      line("City", answers.city),
      line("Type", answers.propertyType),
      line("Other type", answers.propertyOther),
      line("Square Feet", answers.sf),
      line("Transaction", answers.transaction),
      line("Engagement", answers.engagement),
    ]),
    ...block("Parties", [
      line("Lessor", answers.lessor),
      line("Lessor DBA", answers.lessorDba),
      line("Lessor contact", answers.lessorContact),
      line("Lessee", answers.lessee),
      line("Lessee contact", answers.lesseeContact),
      line("Seller", answers.seller),
      line("Buyer", answers.buyer),
      line("Client", answers.client),
      line("Represented", answers.represented),
    ]),
    ...block("Terms", [
      line("Lease from", answers.leaseFrom),
      line("Lease through", answers.leaseThrough),
      line("Execution date", answers.executionDate),
      line("Term (months)", answers.termMos),
      line("Asking rate", answers.askingRate),
      line("Lease rate", answers.leaseRate),
      line("Effective rate", answers.effectiveRate),
      line("TI", answers.ti),
      line("Free rent", answers.freeRent),
      line("Purchase price", answers.price),
      line("Cap rate", answers.capRate?.trim() ? (answers.capRate.trim().endsWith("%") ? answers.capRate.trim() : `${answers.capRate.trim()}%`) : ""),
      line("Close date", answers.closeDate),
      line("Escrow", answers.escrow),
      line("Fee", answers.fee),
    ]),
    ...block("Money", [
      line("Funds", answers.fundsType),
      line("Received from", answers.fundsFrom),
      line("Amount received", answers.amountReceived),
      line("Gross commission", answers.gross),
      line("Commission %", answers.salePct),
      ...splits.map((row) => `Inside split: ${row}`),
      ...entities.map((row) => `External entity: ${row}`),
    ]),
    ...block("Invoice", [
      line("Bill to", answers.billName),
      line("Company", answers.billCompany),
      line("City", answers.billCity),
      line("Send invoice", answers.invoice),
    ]),
    ...block("Agent", [line("Signed", answers.agentSign)]),
    "",
    "Attached",
    ...fileNames.map((name) => `- ${name}`),
    ...(files.length ? ["", "Backup on the voucher", ...files.map((name) => `- ${name}`)] : []),
    "",
  ]
    .filter((row) => row !== undefined)
    .join("\n");
}
