import { useEffect, useState } from "react";
import type { Answers, Kind } from "@/lib/desk/types";
import { dollars, leaseMath, splitNet, splitPercentTotal, termMonths } from "@/lib/desk/money";
import { listInternalUsers, type InternalUser } from "@/lib/desk/people";
import { FilesPanel } from "@/components/desk/files-panel";
import { Card, Checks, Choice, DateField, Field, read, SecondaryButton } from "@/components/desk/ui";

type SetAnswer = (key: string, value: string) => void;

export function sectionsFor(kind: Kind): { id: string; label: string }[] {
  if (kind === "lease") {
    return [
      { id: "property", label: "Property" },
      { id: "terms", label: "Terms" },
      { id: "agents", label: "Agents" },
      { id: "money", label: "Commission" },
      { id: "invoice", label: "Invoice" },
      { id: "docs", label: "Documents" },
      { id: "sign", label: "Sign" },
    ];
  }
  if (kind === "sale") {
    return [
      { id: "property", label: "Property" },
      { id: "agents", label: "Parties" },
      { id: "money", label: "Commission" },
      { id: "invoice", label: "Invoice" },
      { id: "docs", label: "Documents" },
      { id: "sign", label: "Sign" },
    ];
  }
  if (kind === "consult") {
    return [
      { id: "property", label: "Engagement" },
      { id: "money", label: "Commission" },
      { id: "invoice", label: "Invoice" },
      { id: "docs", label: "Documents" },
      { id: "sign", label: "Sign" },
    ];
  }
  return [
    { id: "property", label: "Property" },
    { id: "money", label: "Commission" },
    { id: "files", label: "Files" },
    { id: "sign", label: "Sign" },
  ];
}

const PROPERTY_TYPES = [
  { value: "industrial", label: "Industrial" },
  { value: "land", label: "Land" },
  { value: "office", label: "Office" },
  { value: "retail", label: "Retail" },
];

function slotCount(answers: Answers, prefix: string, total: number, minimum: number) {
  let count = minimum;
  for (let i = 1; i <= total; i += 1) {
    const hit = Object.keys(answers).some((key) => key.startsWith(`${prefix}${i}`) && answers[key]);
    if (hit) count = Math.max(count, i);
  }
  return count;
}

function dropRow(answers: Answers, set: SetAnswer, prefix: string, suffixes: string[], index: number, shown: number) {
  for (let i = index; i < shown; i += 1) {
    for (const suffix of suffixes) set(`${prefix}${i}${suffix}`, answers[`${prefix}${i + 1}${suffix}`] ?? "");
  }
  for (const suffix of suffixes) set(`${prefix}${shown}${suffix}`, "");
}

const SPLIT_FIELDS = ["Agent", "Entity", "Pct", "HasRunner", "Runner", "RunnerAmt", "Defer"];
const OUTSIDE_FIELDS = ["License", "Company", "Contact", "Address", "City", "Email", "Area", "Phone", "Corp", "Sales", "Commission"];

function PropertyBlock({
  answers,
  set,
  showType,
}: {
  answers: Answers;
  set: SetAnswer;
  showType: boolean;
}) {
  return (
    <div className="grid gap-4">
      {showType ? (
        <Choice
          label="Property type"
          value={read(answers, "propertyType")}
          onChange={(value) => set("propertyType", value)}
          options={PROPERTY_TYPES}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          className="sm:col-span-2"
          name="address"
          label="Street address"
          value={read(answers, "address")}
          onChange={(value) => set("address", value)}
        />
        <Field
          name="city"
          label="City, State, ZIP"
          value={read(answers, "city")}
          onChange={(value) => set("city", value)}
        />
        {showType ? (
          <Field
            name="propertyOther"
            label="Other type"
            value={read(answers, "propertyOther")}
            onChange={(value) => set("propertyOther", value)}
            placeholder="Flex, IOS, medical…"
          />
        ) : null}
        <Field
          name="sf"
          label="Square Feet"
          value={read(answers, "sf")}
          onChange={(value) => set("sf", value)}
          inputMode="decimal"
          format="comma"
          required
        />
      </div>
    </div>
  );
}

function FundsBlock({ answers, set }: { answers: Answers; set: SetAnswer }) {
  return (
    <div className="grid gap-4">
      <Choice
        label="Type of Funds"
        value={read(answers, "fundsType")}
        onChange={(value) => set("fundsType", value)}
        options={[
          { value: "check", label: "Check" },
          { value: "wire", label: "Wire" },
          { value: "ach", label: "ACH" },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          className="sm:col-span-2"
          name="fundsFrom"
          label="Funds Received From"
          value={read(answers, "fundsFrom")}
          onChange={(value) => set("fundsFrom", value)}
        />
        <Field
          name="amountReceived"
          label="Amount Received"
          value={read(answers, "amountReceived")}
          onChange={(value) => set("amountReceived", value)}
          inputMode="decimal"
          format="money"
        />
        <Field
          name="gross"
          label="Gross to Lee"
          value={read(answers, "gross")}
          onChange={(value) => set("gross", value)}
          inputMode="decimal"
          format="money"
          hint="House splits are a percent of this number."
        />
        <Field
          name="balance"
          label="Outstanding Balance"
          value={read(answers, "balance")}
          onChange={(value) => set("balance", value)}
          inputMode="decimal"
          format="money"
        />
        <DateField name="dueDate" label="Due Date" value={read(answers, "dueDate")} onChange={(value) => set("dueDate", value)} />
      </div>
    </div>
  );
}

function SplitsBlock({ answers, set }: { answers: Answers; set: SetAnswer }) {
  const [opened, setOpened] = useState(() => slotCount(answers, "split", 4, 1));
  const shown = Math.max(opened, slotCount(answers, "split", 4, 1));
  const percent = splitPercentTotal(answers);
  return (
    <div className="grid gap-4">
      {Number.isFinite(percent) ? (
        <p className={`text-sm ${Math.abs(percent - 100) > 0.2 ? "text-red-deep" : "text-ink-soft"}`}>
          Internal splits add up to {percent}% of Gross to Lee.
        </p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: shown }, (_, index) => {
          const n = index + 1;
          const net = splitNet(answers.gross, answers[`split${n}Pct`]);
          return (
            <div key={n} className="rounded-md border border-line bg-paper p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">Agent {n}</p>
                {n > 1 ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-red"
                    onClick={() => {
                      dropRow(answers, set, "split", SPLIT_FIELDS, n, shown);
                      setOpened(shown - 1);
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <PersonPick
                  name={`split${n}Agent`}
                  label="Agent"
                  value={read(answers, `split${n}Agent`)}
                  onChange={(value) => set(`split${n}Agent`, value)}
                />
                <Field
                  name={`split${n}Entity`}
                  label="Entity"
                  value={read(answers, `split${n}Entity`)}
                  onChange={(value) => set(`split${n}Entity`, value)}
                />
                <Field
                  name={`split${n}Pct`}
                  label="% of Gross to Lee"
                  value={read(answers, `split${n}Pct`)}
                  onChange={(value) => set(`split${n}Pct`, value)}
                  inputMode="decimal"
                  format="percent"
                />
                <div>
                  <p className="text-sm text-ink-soft">Net commission</p>
                  <p className="mt-2 text-lg font-medium tabular-nums text-ink">{net ? `$${net}` : "—"}</p>
                </div>
                <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={answers[`split${n}HasRunner`] === "1"}
                    onChange={(event) => set(`split${n}HasRunner`, event.target.checked ? "1" : "")}
                    className="size-4 accent-red"
                  />
                  Runner
                </label>
                {answers[`split${n}HasRunner`] === "1" ? (
                  <>
                    <Field
                      name={`split${n}Runner`}
                      label="Runner Name"
                      value={read(answers, `split${n}Runner`)}
                      onChange={(value) => set(`split${n}Runner`, value)}
                    />
                    <Field
                      name={`split${n}RunnerAmt`}
                      label="Runner Net Amount"
                      value={read(answers, `split${n}RunnerAmt`)}
                      onChange={(value) => set(`split${n}RunnerAmt`, value)}
                      inputMode="decimal"
                      format="money"
                    />
                  </>
                ) : null}
              </div>
              <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={answers[`split${n}Defer`] === "1"}
                  onChange={(event) => set(`split${n}Defer`, event.target.checked ? "1" : "")}
                  className="size-4 accent-red"
                />
                Defer this split
              </label>
            </div>
          );
        })}
      </div>
      {shown < 4 ? (
        <SecondaryButton onClick={() => setOpened(shown + 1)}>Add another agent</SecondaryButton>
      ) : null}
    </div>
  );
}

function ExternalBlock({ answers, set }: { answers: Answers; set: SetAnswer }) {
  const [opened, setOpened] = useState(() => slotCount(answers, "ext", 2, 1));
  const shown = Math.max(opened, slotCount(answers, "ext", 2, 1));
  return (
    <div className="grid gap-4">
      {Array.from({ length: shown }, (_, index) => {
        const n = index + 1;
        return (
          <div key={n} className="rounded-md border border-line p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">External entity {n}</p>
              {n > 1 ? (
                <button
                  type="button"
                  className="text-sm font-medium text-red"
                  onClick={() => {
                    dropRow(answers, set, "ext", OUTSIDE_FIELDS, n, shown);
                    setOpened(shown - 1);
                  }}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <Choice
              label="License"
              value={read(answers, `ext${n}License`)}
              onChange={(value) => set(`ext${n}License`, value)}
              options={[
                { value: "licensed", label: "Licensed" },
                { value: "unlicensed", label: "Unlicensed" },
              ]}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field name={`ext${n}Company`} label="Company" value={read(answers, `ext${n}Company`)} onChange={(value) => set(`ext${n}Company`, value)} />
              <Field name={`ext${n}Contact`} label="Contact" value={read(answers, `ext${n}Contact`)} onChange={(value) => set(`ext${n}Contact`, value)} />
              <Field className="sm:col-span-2" name={`ext${n}Address`} label="Address" value={read(answers, `ext${n}Address`)} onChange={(value) => set(`ext${n}Address`, value)} />
              <Field name={`ext${n}City`} label="City, State, ZIP" value={read(answers, `ext${n}City`)} onChange={(value) => set(`ext${n}City`, value)} />
              <Field name={`ext${n}Email`} label="Email" value={read(answers, `ext${n}Email`)} onChange={(value) => set(`ext${n}Email`, value)} inputMode="email" />
              <Field name={`ext${n}Area`} label="Area code" value={read(answers, `ext${n}Area`)} onChange={(value) => set(`ext${n}Area`, value)} inputMode="tel" />
              <Field name={`ext${n}Phone`} label="Phone" value={read(answers, `ext${n}Phone`)} onChange={(value) => set(`ext${n}Phone`, value)} inputMode="tel" />
              <Field name={`ext${n}Corp`} label="Corp. DRE #" value={read(answers, `ext${n}Corp`)} onChange={(value) => set(`ext${n}Corp`, value)} />
              <Field name={`ext${n}Sales`} label="Salesperson DRE #" value={read(answers, `ext${n}Sales`)} onChange={(value) => set(`ext${n}Sales`, value)} />
              <Field name={`ext${n}Commission`} label="Commission amount" value={read(answers, `ext${n}Commission`)} onChange={(value) => set(`ext${n}Commission`, value)} inputMode="decimal" />
            </div>
          </div>
        );
      })}
      {shown < 2 ? (
        <SecondaryButton onClick={() => setOpened(2)}>Add another external entity</SecondaryButton>
      ) : null}
    </div>
  );
}

let peopleRequest: Promise<InternalUser[]> | null = null;

function loadPeople() {
  peopleRequest ??= listInternalUsers().catch(() => []);
  return peopleRequest;
}

function PersonPick({
  name,
  label,
  value,
  onChange,
  onOffice,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onOffice?: (office: string) => void;
}) {
  const [people, setPeople] = useState<InternalUser[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let stop = false;
    void loadPeople().then((rows) => {
      if (!stop) setPeople(rows);
    });
    return () => {
      stop = true;
    };
  }, []);
  const query = value.trim().toLowerCase();
  const matches = query
    ? people.filter((person) => person.name.toLowerCase().includes(query)).slice(0, 8)
    : [];
  const exactOnly = matches.length === 1 && matches[0]?.name.toLowerCase() === query;

  function choose(person: InternalUser) {
    onChange(person.name);
    if (onOffice) onOffice(person.office);
    setOpen(false);
  }

  return (
    <div className="relative">
      <label className="block text-sm text-ink-soft" htmlFor={`pick-${name}`}>
        {label}
      </label>
      <input
        id={`pick-${name}`}
        value={value}
        autoComplete="off"
        placeholder="Start typing a name"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
          const exact = people.find((person) => person.name.toLowerCase() === value.trim().toLowerCase());
          if (exact) choose(exact);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && open && matches[0] && !exactOnly) {
            event.preventDefault();
            choose(matches[0]);
          }
        }}
        className="mt-1 h-11 w-full rounded-md border border-line bg-card px-3 text-sm text-ink placeholder:text-muted focus-visible:border-red focus-visible:outline-none"
      />
      {open && matches.length > 0 && !exactOnly ? (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-line bg-card shadow-sm">
          {matches.map((person) => (
            <li key={person.userId}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(person);
                }}
                className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-paper"
              >
                <span className="min-w-0 truncate">
                  {person.name}
                  {person.office ? <span className="text-muted"> · {person.office}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AgentPairs({
  answers,
  set,
  prefix,
  title,
}: {
  answers: Answers;
  set: SetAnswer;
  prefix: "list" | "proc";
  title: string;
}) {
  const [opened, setOpened] = useState(() => slotCount(answers, prefix, 3, 1));
  const shown = Math.max(opened, slotCount(answers, prefix, 3, 1));
  return (
    <div>
      <h3 className="mb-3 font-serif text-xl">{title}</h3>
      <div className="grid gap-3">
        {Array.from({ length: shown }, (_, index) => {
          const n = index + 1;
          return (
            <div key={n} className="grid gap-3 sm:grid-cols-2">
              <PersonPick
                name={`${prefix}${n}Name`}
                label={`Agent ${n}`}
                value={read(answers, `${prefix}${n}Name`)}
                onChange={(value) => set(`${prefix}${n}Name`, value)}
                onOffice={(office) => set(`${prefix}${n}Firm`, office)}
              />
              <Field name={`${prefix}${n}Firm`} label="Firm" value={read(answers, `${prefix}${n}Firm`)} onChange={(value) => set(`${prefix}${n}Firm`, value)} />
            </div>
          );
        })}
      </div>
      {shown < 3 ? (
        <SecondaryButton className="mt-3" onClick={() => setOpened(shown + 1)}>
          Add agent
        </SecondaryButton>
      ) : null}
    </div>
  );
}

function MarketingBlock({ answers, set }: { answers: Answers; set: SetAnswer }) {
  return (
    <div className="grid gap-4">
      <Checks
        answers={answers}
        onChange={set}
        items={[
          { key: "mktGift", label: "Gift basket" },
          { key: "mktPress", label: "Press release" },
          { key: "mktWeb", label: "Add to website / online resume" },
          { key: "mktSign", label: "Remove sign" },
          { key: "mktCard", label: "Postcard" },
          { key: "mktLeepro", label: "Add to LeePro transaction summary" },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="mktCriteria" label="Postcard criteria" value={read(answers, "mktCriteria")} onChange={(value) => set("mktCriteria", value)} />
        <Field name="mktRef" label="Reference contact" value={read(answers, "mktRef")} onChange={(value) => set("mktRef", value)} />
      </div>
      <Field
        name="highlights"
        label="Highlights"
        multiline
        value={read(answers, "highlights")}
        onChange={(value) => set("highlights", value)}
      />
    </div>
  );
}

function BillBlock({ answers, set }: { answers: Answers; set: SetAnswer }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field name="billName" label="Invoice name" value={read(answers, "billName")} onChange={(value) => set("billName", value)} />
      <Field name="billCompany" label="Invoice company" value={read(answers, "billCompany")} onChange={(value) => set("billCompany", value)} />
      <Field className="sm:col-span-2" name="billCity" label="Invoice city, state, ZIP" value={read(answers, "billCity")} onChange={(value) => set("billCity", value)} />
    </div>
  );
}

function SignBlock({
  answers,
  set,
  extra,
}: {
  answers: Answers;
  set: SetAnswer;
  extra?: string;
}) {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink-soft">
        I certify that the information in this voucher is true and correct to the best of my knowledge.
        {extra ? ` ${extra}` : ""} Typing a name places it on the signature line of the PDF.
      </p>
      <Field name="agentSign" label="Agent signature" value={read(answers, "agentSign")} onChange={(value) => set("agentSign", value)} />
      <Field name="comments" label="Comments" multiline value={read(answers, "comments")} onChange={(value) => set("comments", value)} />
    </div>
  );
}

function RentSchedule({ answers, set }: { answers: Answers; set: SetAnswer }) {
  const math = leaseMath(answers);
  let base = 3;
  math.rows.forEach((row, index) => {
    if (row.active) base = Math.max(base, index + 1);
  });
  const [opened, setOpened] = useState(base);
  const shown = Math.max(opened, base);
  return (
    <div className="grid gap-3">
      <p className="text-sm text-ink-soft">
        Each row prints on page 3. Subtotal is rent times months. Commission is that subtotal times the percent.
      </p>
      {Array.from({ length: shown }, (_, index) => {
        const n = index + 1;
        const row = math.rows[index];
        return (
          <div key={n} className="rounded-md border border-line p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Period {n}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <Field name={`row${n}From`} label="Mos from" value={read(answers, `row${n}From`)} onChange={(value) => set(`row${n}From`, value)} inputMode="decimal" />
              <Field name={`row${n}To`} label="Mos to" value={read(answers, `row${n}To`)} onChange={(value) => set(`row${n}To`, value)} inputMode="decimal" />
              <Field name={`row${n}Rent`} label="$ / month" value={read(answers, `row${n}Rent`)} onChange={(value) => set(`row${n}Rent`, value)} inputMode="decimal" />
              <Field name={`row${n}Months`} label="Months" value={read(answers, `row${n}Months`)} onChange={(value) => set(`row${n}Months`, value)} inputMode="decimal" />
              <Field name={`row${n}Pct`} label="%" value={read(answers, `row${n}Pct`)} onChange={(value) => set(`row${n}Pct`, value)} inputMode="decimal" />
              <div className="col-span-2 sm:col-span-1">
                <p className="text-sm text-ink-soft">Commission</p>
                <p className="mt-2 tabular-nums font-medium">{row && Number.isFinite(row.commission) ? dollars(row.commission) : "—"}</p>
                <p className="text-xs text-muted tabular-nums">
                  {row && Number.isFinite(row.subtotal) ? `${dollars(row.subtotal)} consideration` : " "}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      {shown < 10 ? (
        <SecondaryButton onClick={() => setOpened(shown + 1)}>Add rent period</SecondaryButton>
      ) : null}
      <div className="flex flex-wrap gap-6 border-t border-line pt-3">
        <p>
          <span className="block text-sm text-ink-soft">Total consideration</span>
          <span className="font-serif text-2xl tabular-nums">{math.any ? dollars(math.consideration) : "—"}</span>
        </p>
        <p>
          <span className="block text-sm text-ink-soft">Total commission</span>
          <span className="font-serif text-2xl tabular-nums">{math.any ? dollars(math.commission) : "—"}</span>
        </p>
      </div>
    </div>
  );
}

export function VoucherSection({
  packetId,
  kind,
  section,
  answers,
  set,
}: {
  packetId: string;
  kind: Kind;
  section: string;
  answers: Answers;
  set: SetAnswer;
}) {
  if (section === "property") {
    if (kind === "lease") {
      return (
        <Card eyebrow="Deal voucher" title="Lease property">
          <div className="grid gap-5">
            <Choice
              label="Transaction"
              value={read(answers, "transaction")}
              onChange={(value) => set("transaction", value)}
              options={[
                { value: "lease", label: "Lease" },
                { value: "sublease", label: "Sublease" },
                { value: "renewal", label: "Lease renewal" },
              ]}
            />
            <PropertyBlock answers={answers} set={set} showType />
          </div>
        </Card>
      );
    }
    if (kind === "consult") {
      return (
        <Card eyebrow="Deal voucher" title="Consulting/Referral">
          <div className="grid gap-5">
            <Choice
              label="Engagement"
              value={read(answers, "engagement")}
              onChange={(value) => set("engagement", value)}
              options={[
                { value: "referral", label: "Referral" },
                { value: "consulting", label: "Consulting" },
              ]}
            />
            <PropertyBlock answers={answers} set={set} showType />
          </div>
        </Card>
      );
    }
    if (kind === "additional") {
      return (
        <Card eyebrow="Additional Payment" title="Property and Parties">
          <div className="grid gap-5">
            <PropertyBlock answers={answers} set={set} showType={false} />
            <Parties
              answers={answers}
              set={set}
              left="seller"
              right="buyer"
              leftTitle="Seller / Lessor"
              rightTitle="Buyer / Lessee"
            />
          </div>
        </Card>
      );
    }
    return (
      <Card eyebrow="Deal voucher" title="Sale property">
        <div className="grid gap-5">
          <PropertyBlock answers={answers} set={set} showType />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="asking" label="Asking price" value={read(answers, "asking")} onChange={(value) => set("asking", value)} inputMode="decimal" format="money" />
            <Field name="price" label="Purchase price" value={read(answers, "price")} onChange={(value) => set("price", value)} inputMode="decimal" format="money" />
            <Field
              name="capRate"
              label="Cap rate"
              value={read(answers, "capRate")}
              onChange={(value) => set("capRate", value)}
              inputMode="decimal"
              format="percent"
              placeholder="6.5"
            />
            <DateField name="closeDate" label="Close of escrow" value={read(answers, "closeDate")} onChange={(value) => set("closeDate", value)} />
            <Choice
              label="Buyer type"
              required
              value={read(answers, "buyerType")}
              onChange={(value) => set("buyerType", value)}
              options={[
                { value: "user", label: "User" },
                { value: "investor", label: "Investor" },
              ]}
            />
          </div>
          <Field name="saleNotes" label="Sale comments" multiline value={read(answers, "saleNotes")} onChange={(value) => set("saleNotes", value)} />
        </div>
      </Card>
    );
  }

  if (section === "terms" && kind === "lease") {
    return (
      <div className="grid gap-4">
        <Card title="Parties">
          <div className="grid gap-5">
            <Parties answers={answers} set={set} left="lessor" right="lessee" leftTitle="Lessor" rightTitle="Lessee" />
            <Choice
              label="Lee represented"
              value={read(answers, "represented")}
              onChange={(value) => set("represented", value)}
              options={[
                { value: "lessor", label: "Lessor" },
                { value: "lessee", label: "Lessee" },
                { value: "both", label: "Both" },
              ]}
            />
          </div>
        </Card>
        <Card title="Lease economics">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 sm:col-span-2">
              <DateField
                name="leaseFrom"
                label="Lease term"
                value={read(answers, "leaseFrom")}
                onChange={(value) => {
                  const through = read(answers, "leaseThrough");
                  set("leaseFrom", value);
                  set("leaseTerm", value && through ? `${value} – ${through}` : value || through);
                  set("termMos", termMonths(value, through));
                }}
              />
              <span className="pb-3 text-sm text-muted" aria-hidden="true">
                –
              </span>
              <DateField
                name="leaseThrough"
                label="Through"
                value={read(answers, "leaseThrough")}
                onChange={(value) => {
                  const from = read(answers, "leaseFrom");
                  set("leaseThrough", value);
                  set("leaseTerm", from && value ? `${from} – ${value}` : from || value);
                  set("termMos", termMonths(from, value));
                }}
              />
            </div>
            <DateField name="executionDate" label="Execution date" value={read(answers, "executionDate")} onChange={(value) => set("executionDate", value)} />
            <Field name="termMos" label="Term (months)" value={read(answers, "termMos")} readOnly hint="From the lease term" />
            <RateKind name="askingType" label="Asking rate" rateName="askingRate" rate={read(answers, "askingRate")} kind={read(answers, "askingType")} onRate={(value) => set("askingRate", value)} onKind={(value) => set("askingType", value)} />
            <RateKind name="leaseType" label="Lease rate" rateName="leaseRate" rate={read(answers, "leaseRate")} kind={read(answers, "leaseType")} onRate={(value) => set("leaseRate", value)} onKind={(value) => set("leaseType", value)} />
            <Field name="effectiveRate" label="Effective rate" value={read(answers, "effectiveRate")} onChange={(value) => set("effectiveRate", value)} />
            <Field name="considerationNote" label="Total consideration note" value={read(answers, "considerationNote")} onChange={(value) => set("considerationNote", value)} />
            <Field name="ti" label="TI allowance" value={read(answers, "ti")} onChange={(value) => set("ti", value)} />
            <Field name="leaseOption" label="Lease option terms" value={read(answers, "leaseOption")} onChange={(value) => set("leaseOption", value)} />
            <Field name="purchaseOption" label="Purchase option terms" value={read(answers, "purchaseOption")} onChange={(value) => set("purchaseOption", value)} />
            <Field name="exerciseLeft" label="Exercise time frame" value={read(answers, "exerciseLeft")} onChange={(value) => set("exerciseLeft", value)} />
            <Field name="freeRent" label="Free rent" value={read(answers, "freeRent")} onChange={(value) => set("freeRent", value)} />
            <Field className="sm:col-span-2" name="nnn" label="NNN / CAM charges" value={read(answers, "nnn")} onChange={(value) => set("nnn", value)} />
          </div>
        </Card>
        <Card title="Escalations">
          <div className="grid gap-3">
            {Array.from({ length: 5 }, (_, index) => {
              const n = index + 1;
              return (
                <div key={n} className="grid gap-3 sm:grid-cols-3">
                  <Field name={`esc${n}Period`} label={`Period ${n}`} value={read(answers, `esc${n}Period`)} onChange={(value) => set(`esc${n}Period`, value)} />
                  <Field name={`esc${n}Psf`} label="Rate PSF" value={read(answers, `esc${n}Psf`)} onChange={(value) => set(`esc${n}Psf`, value)} />
                  <Field name={`esc${n}Type`} label="Rate type" value={read(answers, `esc${n}Type`)} onChange={(value) => set(`esc${n}Type`, value)} />
                </div>
              );
            })}
            <Field name="escNotes" label="Escalation comments" multiline value={read(answers, "escNotes")} onChange={(value) => set("escNotes", value)} />
          </div>
        </Card>
      </div>
    );
  }

  if (section === "docs" || section === "files") {
    return <FilesPanel packetId={packetId} kind={kind} answers={answers} set={set} />;
  }

  if (section === "agents") {
    if (kind === "sale") {
      return (
        <div className="grid gap-4">
          <Card title="Seller and buyer">
            <Parties answers={answers} set={set} left="seller" right="buyer" leftTitle="Seller" rightTitle="Buyer" />
          </Card>
          <Card title="Brokers">
            <div className="grid gap-6 lg:grid-cols-2">
              <AgentPairs answers={answers} set={set} prefix="list" title="Listing agents" />
              <AgentPairs answers={answers} set={set} prefix="proc" title="Procuring agents" />
            </div>
          </Card>
        </div>
      );
    }
    return (
      <Card title="Listing and procuring">
        <div className="grid gap-6 lg:grid-cols-2">
          <AgentPairs answers={answers} set={set} prefix="list" title="Listing agents" />
          <AgentPairs answers={answers} set={set} prefix="proc" title="Procuring agents" />
        </div>
      </Card>
    );
  }

  if (section === "money") {
    return (
      <div className="grid gap-4">
        <Card title="Funds Received">
          <FundsBlock answers={answers} set={set} />
        </Card>
        <Card title="Internal distribution">
          <SplitsBlock answers={answers} set={set} />
        </Card>
        <Card title="External entity">
          <ExternalBlock answers={answers} set={set} />
        </Card>
        {kind === "consult" ? (
          <Card title="Distribution note">
            <Field name="sideComment" label="Comment on the commission page" value={read(answers, "sideComment")} onChange={(value) => set("sideComment", value)} />
          </Card>
        ) : null}
      </div>
    );
  }

  if (section === "invoice") {
    return (
      <div className="grid gap-4">
        {kind === "lease" ? (
          <Card title="Total consideration" eyebrow="Page 3 of the lease voucher">
            <RentSchedule answers={answers} set={set} />
          </Card>
        ) : null}
        <Card title="Who to invoice">
          <div className="grid gap-4">
            <Choice
              label="Send an invoice?"
              value={read(answers, "invoice")}
              onChange={(value) => set("invoice", value)}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
            />
            {answers.invoice === "yes" || kind !== "consult" ? <BillBlock answers={answers} set={set} /> : null}
          </div>
        </Card>
        {kind === "lease" || kind === "sale" ? (
          <Card title="Marketing">
            <MarketingBlock answers={answers} set={set} />
          </Card>
        ) : null}
      </div>
    );
  }

  return (
    <Card title="Certify and sign">
      <SignBlock
        answers={answers}
        set={set}
        extra={
          kind === "additional"
            ? undefined
            : "The required backup items marked on the checklist are included in sequential order."
        }
      />
    </Card>
  );
}

function RateKind({
  name,
  label,
  rateName,
  rate,
  kind,
  onRate,
  onKind,
}: {
  name: string;
  label: string;
  rateName: string;
  rate: string;
  kind: string;
  onRate: (value: string) => void;
  onKind: (value: string) => void;
}) {
  const selected = kind === "GRS" || kind === "NNN" ? kind : "";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-end gap-2 sm:col-span-2">
      <Field name={rateName} label={label} value={rate} onChange={onRate} />
      <label className="block">
        <span className="text-sm text-ink-soft">GRS or NNN</span>
        <select
          name={name}
          value={selected}
          onChange={(event) => onKind(event.target.value)}
          className="mt-1 h-11 w-full rounded-md border border-line bg-card px-2 text-sm text-ink focus-visible:border-red focus-visible:outline-none"
        >
          <option value="">Select</option>
          <option value="GRS">GRS</option>
          <option value="NNN">NNN</option>
        </select>
      </label>
    </div>
  );
}

function Parties({
  answers,
  set,
  left,
  right,
  leftTitle,
  rightTitle,
}: {
  answers: Answers;
  set: SetAnswer;
  left: string;
  right: string;
  leftTitle: string;
  rightTitle: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Party answers={answers} set={set} prefix={left} title={leftTitle} />
      <Party answers={answers} set={set} prefix={right} title={rightTitle} />
    </div>
  );
}

function Party({
  answers,
  set,
  prefix,
  title,
}: {
  answers: Answers;
  set: SetAnswer;
  prefix: string;
  title: string;
}) {
  const nameKey = prefix;
  const contactKey = `${prefix}Contact`;
  return (
    <div className="grid gap-3 rounded-md border border-line p-3">
      <h3 className="font-serif text-xl">{title}</h3>
      <Field name={nameKey} label="Name" value={read(answers, nameKey)} onChange={(value) => set(nameKey, value)} />
      <Field name={contactKey} label="Contact" value={read(answers, contactKey)} onChange={(value) => set(contactKey, value)} />
    </div>
  );
}
