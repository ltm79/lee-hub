import { useState } from "react";
import { deleteMarketPoint, importMarketPoints, saveMarketPoint } from "@/lib/market.functions";
import { MARKET_TEMPLATE, parseMarketSheet } from "@/lib/market.excel";
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
  const [draft, setDraft] = useState<MarketInput | null>(null);
  const [preview, setPreview] = useState<MarketInput[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function readFile(file: File) {
    setMessage("");
    const parsed = parseMarketSheet(await file.arrayBuffer());
    setPreview(parsed.rows);
    setMessage(parsed.errors[0] ?? `${parsed.rows.length} rows ready. Import replaces the same market, place, and quarter.`);
  }

  async function commit() {
    setBusy(true);
    const result = await importMarketPoints({ data: { rows: preview } }).catch(() => ({ ok: false as const, error: "The sheet could not be imported." }));
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setPreview([]);
    setMessage(`Imported ${result.saved} rows.`);
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
      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">Import a sheet</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Use Excel or CSV. Rates are percents (5.8, not 0.058) and rent is dollars per square foot (1.40). Leave Submarket and City blank for a market total. A blank cell clears that figure.
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
          {preview.length ? (
            <button type="button" disabled={busy} onClick={() => void commit()} className="h-10 rounded-md bg-deep px-4 text-sm font-semibold text-white disabled:opacity-60">
              Import {preview.length} rows
            </button>
          ) : null}
          <button type="button" onClick={() => setDraft(emptyPoint(rows[0]?.market ?? "San Gabriel Valley"))} className="h-10 rounded-md border border-line px-4 text-sm font-semibold">
            Add a quarter
          </button>
        </div>
        {message ? <p className="mt-3 text-sm text-ink-soft">{message}</p> : null}
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
