import { bytesBlob, saveBlob } from "@/lib/desk/zip";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFForm, type PDFPage } from "pdf-lib";
import type { Answers, Kind, Packet } from "@/lib/desk/types";
import { KIND_META } from "@/lib/desk/types";
import {
  leaseMath,
  money,
  pdfText,
  saleCommission,
  splitNet,
  wrapLines,
} from "@/lib/desk/money";

const TEMPLATES: Record<Kind, string> = {
  lease: "/templates/lease.pdf",
  sale: "/templates/sale.pdf",
  consult: "/templates/consult.pdf",
  additional: "/templates/additional.pdf",
};

const PROPERTY: Record<string, string> = {
  industrial: "Choice1",
  land: "Choice2",
  office: "Choice3",
  retail: "Choice4",
};

function text(form: PDFForm, name: string, value: string | undefined, max = 80) {
  const clean = pdfText(value).slice(0, max);
  if (!clean) return;
  try {
    const field = form.getTextField(name);
    field.setText(clean);
    try {
      field.setFontSize(8);
    } catch {
      /* Some widgets ignore an explicit size. */
    }
  } catch {
    /* Template field names are positional; skip anything the file doesn't have. */
  }
}

function check(form: PDFForm, name: string, on: boolean) {
  if (!on) return;
  try {
    form.getCheckBox(name).check();
  } catch {
    /* skip */
  }
}

function radio(form: PDFForm, name: string, option: string | undefined) {
  if (!option) return;
  try {
    form.getRadioGroup(name).select(option);
  } catch {
    /* skip */
  }
}

function office(form: PDFForm, answers: Answers) {
  text(form, "S  L", answers.officeSl, 24);
  text(form, "Entered", answers.officeEntered, 24);
  text(form, "Paid", answers.officePaid, 24);
  text(form, "Commerce", answers.officeCommerce, 24);
}

function property(form: PDFForm, answers: Answers, group: string) {
  text(form, "Property Address", answers.address, 70);
  text(form, "City State Zip", answers.city, 70);
  text(form, "Other", answers.propertyOther, 24);
  text(form, "SF", answers.sf, 18);
  radio(form, group, PROPERTY[answers.propertyType ?? ""]);
}

function funds(form: PDFForm, answers: Answers, grossName: string, amountName: string) {
  check(form, "Check", answers.fundsType === "check");
  check(form, "Wire", answers.fundsType === "wire");
  check(form, "ACH Payment", answers.fundsType === "ach");
  text(form, "Funds Received From", answers.fundsFrom, 40);
  text(form, amountName, answers.amountReceived, 22);
  text(form, grossName, answers.gross, 22);
  text(form, "Outstanding Balance 1", answers.balance, 22);
  text(form, "Outstanding Balance 2", answers.dueDate, 22);
}

function splits(form: PDFForm, answers: Answers) {
  const slots = [
    ["Agent_7", "Defer", "Entity", "of Gross", "Net Commission", "Runner Name", "Runner Commission  Net Check Amount"],
    ["Agent_8", "Defer_2", "Entity_2", "of Gross_2", "Net Commission_2", "Runner Name_2", "Runner Commission  Net Check Amount_2"],
    ["Agent_9", "Defer_3", "Entity_3", "of Gross_3", "Net Commission_3", "Runner Name_3", "Runner Commission  Net Check Amount_3"],
    ["Agent_10", "Defer_4", "Entity_4", "of Gross_4", "Net Commission_4", "Runner Name_4", "Runner Commission  Net Check Amount_4"],
  ] as const;
  slots.forEach((names, index) => {
    const n = index + 1;
    text(form, names[0], answers[`split${n}Agent`], 28);
    check(form, names[1], answers[`split${n}Defer`] === "1");
    text(form, names[2], "", 28);
    text(form, names[3], answers[`split${n}Pct`], 8);
    text(form, names[4], splitNet(answers.gross, answers[`split${n}Pct`]), 16);
    text(form, names[5], answers[`split${n}Runner`], 28);
    text(form, names[6], answers[`split${n}RunnerAmt`], 16);
  });
}

function external(form: PDFForm, answers: Answers, variant: "lease" | "sale") {
  const lease = variant === "lease";
  const left = lease
    ? ["1_3", "2_3", "City  State  Zip 1", "City  State  Zip 2", "Text19", "Text20", "1_5", "2_5"]
    : ["1", "2", "City  State  Zip 1", "City  State  Zip 2", "Area Code 1", "Phone Number 1", "1_3", "2_3"];
  const right = lease
    ? ["1_4", "2_4", "City  State  Zip 1_2", "City  State  Zip 2_2", "Text21", "Text22", "1_6", "2_6"]
    : ["1_2", "2_2", "City  State  Zip 1_2", "City  State  Zip 2_2", "Area Code 2", "Phone Number 2", "1_4", "2_4"];
  writeExternal(form, answers, 1, left, "Licensed", "Unlicensed", "Salesperson DRE", "Commission Amount");
  writeExternal(form, answers, 2, right, "Licensed_2", "Unlicensed_2", "Salesperson DRE_2", "Commission Amount_2");
}

function writeExternal(
  form: PDFForm,
  answers: Answers,
  n: number,
  names: string[],
  licensed: string,
  unlicensed: string,
  salesperson: string,
  commission: string,
) {
  const [company, address, city, contact, area, phone, email, corp] = names;
  text(form, company, answers[`ext${n}Company`], 36);
  text(form, address, answers[`ext${n}Address`], 36);
  text(form, city, answers[`ext${n}City`], 36);
  text(form, contact, answers[`ext${n}Contact`], 36);
  const phoneRaw = answers[`ext${n}Phone`] ?? "";
  const digits = (phoneRaw.includes("(") ? phoneRaw : `${answers[`ext${n}Area`] ?? ""}${phoneRaw}`).replace(/\D/g, "");
  const areaDigits = digits.slice(0, 3);
  const phoneDigits = digits.slice(3, 10);
  const phoneText = phoneDigits.length > 3 ? `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3)}` : phoneDigits;
  text(form, area, areaDigits, 3);
  text(form, phone, phoneText, 16);
  text(form, email, answers[`ext${n}Email`], 36);
  text(form, corp, answers[`ext${n}Corp`], 20);
  text(form, salesperson, answers[`ext${n}Sales`], 20);
  text(form, commission, answers[`ext${n}Commission`], 18);
  check(form, licensed, answers[`ext${n}License`] === "licensed");
  check(form, unlicensed, answers[`ext${n}License`] === "unlicensed");
}

function marketing(form: PDFForm, answers: Answers, highlightLines: number) {
  check(form, "Gift Basket", answers.mktGift === "1");
  check(form, "Press Release", answers.mktPress === "1");
  check(form, "Add to Website  Online Resume", answers.mktWeb === "1");
  check(form, "Remove Sign", answers.mktSign === "1");
  check(form, "Postcard", answers.mktCard === "1");
  text(form, "Criteria", answers.mktCriteria, 40);
  check(form, "Add to LeePro Transaction Summary Report", answers.mktLeepro === "1");
  text(form, "Reference Contact", answers.mktRef, 36);
  const lines = wrapLines(answers.highlights, highlightLines, 80);
  if (highlightLines === 1) text(form, "Highlights", lines[0], 80);
  else lines.forEach((line, index) => text(form, `Highlights ${index + 1}`, line, 80));
}

function invoiceYesNo(form: PDFForm, answers: Answers) {
  check(form, "Invoice", answers.invoice === "yes");
  check(form, "Yes", answers.invoice === "no");
}

function billTo(form: PDFForm, answers: Answers) {
  text(form, "Name", answers.billName, 36);
  text(form, "Company", answers.billCompany, 36);
  text(form, "City State Zip_2", answers.billCity, 70);
}

function listingAgents(form: PDFForm, answers: Answers) {
  const pairs = [
    ["Agent", "Firm", "Agent_2", "Firm_2"],
    ["Agent_3", "Firm_3", "Agent_4", "Firm_4"],
    ["Agent_5", "Firm_5", "Agent_6", "Firm_6"],
  ];
  pairs.forEach((names, index) => {
    const n = index + 1;
    text(form, names[0], answers[`list${n}Name`], 32);
    text(form, names[1], answers[`list${n}Firm`], 32);
    text(form, names[2], answers[`proc${n}Name`], 32);
    text(form, names[3], answers[`proc${n}Firm`], 32);
  });
}

function fillLease(form: PDFForm, answers: Answers) {
  office(form, answers);
  check(form, "Lease", answers.transaction === "lease");
  check(form, "Sublease", answers.transaction === "sublease");
  check(form, "Lease Renewal", answers.transaction === "renewal");
  property(form, answers, "Group23");
  const leaseDocs = [
    "Executed lease",
    "Property information sheet",
    "Lee & Associates disclosure",
    "Agency disclosure",
    "Listing agreement",
    "Offer / counter offer",
    "Finder's fee agreement",
  ];
  const showLease = answers.transaction === "lease";
  const showSub = answers.transaction === "sublease";
  const showRenewal = answers.transaction === "renewal";
  leaseDocs.forEach((_, index) => check(form, `Check Box${index + 1}`, showLease && answers[`checkLease${index + 1}`] === "1"));
  const subDocs = 9;
  for (let i = 1; i <= subDocs; i += 1) check(form, `Check Box${i + 7}`, showSub && answers[`checkSub${i}`] === "1");
  check(form, "Check Box17", showRenewal && answers.checkRen1 === "1");
  check(form, "Check Box18", showRenewal && answers.checkRen2 === "1");
  text(form, "9", answers.lessor, 36);
  text(form, "1", answers.lessee, 36);
  text(form, "Company DBA 1", answers.lessorDba, 36);
  text(form, "2", answers.lesseeDba, 36);
  text(form, "Company DBA 2", answers.lessorContact, 36);
  text(form, "3", answers.lesseeContact, 36);
  check(form, "Lessor", answers.represented === "lessor");
  check(form, "Lessee", answers.represented === "lessee");
  check(form, "Both", answers.represented === "both");
  text(form, "undefined", answers.leaseFrom, 16);
  text(form, "through", answers.leaseThrough, 16);
  text(form, "Lease Execution Date", answers.executionDate, 20);
  text(form, "Term Mos", "", 16);
  text(form, "Total Building SF", "", 16);
  text(form, "TI Allowance", "", 16);
  text(form, "undefined_2", "", 16);
  text(form, "Lease Option Terms", answers.leaseOption, 28);
  text(form, "Exercise Time Frame", answers.exerciseLeft, 28);
  text(form, "1_2", answers.askingRate, 16);
  text(form, "Rate Type", answers.askingType, 12);
  text(form, "2_2", answers.leaseRate, 16);
  text(form, "Rate Type_2", answers.leaseType, 12);
  text(form, "3_2", answers.effectiveRate, 16);
  text(form, "Rate Type_3", "", 12);
  text(form, "4", answers.termMos, 8);
  text(form, "Total Consideration 1", answers.considerationNote, 22);
  text(form, "Total Consideration 2", answers.ti, 22);
  text(form, "Purchase Option Terms", answers.purchaseOption, 28);
  text(form, "Exercise Time Frame 1", answers.exerciseRight, 22);
  text(form, "Exercise Time Frame 2", answers.freeRent, 22);
  for (let i = 1; i <= 5; i += 1) {
    text(form, `Period ${i}`, answers[`esc${i}Period`], 16);
    text(form, `Rate PSF ${i}`, answers[`esc${i}Psf`], 12);
    text(form, `Rate Type ${i}`, answers[`esc${i}Type`], 12);
  }
  wrapLines(answers.escNotes, 4, 40).forEach((line, index) => text(form, `Comments ${index + 1}`, line, 40));
  text(form, "NNN  CAM Charges", answers.nnn, 50);
  listingAgents(form, answers);
  funds(form, answers, "Amount Received 2", "Amount Received 1");
  invoiceYesNo(form, answers);
  splits(form, answers);
  external(form, answers, "lease");
  marketing(form, answers, 4);
  billTo(form, answers);
  const math = leaseMath(answers);
  for (let i = 0; i < 10; i += 1) {
    const n = i + 1;
    const suffix = n === 1 ? "" : `_${n}`;
    text(form, `Mos${suffix}`, answers[`row${n}From`], 4);
    text(form, `to${suffix}`, answers[`row${n}To`], 4);
    text(form, `undefined_${3 + i * 2}`, answers[`row${n}Rent`], 12);
    text(form, `Month x${suffix}`, answers[`row${n}Months`], 4);
    text(form, n === 1 ? "x" : `x_${n}`, answers[`row${n}Pct`], 6);
    const row = math.rows[i];
    if (row?.active && Number.isFinite(row.subtotal)) text(form, `Months${suffix}`, money(row.subtotal), 14);
    if (row?.active && Number.isFinite(row.commission)) text(form, `undefined_${4 + i * 2}`, money(row.commission), 14);
  }
  if (math.any) {
    text(form, "Total Consideration", money(math.consideration), 16);
    text(form, "Total Commission", money(math.commission), 16);
  }
  const commentLines = ["Comments", "1_7", "2_7"];
  wrapLines(answers.comments, 3, 100).forEach((line, index) => {
    text(form, commentLines[index] ?? "Comments", line, 110);
  });
  text(form, "undefined_23", answers.agentSign, 36);
  text(form, "undefined_24", answers.brokerSign, 36);
}

function fillSale(form: PDFForm, answers: Answers) {
  office(form, answers);
  property(form, answers, "Group1");
  for (let i = 2; i <= 15; i += 1) check(form, `Check Box${i}`, answers[`checkSale${i}`] === "1");
  text(form, "Asking Price", answers.asking, 22);
  text(form, "Close of Escrow Date", answers.closeDate, 20);
  text(form, "Purchase Price", answers.price, 22);
  const cap = answers.capRate?.trim();
  const capLine = cap ? `Cap rate ${cap.endsWith("%") ? cap : `${cap}%`}` : "";
  const saleNotes = [capLine, answers.saleNotes?.trim()].filter(Boolean).join(". ");
  wrapLines(saleNotes, 2, 70).forEach((line, index) => text(form, `Comments ${index + 1}`, line, 70));
  text(form, "undefined", answers.seller, 36);
  text(form, "undefined_2", answers.buyer, 36);
  text(form, "Company DBA 1", answers.sellerDba, 36);
  text(form, "Company DBA 1_2", answers.buyerDba, 36);
  text(form, "Company DBA 2", answers.sellerContact, 36);
  text(form, "Company DBA 2_2", answers.buyerContact, 36);
  check(form, "User", answers.buyerType === "user");
  check(form, "Investor", answers.buyerType === "investor");
  listingAgents(form, answers);
  funds(form, answers, "Amount Received 2", "Amount Received 1");
  invoiceYesNo(form, answers);
  splits(form, answers);
  external(form, answers, "sale");
  marketing(form, answers, 1);
  billTo(form, answers);
  const commission = saleCommission(answers);
  const baseText = answers.saleBase || answers.price;
  text(form, "undefined_3", baseText, 16);
  text(form, "x", answers.salePct, 8);
  if (commission.ready) text(form, "undefined_4", money(commission.line), 16);
  const totalConsideration = answers.totalConsideration || (commission.ready ? money(commission.base) : answers.price);
  const totalCommission = answers.totalCommission || (commission.ready ? money(commission.line) : "");
  text(form, "Total Consideration", totalConsideration, 16);
  text(form, "Total Commission", totalCommission, 16);
  text(form, "Comments", pdfText(answers.comments).slice(0, 90), 90);
  text(form, "undefined_5", answers.agentSign, 36);
  text(form, "undefined_6", answers.brokerSign, 36);
}

function fillConsult(form: PDFForm, answers: Answers) {
  office(form, answers);
  check(form, "Referral", answers.engagement === "referral");
  check(form, "Consulting", answers.engagement === "consulting");
  property(form, answers, "Group1");
  check(form, "Check Box2", answers.checkCon1 === "1");
  check(form, "Check Box3", answers.checkCon2 === "1");
  check(form, "Check Box4", answers.checkRef1 === "1");
  check(form, "Check Box5", answers.checkRef2 === "1");
  check(form, "Check Box6", answers.checkRef3 === "1");
  funds(form, answers, "Commission Distribution  INTERNAL", "Amount Received");
  splits(form, answers);
  external(form, answers, "sale");
  text(form, "Comments", pdfText(answers.sideComment).slice(0, 80), 80);
  radio(form, "If Yes See Below", answers.invoice === "yes" ? "Yes" : answers.invoice === "no" ? "No" : undefined);
  billTo(form, answers);
  wrapLines(answers.comments, 5, 100).forEach((line, index) => {
    const names = ["Comments_2", "1_5", "2_5", "3", "4"];
    text(form, names[index] ?? "Comments_2", line, 110);
  });
  text(form, "undefined", answers.agentSign, 36);
  text(form, "undefined_2", answers.brokerSign, 36);
}

function draw(page: PDFPage, font: PDFFont, value: string | undefined, x: number, y: number, max = 42) {
  const clean = pdfText(value).slice(0, max);
  if (!clean) return;
  page.drawText(clean, { x, y, size: 9, font, color: rgb(0.11, 0.14, 0.19) });
}

function mark(page: PDFPage, font: PDFFont, x: number, y: number) {
  page.drawText("X", { x, y, size: 10, font, color: rgb(0.77, 0.07, 0.19) });
}

function fillAdditional(page: PDFPage, font: PDFFont, answers: Answers) {
  draw(page, font, answers.officeSl, 478, 951, 16);
  draw(page, font, answers.officeEntered, 478, 935, 16);
  draw(page, font, answers.officePaid, 478, 919, 16);
  draw(page, font, answers.officeCommerce, 478, 904, 16);
  draw(page, font, answers.address, 128, 928, 48);
  draw(page, font, answers.city, 118, 902, 55);
  draw(page, font, answers.seller, 118, 871, 28);
  draw(page, font, answers.buyer, 400, 871, 28);
  draw(page, font, answers.sellerDba, 112, 849, 28);
  draw(page, font, answers.buyerDba, 392, 849, 28);
  draw(page, font, answers.sellerContact, 88, 827, 28);
  draw(page, font, answers.buyerContact, 368, 827, 28);
  if (answers.fundsType === "check") mark(page, font, 124, 779);
  if (answers.fundsType === "wire") mark(page, font, 186, 779);
  if (answers.fundsType === "ach") mark(page, font, 234, 779);
  draw(page, font, answers.balance, 460, 781, 16);
  draw(page, font, answers.fundsFrom, 150, 758, 28);
  draw(page, font, answers.dueDate, 410, 758, 16);
  draw(page, font, answers.amountReceived, 130, 736, 20);
  draw(page, font, answers.gross, 112, 714, 20);
  const slots = [
    { yAgent: 672, yEntity: 650, yPct: 627, yRunner: 591, yAmt: 569, x: 72, xDefer: 268, xNet: 230 },
    { yAgent: 672, yEntity: 650, yPct: 627, yRunner: 591, yAmt: 569, x: 365, xDefer: 538, xNet: 510 },
    { yAgent: 537, yEntity: 515, yPct: 493, yRunner: 456, yAmt: 434, x: 72, xDefer: 268, xNet: 230 },
    { yAgent: 537, yEntity: 515, yPct: 493, yRunner: 456, yAmt: 434, x: 365, xDefer: 538, xNet: 510 },
  ];
  slots.forEach((slot, index) => {
    const n = index + 1;
    draw(page, font, answers[`split${n}Agent`], slot.x, slot.yAgent, 22);
    if (answers[`split${n}Defer`] === "1") mark(page, font, slot.xDefer, slot.yAgent - 2);
    draw(page, font, "", slot.x, slot.yEntity, 22);
    draw(page, font, answers[`split${n}Pct`], slot.x + 28, slot.yPct, 6);
    draw(page, font, splitNet(answers.gross, answers[`split${n}Pct`]), slot.xNet, slot.yPct, 12);
    draw(page, font, answers[`split${n}Runner`], slot.x + 40, slot.yRunner, 22);
    draw(page, font, answers[`split${n}RunnerAmt`], slot.x + 180, slot.yAmt, 12);
  });
  const columns = [
    { x: 90, markLic: 128, markUn: 198 },
    { x: 390, markLic: 426, markUn: 496 },
  ];
  columns.forEach((column, index) => {
    const n = index + 1;
    if (answers[`ext${n}License`] === "licensed") mark(page, font, column.markLic, 377);
    if (answers[`ext${n}License`] === "unlicensed") mark(page, font, column.markUn, 377);
    draw(page, font, answers[`ext${n}Company`], column.x, 352, 28);
    draw(page, font, answers[`ext${n}Address`], column.x, 332, 28);
    draw(page, font, answers[`ext${n}City`], column.x + 30, 312, 24);
    draw(page, font, answers[`ext${n}Contact`], column.x, 292, 28);
    const phoneRaw = answers[`ext${n}Phone`] ?? "";
    const digits = (phoneRaw.includes("(") ? phoneRaw : `${answers[`ext${n}Area`] ?? ""}${phoneRaw}`).replace(/\D/g, "");
    const phoneDigits = digits.slice(3, 10);
    const phoneText = phoneDigits.length > 3 ? `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3)}` : phoneDigits;
    draw(page, font, digits.slice(0, 3), column.x + 55, 272, 3);
    draw(page, font, phoneText, column.x + 82, 272, 14);
    draw(page, font, answers[`ext${n}Email`], column.x - 10, 252, 28);
    draw(page, font, answers[`ext${n}Corp`], column.x + 10, 232, 16);
    draw(page, font, answers[`ext${n}Sales`], column.x + 40, 212, 16);
    draw(page, font, answers[`ext${n}Commission`], column.x + 50, 192, 14);
  });
  wrapLines(answers.comments, 2, 70).forEach((line, index) => draw(page, font, line, 95, 171 - index * 16, 70));
  draw(page, font, answers.agentSign, 68, 64, 32);
  draw(page, font, answers.brokerSign, 331, 64, 32);
}

export async function buildVoucher(bytes: ArrayBuffer, packet: Packet): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  if (packet.kind === "additional") {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.getPages()[0];
    if (!page) throw new Error("Additional payment template has no pages.");
    fillAdditional(page, font, packet.answers);
  } else {
    const form = doc.getForm();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    if (packet.kind === "lease") fillLease(form, packet.answers);
    if (packet.kind === "sale") fillSale(form, packet.answers);
    if (packet.kind === "consult") fillConsult(form, packet.answers);
    try {
      form.updateFieldAppearances(font);
      form.flatten();
    } catch {
      /* Keep the filled fields even if a widget appearance fails. */
    }
  }
  return doc.save();
}

export function voucherFilename(packet: Packet): string {
  const address = (packet.answers.address || KIND_META[packet.kind].short)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const day = new Date().toISOString().slice(0, 10);
  return `${packet.kind}-${address || "voucher"}-${day}.pdf`;
}

export async function renderVoucher(packet: Packet): Promise<Uint8Array> {
  const response = await fetch(TEMPLATES[packet.kind]);
  if (!response.ok) throw new Error("Template unavailable");
  return buildVoucher(await response.arrayBuffer(), packet);
}

export async function downloadVoucher(packet: Packet): Promise<void> {
  const bytes = await renderVoucher(packet);
  saveBlob(bytesBlob(bytes, "application/pdf"), voucherFilename(packet));
}
