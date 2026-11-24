import { useState } from "react";
import { deleteMarketPoint, importMarketPoints, saveMarketPoint } from "@/lib/market.functions";
import { MARKET_TEMPLATE, asQuarterTotal } from "@/lib/market.excel";
import { readMarketUpload } from "@/lib/market.upload";
import { SUBMARKETS } from "@/lib/market.places";
import { periodLabel } from "@/lib/market.metrics";
import { MARKET_FIELDS, type MarketInput, type MarketPoint } from "@/lib/market.types";

function emptyPoint(market = ""): MarketInput {
  return {
    market,
    submarket: "",
    city: "",
    year: new Date().getFullYear(),
    quarter: Math.floor(new Date().getMonth() / 3) + 1,
    inventorySf: null,
    vacancyRate: null,
    availabilityRate: null,
    askingRent: null,
    directRent: null,
    leasingSf: null,
    absorptionSf: null,
    underConstructionSf: null,
    completionsSf: null,
    salePricePsf: null,
    capRate: null,
    salesVolume: null,
    salesSf: null,
    transactions: null,
    buildings: null,
    vacantSf: null,
    subletSf: null,
    availableSf: null,
    notes: "",
  };
}

function fromPoint(point: MarketPoint): MarketInput {
  return { ...point };
}

export function MarketData({ rows, onChanged }: { rows: MarketPoint[]; onChanged: () => void }) {
  const now = new Date();
  const [draft, setDraft] = useState<MarketInput | null>(null);
  const [uploadRows, setUploadRows] = useState<MarketInput[]>([]);
  const [dated, setDated] = useState(false);
  const [fromBulk, setFromBulk] = useState(false);
  const [submarket, setSubmarket] = useState<string>(SUBMARKETS[1]);
  const [city, setCity] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [replace, setReplace] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  function knownPlace(row: MarketInput) {
    return SUBMARKETS.find((name) => name.toLowerCase() === row.market.trim().toLowerCase() || name.toLowerCase() === row.submarket.trim().toLowerCase());
  }
  const ready = uploadRows.map((row) => {
    const place = knownPlace(row) ?? submarket;
    const when = dated && row.year >= 1990 && row.quarter >= 1 && row.quarter <= 4 ? { year: row.year, quarter: row.quarter } : { year, quarter };
    return asQuarterTotal(row, { submarket: place, city: city.trim() || row.city, year: when.year, quarter: when.quarter }, row.source === "pdf" ? "pdf" : "excel");
  });
  const fileHasPlaces = uploadRows.length > 0 && uploadRows.every((row) => knownPlace(row));
  const clashes = ready.filter((row) =>
    rows.some((saved) => saved.market === row.market && saved.submarket === "" && saved.city === row.city && saved.year === row.year && saved.quarter === row.quarter),
  );

  function setField(key: keyof MarketInput, value: string) {
    setDraft((current) => {
      if (!current) return current;
      if (key === "market" || key === "submarket" || key === "city" || key === "notes") return { ...current, [key]: value };
      if (key === "year" || key === "quarter") return { ...current, [key]: Number(value) };
      const amount = value.trim() === "" ? null : Number(value.replace(/[$,%\s,]/g, ""));
      return { ...current, [key]: amount != null && Number.isFinite(amount) ? amount : null };
    });
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setMessage("");
    const result = await saveMarketPoint({ data: draft }).catch(() => ({ ok: false as const, error: "The figure could not be saved." }));
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setDraft(null);
    setMessage("Saved.");
    onChanged();
  }

  async function remove(id: string) {
    setBusy(true);
    const result = await deleteMarketPoint({ data: { id } }).catch(() => ({ ok: false as const, error: "The row could not be deleted." }));
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    if (draft?.id === id) setDraft(null);
    onChanged();
  }

  async function readQuarterFile(file: File) {
    setFromBulk(false);
    await loadUpload(file);
  }

  async function readFile(file: File) {
    setFromBulk(true);
    await loadUpload(file);
  }

  async function loadUpload(file: File) {
    setMessage("");
    setUploadRows([]);
    setDated(false);
    setReplace(false);
    const result = await readMarketUpload(file).catch(() => ({
      rows: [] as MarketInput[],
      dated: false,
      note: "That file could not be read.",
    }));
    if (!result.rows.length) {
      setMessage(result.note || "No figures were found in that file.");
      return;
    }
    const known = result.rows.map((row) => SUBMARKETS.find((name) => name.toLowerCase() === row.market.trim().toLowerCase())).find(Boolean);
    if (known) setSubmarket(known);
    const first = result.rows[0];
    if (!result.dated && first) {
      if (first.year >= 1990 && first.year <= 2100) setYear(first.year);
      if (first.quarter >= 1 && first.quarter <= 4) setQuarter(first.quarter);
    }
    setDated(result.dated);
    setUploadRows(result.rows);
    setMessage(result.note);
  }

  async function saveQuarter() {
    if (!ready.length) return;
    if (ready.some((row) => !row.market)) {
      setMessage("Choose a submarket.");
      return;
    }
    if (ready.some((row) => row.quarter < 1 || row.quarter > 4 || row.year < 1990)) {
      setMessage("Choose a year and a quarter from 1 to 4.");
      return;
    }
    setBusy(true);
    const result = await importMarketPoints({ data: { rows: ready, replace } }).catch(() => ({
      ok: false as const,
      error: "The quarters could not be saved.",
    }));
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setUploadRows([]);
    setDated(false);
    setReplace(false);
    const skipped = result.skipped ? ` ${result.skipped} already saved ${result.skipped === 1 ? "quarter was" : "quarters were"} left as-is.` : "";
    setMessage(replace ? `Replaced ${result.saved} ${result.saved === 1 ? "quarter" : "quarters"}.${skipped}` : `Saved ${result.saved} ${result.saved === 1 ? "quarter" : "quarters"}.${skipped}`);
    onChanged();
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([MARKET_TEMPLATE], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "lee-market-insight-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-4 grid gap-4">
      <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <h2 className="text-sm font-semibold text-ink">Add a quarter</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Upload Excel or a PDF. If the file labels its quarters, those quarters are kept. If it does not, choose the year and quarter afterward. Older quarters stay unless you check replace.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex h-10 cursor-pointer items-center rounded-md bg-ink px-4 text-sm font-semibold text-white">
            Upload Excel or PDF
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.pdf,application/pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readQuarterFile(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        {message && !fromBulk ? <p className="mt-3 text-sm text-ink-soft">{message}</p> : null}
        {uploadRows.length && !fromBulk ? (
          <>
            {!dated && uploadRows[0] ? (
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {MARKET_FIELDS.filter(([key]) => uploadRows[0]?.[key] != null).map(([key, label]) => (
                  <div key={key} className="rounded-lg bg-paper px-3 py-2">
                    <dt className="text-[11px] text-muted">{label}</dt>
                    <dd className="text-sm font-semibold tabular-nums text-ink">{String(uploadRows[0]?.[key])}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <ul className="mt-4 grid gap-2">
                {ready.slice(0, 8).map((row) => (
                  <li key={`${row.market}-${row.city}-${row.year}-${row.quarter}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-paper px-3 py-2 text-sm">
                    <span className="font-semibold text-ink">Q{row.quarter} {row.year} · {row.city || row.market}</span>
                    <span className="tabular-nums text-muted">{row.vacancyRate == null ? "—" : `${row.vacancyRate}%`} vacancy · {row.askingRent == null ? "—" : `$${row.askingRent}`}</span>
                  </li>
                ))}
                {ready.length > 8 ? <li className="px-3 text-sm text-muted">and {ready.length - 8} more quarters</li> : null}
              </ul>
            )}
            <div className={`mt-4 grid gap-3 sm:grid-cols-2 ${dated ? "" : "lg:grid-cols-4"}`}>
              {fileHasPlaces ? null : (
                <label className="grid gap-1 text-xs font-medium text-muted">
                  Submarket
                  <select value={submarket} onChange={(event) => { setSubmarket(event.target.value); setReplace(false); }} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink">
                    {SUBMARKETS.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </label>
              )}
              {uploadRows.some((row) => row.city) ? null : (
                <label className="grid gap-1 text-xs font-medium text-muted">
                  City, optional
                  <input value={city} onChange={(event) => { setCity(event.target.value); setReplace(false); }} placeholder="Blank saves the submarket total" className="h-10 rounded-md border border-line px-3 text-sm text-ink" />
                </label>
              )}
              {dated ? null : (
                <>
                  <label className="grid gap-1 text-xs font-medium text-muted">
                    Year
                    <input value={year} onChange={(event) => { setYear(Number(event.target.value)); setReplace(false); }} inputMode="numeric" className="h-10 rounded-md border border-line px-3 text-sm text-ink" />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-muted">
                    Quarter
                    <select value={quarter} onChange={(event) => { setQuarter(Number(event.target.value)); setReplace(false); }} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink">
                      {[1, 2, 3, 4].map((item) => (
                        <option key={item} value={item}>Q{item}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            <p className="mt-3 text-sm text-ink-soft">
              {dated
                ? `${ready.length} ${ready.length === 1 ? "quarter" : "quarters"} found in the file.`
                : `This adds Q${quarter} ${year} for ${city.trim() || submarket}.`}
              {clashes.length ? ` ${clashes.length === 1 ? "One quarter is" : `${clashes.length} quarters are`} already saved and will be left as-is unless you check replace.` : ""}
            </p>
            {clashes.length ? (
              <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-medium text-ink">
                <input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} className="size-5 accent-crimson" />
                Replace the {clashes.length === 1 ? "quarter" : "quarters"} already saved
              </label>
            ) : null}
            <button type="button" disabled={busy} onClick={() => void saveQuarter()} className="mt-3 h-10 rounded-md bg-deep px-4 text-sm font-semibold text-white disabled:opacity-60">
              {clashes.length && replace ? `Replace ${clashes.length === 1 ? "this quarter" : "these quarters"}` : `Save ${ready.length === 1 ? "this quarter" : `${ready.length} quarters`}`}
            </button>
          </>
        ) : null}
      </section>
      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">Bulk sheet</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Choose the Excel file. If it does not name a submarket, tag it below, then press Save. Quarters already saved stay unless you check replace.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex h-10 cursor-pointer items-center rounded-md bg-ink px-4 text-sm font-semibold text-white">
            Choose file
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
                event.target.value = "";
              }}
            />
          </label>
          <button type="button" onClick={downloadTemplate} className="h-10 rounded-md border border-line px-4 text-sm font-semibold">
            Download template
          </button>
          <button type="button" onClick={() => setDraft(emptyPoint(rows[0]?.market ?? "San Gabriel Valley"))} className="h-10 rounded-md border border-line px-4 text-sm font-semibold">
            Add a quarter
          </button>
        </div>
        {message && fromBulk ? <p className="mt-3 text-sm text-ink-soft">{message}</p> : null}
        {uploadRows.length && fromBulk ? (
          <>
            <ul className="mt-4 grid gap-2">
              {ready.slice(0, 8).map((row) => (
                <li key={`${row.market}-${row.city}-${row.year}-${row.quarter}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-paper px-3 py-2 text-sm">
                  <span className="font-semibold text-ink">Q{row.quarter} {row.year}{row.city || row.market ? ` · ${row.city || row.market}` : ""}</span>
                  <span className="tabular-nums text-muted">{row.vacancyRate == null ? "—" : `${row.vacancyRate}%`} vacancy · {row.askingRent == null ? "—" : `$${row.askingRent}`}</span>
                </li>
              ))}
              {ready.length > 8 ? <li className="px-3 text-sm text-muted">and {ready.length - 8} more quarters</li> : null}
            </ul>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {fileHasPlaces ? null : (
                <label className="grid gap-1 text-xs font-medium text-muted">
                  Tag to submarket
                  <select value={submarket} onChange={(event) => { setSubmarket(event.target.value); setReplace(false); }} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink">
                    {SUBMARKETS.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </label>
              )}
              {uploadRows.some((row) => row.city) ? null : (
                <label className="grid gap-1 text-xs font-medium text-muted">
                  City, optional
                  <input value={city} onChange={(event) => { setCity(event.target.value); setReplace(false); }} placeholder="Blank saves the submarket total" className="h-10 rounded-md border border-line px-3 text-sm text-ink" />
                </label>
              )}
            </div>
            <p className="mt-3 text-sm text-ink-soft">
              {`${ready.length} ${ready.length === 1 ? "quarter" : "quarters"} will be saved to ${city.trim() || submarket}.`}
              {clashes.length ? ` ${clashes.length === 1 ? "One quarter is" : `${clashes.length} quarters are`} already saved and will be left as-is unless you check replace.` : ""}
            </p>
            {clashes.length ? (
              <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-medium text-ink">
                <input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} className="size-5 accent-crimson" />
                Replace the {clashes.length === 1 ? "quarter" : "quarters"} already saved
              </label>
            ) : null}
            <button type="button" disabled={busy} onClick={() => void saveQuarter()} className="mt-3 h-10 rounded-md bg-deep px-4 text-sm font-semibold text-white disabled:opacity-60">
              {`Save ${ready.length} ${ready.length === 1 ? "quarter" : "quarters"}`}
            </button>
          </>
        ) : null}
      </section>

      {draft ? (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">{draft.id ? "Correct this quarter" : "New quarter"}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(["market", "submarket", "city"] as const).map((key) => (
              <label key={key} className="grid gap-1 text-xs font-medium text-muted">
                {key[0]?.toUpperCase()}
                {key.slice(1)}
                <input value={draft[key]} onChange={(event) => setField(key, event.target.value)} className="h-10 rounded-md border border-line px-3 text-sm text-ink" />
              </label>
            ))}
            <label className="grid gap-1 text-xs font-medium text-muted">
              Year
              <input value={draft.year || ""} onChange={(event) => setField("year", event.target.value)} inputMode="numeric" className="h-10 rounded-md border border-line px-3 text-sm text-ink" />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted">
              Quarter
              <input value={draft.quarter || ""} onChange={(event) => setField("quarter", event.target.value)} inputMode="numeric" className="h-10 rounded-md border border-line px-3 text-sm text-ink" />
            </label>
            {MARKET_FIELDS.map(([key, label]) => (
              <label key={key} className="grid gap-1 text-xs font-medium text-muted">
                {label}
                <input
                  value={draft[key] ?? ""}
                  onChange={(event) => setField(key, event.target.value)}
                  inputMode="decimal"
                  className="h-10 rounded-md border border-line px-3 text-sm text-ink"
                />
              </label>
            ))}
            <label className="grid gap-1 text-xs font-medium text-muted sm:col-span-2">
              Note
              <input value={draft.notes} onChange={(event) => setField("notes", event.target.value)} className="h-10 rounded-md border border-line px-3 text-sm text-ink" />
            </label>
          </div>
          <div className="mt-4 flex gap-3">
            <button type="button" disabled={busy} onClick={() => void save()} className="h-10 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-60">
              Save
            </button>
            <button type="button" onClick={() => setDraft(null)} className="h-10 rounded-md border border-line px-4 text-sm font-semibold">
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-muted">
            <tr>
              {["Quarter", "Market", "Submarket", "City", "Vacancy", "Rent", "Absorption", "Note", ""].map((label) => (
                <th key={label || "actions"} className="px-3 py-3 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="px-3 py-2 font-medium">{periodLabel(row.year, row.quarter)}</td>
                <td className="px-3 py-2">{row.market}</td>
                <td className="px-3 py-2">{row.submarket || "—"}</td>
                <td className="px-3 py-2">{row.city || "—"}</td>
                <td className="px-3 py-2 tabular-nums">{row.vacancyRate == null ? "—" : `${row.vacancyRate}%`}</td>
                <td className="px-3 py-2 tabular-nums">{row.askingRent == null ? "—" : `$${row.askingRent}`}</td>
                <td className="px-3 py-2 tabular-nums">{row.absorptionSf == null ? "—" : row.absorptionSf.toLocaleString()}</td>
                <td className="max-w-56 truncate px-3 py-2 text-muted">{row.notes}</td>
                <td className="px-3 py-2 text-right">
                  <button type="button" onClick={() => setDraft(fromPoint(row))} className="font-semibold text-ink">
                    Edit
                  </button>
                  <button type="button" onClick={() => void remove(row.id)} className="ml-3 font-semibold text-deep">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
