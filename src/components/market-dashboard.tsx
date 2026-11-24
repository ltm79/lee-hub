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
import { SUBMARKETS } from "@/lib/market.places";
import type { MarketField, MarketPoint } from "@/lib/market.types";

const TABS = ["Overview", "Submarkets", "Vacancy", "Rent", "Leasing", "Construction", "Sales", "Places", "Data"] as const;
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
    <label className="grid gap-1 text-[11px] font-medium text-muted">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-transparent bg-surface px-3 text-sm font-medium text-ink transition duration-150 hover:border-line focus:border-deep focus:outline-none"
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
    <article className="px-4 py-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
        <span className={`rounded-full bg-paper px-2 py-0.5 ${deltaTone(field, yoy)}`}>YoY {deltaText(yoy) || "—"}</span>
        <span className={`rounded-full bg-paper px-2 py-0.5 ${deltaTone(field, qoq)}`}>QoQ {deltaText(qoq) || "—"}</span>
      </p>
    </article>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-deep">Market Analytics</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">{placeTitle}</h1>
          <p className="mt-1 text-sm text-muted">
            Industrial
            {chosenPeriod ? ` · ${quarterName(chosenPeriod.quarter)} ${chosenPeriod.year}` : ""}
            {series.rolled ? " · rolled up from the places below" : ""}
          </p>
        </div>
      </div>

      <div className={`mt-4 grid grid-cols-2 gap-2 rounded-xl bg-white p-2 shadow-card ${submarkets.length ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
          <Select
            label="Submarket"
            value={chosenMarket}
            options={markets.map((name) => ({ value: name, label: name }))}
            onChange={(value) => {
              setMarket(value);
              setSubmarket("");
              setCity("");
            }}
          />
          {submarkets.length > 0 ? (
            <Select
              label="Breakout"
              value={chosenSub}
              options={[{ value: "", label: "All" }, ...submarkets.map((name) => ({ value: name, label: name }))]}
              onChange={(value) => {
                setSubmarket(value);
                setCity("");
              }}
            />
          ) : null}
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

      {error ? <p className="mt-4 text-sm text-red-deep">{error}</p> : null}
      {!chosenPeriod ? (
        <p className="mt-8 text-sm text-muted">
          No industrial figures yet. An administrator can import an Excel sheet from the Data tab.
        </p>
      ) : (
        <>
          <div className="mt-5 grid overflow-hidden rounded-xl border border-line bg-surface shadow-card sm:grid-cols-2 xl:grid-cols-4">
            <div className="border-b border-line sm:border-r xl:border-b-0">
              <Kpi label="Overall vacancy" value={percent(chosenPeriod.vacancyRate)} field="vacancyRate" qoq={qoqOf("vacancyRate")} yoy={yoyOf("vacancyRate")} />
            </div>
            <div className="border-b border-line xl:border-r xl:border-b-0">
              <Kpi label="Asking lease rate NNN" value={rent(chosenPeriod.askingRent)} field="askingRent" qoq={qoqOf("askingRent")} yoy={yoyOf("askingRent")} />
            </div>
            <div className="border-b border-line sm:border-r sm:border-b-0 xl:border-r">
              <Kpi label="Leasing activity" value={compactSf(chosenPeriod.leasingSf)} field="leasingSf" qoq={qoqOf("leasingSf")} yoy={yoyOf("leasingSf")} />
            </div>
            <Kpi label="Under construction" value={compactSf(chosenPeriod.underConstructionSf)} field="underConstructionSf" qoq={qoqOf("underConstructionSf")} yoy={yoyOf("underConstructionSf")} />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {[
              ["Inventory", chosenPeriod.inventorySf == null ? "" : compactSf(chosenPeriod.inventorySf)],
              ["Net absorption", chosenPeriod.absorptionSf == null ? "" : compactSf(chosenPeriod.absorptionSf)],
              ["Availability", chosenPeriod.availabilityRate == null ? "" : percent(chosenPeriod.availabilityRate)],
              ["Deliveries", chosenPeriod.completionsSf == null ? "" : compactSf(chosenPeriod.completionsSf)],
              ["Leasing deals", chosenPeriod.transactions == null ? "" : chosenPeriod.transactions.toLocaleString()],
              ["Sale price", chosenPeriod.salePricePsf == null ? "" : price(chosenPeriod.salePricePsf)],
              ["Cap rate", chosenPeriod.capRate == null ? "" : percent(chosenPeriod.capRate)],
              ["Sales activity", chosenPeriod.salesSf == null ? "" : compactSf(chosenPeriod.salesSf)],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
              <div key={label} className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 shadow-card transition duration-150 hover:border-deep">
                <span className="text-[11px] text-muted">{label}</span>
                <span className="ml-2 text-sm font-semibold tabular-nums text-ink">{value}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="sticky top-0 z-10 -mx-1 mt-5 bg-paper/95 px-1 py-2 backdrop-blur">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-card">
          {TABS.filter((item) => item !== "Data" || isAdmin).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={
                tab === item
                  ? "shrink-0 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white"
                  : "shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-muted transition duration-150 hover:bg-paper hover:text-ink"
              }
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {tab === "Data" && isAdmin ? (
        <MarketData rows={rows} onChanged={reload} />
      ) : tab === "Submarkets" ? (
        <SubmarketBoard
          rows={rows}
          onOpen={(name, label) => {
            setMarket(name);
            setSubmarket("");
            setCity("");
            setPeriod(label);
            setTab("Overview");
          }}
        />
      ) : !chosenPeriod ? null : tab === "Overview" ? (
        <>
          <Overview
            current={chosenPeriod}
            priorQ={priorQ}
            priorY={priorY}
            chartRows={chartRows}
            qoqOf={qoqOf}
            yoyOf={yoyOf}
          />
          <QuarterSummaries
            points={series.points}
            active={periodLabel(chosenPeriod.year, chosenPeriod.quarter)}
            onOpen={setPeriod}
          />
        </>
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

function SubmarketBoard({ rows, onOpen }: { rows: MarketPoint[]; onOpen: (name: string, label: string) => void }) {
  const periods = useMemo(() => {
    const seen = new Map<string, { year: number; quarter: number }>();
    for (const row of rows) {
      if (!(SUBMARKETS as readonly string[]).includes(row.market) || row.submarket || row.city) continue;
      seen.set(periodLabel(row.year, row.quarter), { year: row.year, quarter: row.quarter });
    }
    return [...seen.entries()].sort((a, b) => b[1].year - a[1].year || b[1].quarter - a[1].quarter);
  }, [rows]);
  const [picked, setPicked] = useState(periods[0]?.[0] ?? "");
  const label = periods.some(([name]) => name === picked) ? picked : (periods[0]?.[0] ?? "");
  const period = periods.find(([name]) => name === label)?.[1];
  const cards = SUBMARKETS.map((name) => {
    const total = period
      ? rows.find((row) => row.market === name && !row.submarket && !row.city && row.year === period.year && row.quarter === period.quarter) ?? null
      : null;
    const cities = period
      ? rows
          .filter((row) => row.market === name && row.city && row.year === period.year && row.quarter === period.quarter)
          .sort((a, b) => (b.inventorySf ?? 0) - (a.inventorySf ?? 0))
      : [];
    return { name, total, cities };
  });
  const peak = Math.max(10, ...cards.map((card) => card.total?.vacancyRate ?? 0));
  if (!period) {
    return <p className="mt-6 text-sm text-muted">Upload a quarter for one of the six submarkets to compare them.</p>;
  }
  return (
    <div className="mt-4 grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Submarket segmentation</h2>
          <p className="mt-1 text-sm text-muted">Same quarter across the six submarkets. Open one for its history. Cities show under a submarket after they are uploaded.</p>
        </div>
        <label className="grid gap-1 text-[11px] font-medium text-muted">
          Quarter
          <select value={label} onChange={(event) => setPicked(event.target.value)} className="h-10 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink">
            {periods.map(([name]) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.name}
            type="button"
            onClick={() => onOpen(card.name, label)}
            className="rounded-xl border border-line bg-surface p-4 text-left shadow-card transition duration-150 hover:border-deep"
          >
            <p className="text-sm font-semibold text-ink">{card.name}</p>
            {card.total ? (
              <>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">{percent(card.total.vacancyRate)}</p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Vacancy</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper">
                  <div className="h-full rounded-full bg-deep" style={{ width: `${Math.min(100, ((card.total.vacancyRate ?? 0) / peak) * 100)}%` }} />
                </div>
                <p className="mt-3 text-sm text-ink-soft">
                  {rent(card.total.askingRent)} NNN · {compactSf(card.total.absorptionSf)} absorption
                </p>
                <p className="mt-1 text-xs text-muted">{compactSf(card.total.inventorySf)} inventory</p>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted">No {label} total yet.</p>
            )}
            {card.cities.length ? (
              <ul className="mt-3 grid gap-1 border-t border-line pt-3">
                {card.cities.slice(0, 4).map((city) => (
                  <li key={city.id || city.city} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-ink">{city.city}</span>
                    <span className="shrink-0 tabular-nums text-muted">{percent(city.vacancyRate)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </button>
        ))}
      </div>
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
  const story = quarterStory(current, priorQ, priorY);
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
        <section className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
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
                  <tr key={label} className="border-t border-line transition duration-150 hover:bg-paper">
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
        <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <h2 className="text-sm font-semibold text-ink">This quarter</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <StoryStat label="Vacancy vs last quarter" value={pointChange(current.vacancyRate, priorQ?.vacancyRate ?? null)} />
            <StoryStat label="Net absorption" value={current.absorptionSf == null ? "—" : compactSf(current.absorptionSf)} />
            <StoryStat label="Rent vs a year ago" value={rentChange(current.askingRent, priorY?.askingRent ?? null)} />
          </div>
          <div className="mt-3 grid gap-2">
            {story.map((line) => (
              <p key={line} className="text-sm leading-6 text-ink-soft">{line}</p>
            ))}
          </div>
        </section>
        {current.notes ? (
          <section className="rounded-xl border border-line bg-blush p-4 shadow-card">
            <h2 className="text-sm font-semibold text-deep">Note on this quarter</h2>
            <p className="mt-2 text-sm leading-6 text-ink">{current.notes}</p>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function pointChange(current: number | null, prior: number | null) {
  if (current == null || prior == null) return "—";
  const diff = current - prior;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toFixed(1)} pts`;
}

function rentChange(current: number | null, prior: number | null) {
  if (current == null || prior == null) return "—";
  const diff = current - prior;
  const sign = diff > 0 ? "+" : "";
  return `${sign}$${diff.toFixed(2)}`;
}

function StoryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-paper px-2 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function quarterStory(current: MarketPoint, priorQ: MarketPoint | null, priorY: MarketPoint | null) {
  const lines: string[] = [];
  if (current.vacancyRate != null) {
    const prior = priorQ?.vacancyRate;
    const verb = prior == null ? "is" : current.vacancyRate > prior + 0.05 ? "rose to" : current.vacancyRate < prior - 0.05 ? "eased to" : "held at";
    const fromQ = prior == null ? "" : ` from ${percent(prior)} last quarter`;
    const fromY = priorY?.vacancyRate == null ? "" : `${fromQ ? " and" : " from"} ${percent(priorY.vacancyRate)} a year ago`;
    lines.push(`Vacancy ${verb} ${percent(current.vacancyRate)}${fromQ}${fromY}.`);
  }
  if (current.absorptionSf != null) {
    const amount = compactSf(Math.abs(current.absorptionSf));
    lines.push(
      current.absorptionSf < 0
        ? `Tenants gave back ${amount}.`
        : current.absorptionSf > 0
          ? `The quarter absorbed ${amount}.`
          : "Net absorption was flat.",
    );
  }
  if (current.leasingSf != null) {
    const deals = current.transactions != null ? ` across ${current.transactions.toLocaleString()} deals` : "";
    lines.push(`Leasing activity was ${compactSf(current.leasingSf)}${deals}.`);
  }
  if (current.askingRent != null) {
    const fromQ = priorQ?.askingRent == null ? "" : ` from ${rent(priorQ.askingRent)} last quarter`;
    const fromY = priorY?.askingRent == null ? "" : `${fromQ ? " and" : " from"} ${rent(priorY.askingRent)} a year ago`;
    lines.push(`Asking rent is ${rent(current.askingRent)} NNN${fromQ}${fromY}.`);
  }
  if (current.completionsSf != null || current.underConstructionSf != null) {
    const delivered = current.completionsSf != null ? `${compactSf(current.completionsSf)} was delivered` : "";
    const pipeline = current.underConstructionSf != null ? `${compactSf(current.underConstructionSf)} is still under construction` : "";
    const sentence = [delivered, pipeline].filter(Boolean).join(", and ");
    lines.push(`${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`);
  }
  return lines;
}

function QuarterSummaries({ points, active, onOpen }: { points: MarketPoint[]; active: string; onOpen: (label: string) => void }) {
  const newest = [...points].reverse();
  if (newest.length < 2) return null;
  return (
    <section className="mt-4 rounded-xl border border-line bg-surface shadow-card">
      <div className="px-4 pt-4">
        <h2 className="text-sm font-semibold text-ink">Every quarter</h2>
        <p className="mt-1 text-sm text-muted">A short read on each quarter, newest first. Open one to put it on the chart.</p>
      </div>
      <ul className="mt-3 max-h-[32rem] divide-y divide-line overflow-y-auto">
        {newest.map((point) => {
          const label = periodLabel(point.year, point.quarter);
          const prior = priorPeriod(point.year, point.quarter, 1);
          const yearAgo = priorPeriod(point.year, point.quarter, 4);
          const lines = quarterStory(point, findPoint(points, prior.year, prior.quarter), findPoint(points, yearAgo.year, yearAgo.quarter));
          return (
            <li key={label}>
              <button type="button" onClick={() => onOpen(label)} className={`w-full px-4 py-3 text-left transition duration-150 hover:bg-paper ${label === active ? "bg-blush" : ""}`}>
                <span className="text-sm font-semibold text-ink">{label}</span>
                <span className="mt-1 block text-sm leading-6 text-ink-soft">{lines.join(" ")}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
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
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
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
              <tr key={place.id || placeName(place)} className="border-t border-line transition duration-150 hover:bg-paper">
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
