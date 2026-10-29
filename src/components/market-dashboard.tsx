import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MarketData } from "@/components/market-data";
import { listMarket } from "@/lib/market.functions";
import {
  change,
  compactSf,
  deltaText,
  deltaTone,
  dollars,
  findPoint,
  fullSf,
  percent,
  periodLabel,
  placeName,
  placesFor,
  price,
  priorPeriod,
  quarterName,
  rent,
  resolveSeries,
} from "@/lib/market.metrics";
import type { MarketField, MarketPoint } from "@/lib/market.types";

const TABS = ["Overview", "Vacancy", "Rent", "Leasing", "Construction", "Sales", "Places", "Data"] as const;
type Tab = (typeof TABS)[number];

const CRIMSON = "#cd163f";
const TEAL = "#1a6b74";
const SAND = "#8a5a2b";

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-widest text-muted">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-md border border-line bg-surface px-3 text-sm font-medium normal-case tracking-normal text-ink"
      >
        {options.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Kpi({
  label,
  value,
  field,
  qoq,
  yoy,
}: {
  label: string;
  value: string;
  field: MarketField;
  qoq: number | null;
  yoy: number | null;
}) {
  return (
    <article className="rounded-lg border border-line bg-surface px-4 py-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-2 font-serif text-4xl tracking-tight text-ink">{value}</p>
      <p className="mt-3 flex gap-3 text-xs font-semibold">
        <span className={deltaTone(field, yoy)}>YoY {deltaText(yoy) || "—"}</span>
        <span className={deltaTone(field, qoq)}>QoQ {deltaText(qoq) || "—"}</span>
      </p>
    </article>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4 shadow-card">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-3 h-64">{children}</div>
    </section>
  );
}

function axis(value: number) {
  return compactSf(value).replace(" SF", "");
}

export function MarketInsight({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<MarketPoint[] | null>(null);
  const [error, setError] = useState("");
  const [market, setMarket] = useState("");
  const [submarket, setSubmarket] = useState("");
  const [city, setCity] = useState("");
  const [period, setPeriod] = useState("");
  const [tab, setTab] = useState<Tab>("Overview");

  function reload() {
    void listMarket()
      .then((result) => {
        if (!result.ok) {
          setError(result.error);
          setRows([]);
          return;
        }
        setError("");
        setRows(result.rows);
      })
      .catch(() => {
        setError("Market Insight could not be loaded.");
        setRows([]);
      });
  }

  useEffect(() => {
    reload();
  }, []);

  const markets = useMemo(() => [...new Set((rows ?? []).map((row) => row.market))].sort(), [rows]);
  const chosenMarket = markets.includes(market) ? market : (markets[0] ?? "");
  const submarkets = useMemo(
    () => [...new Set((rows ?? []).filter((row) => row.market === chosenMarket && row.submarket).map((row) => row.submarket))].sort(),
    [rows, chosenMarket],
  );
  const chosenSub = submarkets.includes(submarket) ? submarket : "";
  const cities = useMemo(
    () =>
      [
        ...new Set(
          (rows ?? [])
            .filter((row) => row.market === chosenMarket && row.city && (!chosenSub || row.submarket === chosenSub))
            .map((row) => row.city),
        ),
      ].sort(),
    [rows, chosenMarket, chosenSub],
  );
  const chosenCity = cities.includes(city) ? city : "";
  const series = useMemo(
    () => resolveSeries(rows ?? [], chosenMarket, chosenSub, chosenCity),
    [rows, chosenMarket, chosenSub, chosenCity],
  );
  const periods = [...series.points].reverse();
  const chosenPeriod = periods.find((point) => periodLabel(point.year, point.quarter) === period) ?? periods[0] ?? null;
  const priorQ = chosenPeriod ? findPoint(series.points, priorPeriod(chosenPeriod.year, chosenPeriod.quarter, 1).year, priorPeriod(chosenPeriod.year, chosenPeriod.quarter, 1).quarter) : null;
  const priorY = chosenPeriod ? findPoint(series.points, priorPeriod(chosenPeriod.year, chosenPeriod.quarter, 4).year, priorPeriod(chosenPeriod.year, chosenPeriod.quarter, 4).quarter) : null;
  const qoqOf = (field: MarketField) => change(chosenPeriod?.[field] ?? null, priorQ?.[field] ?? null);
  const yoyOf = (field: MarketField) => change(chosenPeriod?.[field] ?? null, priorY?.[field] ?? null);
  const chartRows = series.points.map((point) => ({
    label: periodLabel(point.year, point.quarter),
    vacancy: point.vacancyRate,
    availability: point.availabilityRate,
    rent: point.askingRent,
    direct: point.directRent,
    leasing: point.leasingSf,
    absorption: point.absorptionSf,
    construction: point.underConstructionSf,
    completions: point.completionsSf,
    price: point.salePricePsf,
    cap: point.capRate,
    sales: point.salesSf,
  }));
  const places = chosenPeriod ? placesFor(rows ?? [], chosenMarket, chosenSub, chosenPeriod.year, chosenPeriod.quarter) : [];
  const placeTitle = chosenCity || chosenSub || chosenMarket || "Industrial";

  if (!rows) return <p className="text-sm text-muted">Opening Market Insight…</p>;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-deep">Market Insight</p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight text-ink">{placeTitle}</h1>
          <p className="mt-1 text-sm text-muted">
            Industrial
            {chosenPeriod ? ` · ${quarterName(chosenPeriod.quarter)} quarter ${chosenPeriod.year}` : ""}
            {series.rolled ? " · Added up from the places underneath" : ""}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Select
            label="Market"
            value={chosenMarket}
            options={markets.map((name) => ({ value: name, label: name }))}
            onChange={(value) => {
              setMarket(value);
              setSubmarket("");
              setCity("");
            }}
          />
          <Select
            label="Submarket"
            value={chosenSub}
            options={[{ value: "", label: "All" }, ...submarkets.map((name) => ({ value: name, label: name }))]}
            onChange={(value) => {
              setSubmarket(value);
              setCity("");
            }}
          />
          <Select
            label="City"
            value={chosenCity}
            options={[{ value: "", label: "All" }, ...cities.map((name) => ({ value: name, label: name }))]}
            onChange={setCity}
          />
          <Select
            label="Quarter"
            value={chosenPeriod ? periodLabel(chosenPeriod.year, chosenPeriod.quarter) : ""}
            options={periods.map((point) => {
              const label = periodLabel(point.year, point.quarter);
              return { value: label, label };
            })}
            onChange={setPeriod}
          />
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-red-deep">{error}</p> : null}
      {!chosenPeriod ? (
        <p className="mt-8 text-sm text-muted">
          No industrial figures yet. An administrator can import an Excel sheet from the Data tab.
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Overall vacancy" value={percent(chosenPeriod.vacancyRate)} field="vacancyRate" qoq={qoqOf("vacancyRate")} yoy={yoyOf("vacancyRate")} />
            <Kpi label="Asking lease rate NNN" value={rent(chosenPeriod.askingRent)} field="askingRent" qoq={qoqOf("askingRent")} yoy={yoyOf("askingRent")} />
            <Kpi label="Leasing activity" value={compactSf(chosenPeriod.leasingSf)} field="leasingSf" qoq={qoqOf("leasingSf")} yoy={yoyOf("leasingSf")} />
            <Kpi label="Under construction" value={compactSf(chosenPeriod.underConstructionSf)} field="underConstructionSf" qoq={qoqOf("underConstructionSf")} yoy={yoyOf("underConstructionSf")} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Inventory", compactSf(chosenPeriod.inventorySf)],
              ["Net absorption", compactSf(chosenPeriod.absorptionSf)],
              ["Availability", percent(chosenPeriod.availabilityRate)],
              ["Sale price", price(chosenPeriod.salePricePsf)],
              ["Cap rate", percent(chosenPeriod.capRate)],
              ["Sales activity", compactSf(chosenPeriod.salesSf)],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface px-3 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{value}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.filter((item) => item !== "Data" || isAdmin).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={
              tab === item
                ? "shrink-0 border-b-2 border-deep px-3 py-2 text-sm font-semibold text-deep"
                : "shrink-0 px-3 py-2 text-sm font-medium text-muted hover:text-ink"
            }
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Data" && isAdmin ? (
        <MarketData rows={rows} onChanged={reload} />
      ) : !chosenPeriod ? null : tab === "Overview" ? (
        <Overview
          current={chosenPeriod}
          priorQ={priorQ}
          priorY={priorY}
          chartRows={chartRows}
          qoqOf={qoqOf}
          yoyOf={yoyOf}
        />
      ) : tab === "Places" ? (
        <Places places={places} />
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {tab === "Vacancy" ? (
            <>
              <TimeChart title="Vacancy and availability" rows={chartRows} lines={[{ key: "vacancy", name: "Vacancy %", color: CRIMSON }, { key: "availability", name: "Availability %", color: TEAL }]} />
              <TimeChart title="Leasing versus absorption" rows={chartRows} bars={[{ key: "leasing", name: "Leasing SF", color: TEAL }, { key: "absorption", name: "Absorption SF", color: CRIMSON }]} sf />
            </>
          ) : null}
          {tab === "Rent" ? (
            <TimeChart title="Asking and direct rent" rows={chartRows} lines={[{ key: "rent", name: "Asking NNN", color: CRIMSON }, { key: "direct", name: "Direct", color: TEAL }]} money />
          ) : null}
          {tab === "Leasing" ? (
            <TimeChart title="Leasing activity and net absorption" rows={chartRows} bars={[{ key: "leasing", name: "Leasing SF", color: TEAL }, { key: "absorption", name: "Net absorption", color: CRIMSON }]} sf />
          ) : null}
          {tab === "Construction" ? (
            <TimeChart title="Under construction and completions" rows={chartRows} bars={[{ key: "completions", name: "Completions", color: SAND }]} lines={[{ key: "construction", name: "Under construction", color: CRIMSON }]} sf />
          ) : null}
          {tab === "Sales" ? (
            <>
              <TimeChart title="Sale price and cap rate" rows={chartRows} lines={[{ key: "price", name: "Sale price / SF", color: TEAL }, { key: "cap", name: "Cap rate %", color: SAND }]} />
              <TimeChart title="Sales activity" rows={chartRows} bars={[{ key: "sales", name: "Sales SF", color: CRIMSON }]} sf />
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Overview({
  current,
  priorQ,
  priorY,
  chartRows,
  qoqOf,
  yoyOf,
}: {
  current: MarketPoint;
  priorQ: MarketPoint | null;
  priorY: MarketPoint | null;
  chartRows: { label: string; vacancy: number | null; availability: number | null }[];
  qoqOf: (field: MarketField) => number | null;
  yoyOf: (field: MarketField) => number | null;
}) {
  const notes = [
    current.vacancyRate != null
      ? `Vacancy is ${percent(current.vacancyRate)}${move(qoqOf("vacancyRate"), yoyOf("vacancyRate"))}.`
      : "",
    current.absorptionSf != null
      ? `Net absorption is ${compactSf(current.absorptionSf)}${current.absorptionSf < 0 ? ", so occupied space gave some back." : "."}`
      : "",
    current.leasingSf != null ? `Leasing activity is ${compactSf(current.leasingSf)}${move(qoqOf("leasingSf"), yoyOf("leasingSf"))}.` : "",
    current.askingRent != null ? `Asking rent is ${rent(current.askingRent)} NNN${move(qoqOf("askingRent"), yoyOf("askingRent"))}.` : "",
  ].filter(Boolean);
  const history: [string, MarketField, (value: number | null) => string][] = [
    ["Inventory", "inventorySf", fullSf],
    ["Vacancy", "vacancyRate", (value) => percent(value)],
    ["Availability", "availabilityRate", (value) => percent(value)],
    ["Asking rent NNN", "askingRent", rent],
    ["Leasing activity", "leasingSf", fullSf],
    ["Net absorption", "absorptionSf", fullSf],
    ["Under construction", "underConstructionSf", fullSf],
    ["Completions", "completionsSf", fullSf],
    ["Sales SF", "salesSf", fullSf],
    ["Sale price / SF", "salePricePsf", price],
    ["Cap rate", "capRate", (value) => percent(value)],
    ["Sales volume", "salesVolume", dollars],
  ];
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-5">
      <div className="grid gap-4 lg:col-span-3">
        <TimeChart
          title="Vacancy vs availability"
          rows={chartRows}
          bars={[{ key: "vacancy", name: "Vacancy %", color: CRIMSON }]}
          lines={[{ key: "availability", name: "Availability %", color: TEAL }]}
        />
        <section className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
          <h2 className="px-4 pt-4 text-sm font-semibold text-ink">Historic comparison</h2>
          <table className="mt-2 w-full min-w-[36rem] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium" />
                <th className="px-3 py-2 text-right font-medium">{priorY ? periodLabel(priorY.year, priorY.quarter) : "Year ago"}</th>
                <th className="px-3 py-2 text-right font-medium">{priorQ ? periodLabel(priorQ.year, priorQ.quarter) : "Prior quarter"}</th>
                <th className="px-3 py-2 text-right font-medium">{periodLabel(current.year, current.quarter)}</th>
                <th className="px-3 py-2 text-right font-medium">QoQ</th>
                <th className="px-4 py-2 text-right font-medium">YoY</th>
              </tr>
            </thead>
            <tbody>
              {history.map(([label, field, format]) =>
                current[field] == null && priorQ?.[field] == null && priorY?.[field] == null ? null : (
                  <tr key={label} className="border-t border-line">
                    <td className="px-4 py-2 text-ink-soft">{label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{format(priorY?.[field] ?? null)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{format(priorQ?.[field] ?? null)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{format(current[field])}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${deltaTone(field, qoqOf(field))}`}>{deltaText(qoqOf(field)) || "—"}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${deltaTone(field, yoyOf(field))}`}>{deltaText(yoyOf(field)) || "—"}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </section>
      </div>
      <aside className="grid content-start gap-4 lg:col-span-2">
        <section className="rounded-lg border border-line bg-surface p-4 shadow-card">
          <h2 className="text-sm font-semibold text-ink">Market trends</h2>
          <ul className="mt-3 grid gap-3">
            {notes.map((note) => (
              <li key={note} className="text-sm leading-6 text-ink-soft">
                {note}
              </li>
            ))}
          </ul>
        </section>
        {current.notes ? (
          <section className="rounded-lg border border-line bg-blush p-4">
            <h2 className="text-sm font-semibold text-deep">Note on this quarter</h2>
            <p className="mt-2 text-sm leading-6 text-ink">{current.notes}</p>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function move(qoq: number | null, yoy: number | null) {
  const bits = [deltaText(qoq) ? `${deltaText(qoq)} QoQ` : "", deltaText(yoy) ? `${deltaText(yoy)} YoY` : ""].filter(Boolean);
  return bits.length ? ` (${bits.join(", ")})` : "";
}

function Places({ places }: { places: MarketPoint[] }) {
  if (!places.length) {
    return (
      <p className="mt-6 text-sm text-muted">
        Import submarket or city rows to compare places. A blank submarket and city is the market total.
      </p>
    );
  }
  const chart = places.slice(0, 12).map((place) => ({ name: placeName(place), vacancy: place.vacancyRate ?? 0 }));
  return (
    <div className="mt-4 grid gap-4">
      <ChartCard title="Vacancy by place">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart} layout="vertical" margin={{ left: 16, right: 8 }}>
            <CartesianGrid stroke="#e5e5ea" horizontal={false} />
            <XAxis type="number" unit="%" tick={{ fontSize: 11, fill: "#6e6e73" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "#1d1d1f" }} axisLine={false} tickLine={false} />
            <Tooltip />
            <Bar dataKey="vacancy" name="Vacancy %" fill={CRIMSON} radius={[0, 4, 4, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-muted">
            <tr>
              {["Place", "Inventory", "Vacancy", "Availability", "Asking rent", "Leasing", "Absorption", "Under construction"].map((label) => (
                <th key={label} className="px-3 py-3 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {places.map((place) => (
              <tr key={place.id || placeName(place)} className="border-t border-line">
                <td className="px-3 py-2 font-medium">{placeName(place)}</td>
                <td className="px-3 py-2 tabular-nums">{compactSf(place.inventorySf)}</td>
                <td className="px-3 py-2 tabular-nums">{percent(place.vacancyRate)}</td>
                <td className="px-3 py-2 tabular-nums">{percent(place.availabilityRate)}</td>
                <td className="px-3 py-2 tabular-nums">{rent(place.askingRent)}</td>
                <td className="px-3 py-2 tabular-nums">{compactSf(place.leasingSf)}</td>
                <td className="px-3 py-2 tabular-nums">{compactSf(place.absorptionSf)}</td>
                <td className="px-3 py-2 tabular-nums">{compactSf(place.underConstructionSf)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TimeChart({
  title,
  rows,
  bars = [],
  lines = [],
  sf = false,
  money = false,
}: {
  title: string;
  rows: Record<string, string | number | null>[];
  bars?: { key: string; name: string; color: string }[];
  lines?: { key: string; name: string; color: string }[];
  sf?: boolean;
  money?: boolean;
}) {
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ left: 8, right: 8, top: 8 }}>
          <CartesianGrid stroke="#e5e5ea" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6e6e73" }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "#6e6e73" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={sf ? axis : money ? (value) => `$${value}` : undefined}
            width={56}
          />
          <Tooltip formatter={(value) => (sf && typeof value === "number" ? compactSf(value) : money && typeof value === "number" ? rent(value) : value)} />
          {bars.map((bar) => (
            <Bar key={bar.key} dataKey={bar.key} name={bar.name} fill={bar.color} radius={[4, 4, 0, 0]} />
          ))}
          {lines.map((line) => (
            <Line key={line.key} dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} dot={{ r: 3 }} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
