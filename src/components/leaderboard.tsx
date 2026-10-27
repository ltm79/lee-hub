import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpDown } from "lucide-react";
import { dealiusLeaderboard, type BoardRow, type Leaderboard } from "@/lib/dealius.functions";

function fiscalStart(now = new Date()) {
  const year = now.getMonth() >= 1 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-02-01`;
}

function todayIso(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function shownDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[2]}/${match[3]}/${match[1]}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function Face({ name, photo }: { name: string; photo: string }) {
  const [failed, setFailed] = useState(false);
  if (photo && !failed) {
    return (
      <img
        src={photo}
        alt=""
        onError={() => setFailed(true)}
        className="size-10 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="grid size-10 place-items-center rounded-full bg-blush text-xs font-semibold text-crimson">
      {initials(name)}
    </span>
  );
}

export function LeaderboardCard() {
  const from = fiscalStart();
  const to = todayIso();
  const [board, setBoard] = useState<Leaderboard | null>(null);

  useEffect(() => {
    let stop = false;
    void dealiusLeaderboard({ data: { from, to } })
      .then((result) => {
        if (!stop) setBoard(result);
      })
      .catch(() => {
        if (!stop) setBoard({ ok: false, error: "The leaderboard could not be loaded." });
      });
    return () => {
      stop = true;
    };
  }, [from, to]);

  const top = board?.ok ? board.rows.slice(0, 4) : [];

  return (
    <section className="mt-8 overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-crimson">Leaderboard</h2>
          <p className="text-xs text-muted">
            {shownDate(from)} – {shownDate(to)}
          </p>
        </div>
        <Link to="/leaderboard" className="text-sm font-semibold text-crimson">
          Full board
        </Link>
      </div>
      {!board ? <p className="px-4 py-6 text-sm text-muted">Loading closed deals from Dealius…</p> : null}
      {board && !board.ok ? <p className="px-4 py-6 text-sm text-muted">{board.error}</p> : null}
      {board?.ok && top.length === 0 ? <p className="px-4 py-6 text-sm text-muted">No closed deals in this range.</p> : null}
      {top.length > 0 ? (
        <ol>
          {top.map((row, index) => (
            <li key={row.id} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
              <Face name={row.name} photo={row.photo} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{row.name}</p>
                <p className="truncate text-xs text-muted">
                  {row.title || row.officeName || "Broker"}
                  {" · "}
                  Broker gross {money(row.gross)}
                </p>
              </div>
              <span
                className={`grid size-8 place-items-center rounded-full text-sm font-semibold ${
                  index === 0 ? "bg-crimson text-white" : "bg-paper text-muted"
                }`}
              >
                {index + 1}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

export function LeaderboardTable() {
  const [from, setFrom] = useState(fiscalStart);
  const [to, setTo] = useState(todayIso);
  const [officeId, setOfficeId] = useState(0);
  const [brokerId, setBrokerId] = useState(0);
  const [sort, setSort] = useState<"gross" | "volume" | "deals" | "name">("gross");
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stop = false;
    setLoading(true);
    void dealiusLeaderboard({ data: { from, to } })
      .then((result) => {
        if (!stop) setBoard(result);
      })
      .catch(() => {
        if (!stop) setBoard({ ok: false, error: "The leaderboard could not be loaded." });
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });
    return () => {
      stop = true;
    };
  }, [from, to]);

  const rows = useMemo(() => {
    const source = board?.ok ? board.rows : [];
    const filtered = source.filter((row) => {
      if (officeId && row.officeId !== officeId) return false;
      if (brokerId && row.id !== brokerId) return false;
      return true;
    });
    const ranked = [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "deals") return b.deals - a.deals || b.gross - a.gross;
      if (sort === "volume") return b.volume - a.volume || b.gross - a.gross;
      return b.gross - a.gross || b.volume - a.volume;
    });
    return ranked;
  }, [board, officeId, brokerId, sort]);

  const brokers = board?.ok ? board.rows : [];
  const offices = board?.ok ? board.offices : [];

  function header(id: typeof sort, label: string, align: "left" | "right") {
    const on = sort === id;
    return (
      <button
        type="button"
        onClick={() => setSort(id)}
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide ${on ? "text-crimson" : "text-muted"} ${
          align === "right" ? "ml-auto" : ""
        }`}
      >
        {label}
        <ArrowUpDown className="size-3" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Leaderboard</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Closed Dealius deals. Volume is the transaction amount, counted for each Lee broker on the deal. Broker gross is that person’s commission.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <select
          aria-label="Broker"
          value={brokerId}
          onChange={(event) => setBrokerId(Number(event.target.value))}
          className="h-10 rounded-sm border border-line bg-surface px-3 text-sm"
        >
          <option value={0}>All brokers</option>
          {brokers.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Office"
          value={officeId}
          onChange={(event) => setOfficeId(Number(event.target.value))}
          className="h-10 rounded-sm border border-line bg-surface px-3 text-sm"
        >
          <option value={0}>All offices</option>
          {offices.map((office) => (
            <option key={office.id} value={office.id}>
              {office.name}
            </option>
          ))}
        </select>
        <label className="flex h-10 items-center gap-2 rounded-sm border border-line bg-surface px-3 text-sm">
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="bg-transparent" />
        </label>
        <label className="flex h-10 items-center gap-2 rounded-sm border border-line bg-surface px-3 text-sm">
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="bg-transparent" />
        </label>
      </div>
      <p className="mt-3 text-sm font-medium text-ink">
        {shownDate(from)} – {shownDate(to)}
      </p>
      {loading ? <p className="mt-6 text-sm text-muted">Loading closed deals from Dealius…</p> : null}
      {!loading && board && !board.ok ? <p className="mt-6 text-sm text-muted">{board.error}</p> : null}
      {!loading && board?.ok && board.capped ? (
        <p className="mt-3 text-sm text-muted">This range has more closed deals than the board can total in one pass.</p>
      ) : null}
      {!loading && board?.ok ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[40rem] text-left">
            <thead className="border-b border-line">
              <tr>
                <th className="px-4 py-3">{header("name", "Name", "left")}</th>
                <th className="px-4 py-3 text-right">{header("deals", "Deals", "right")}</th>
                <th className="px-4 py-3 text-right">{header("volume", "Closed volume", "right")}</th>
                <th className="px-4 py-3 text-right">{header("gross", "Broker gross", "right")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <BoardLine key={row.id} row={row} />
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-sm text-muted">
                    No closed deals match that filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function BoardLine({ row }: { row: BoardRow }) {
  return (
    <tr className="border-t border-line">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Face name={row.name} photo={row.photo} />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.name}</p>
            <p className="truncate text-xs text-muted">{row.title || row.officeName}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="inline-grid min-w-8 place-items-center rounded-full bg-crimson px-2 py-0.5 text-sm font-semibold text-white">
          {row.deals}
        </span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{money(row.volume)}</td>
      <td className="px-4 py-3 text-right font-medium tabular-nums">{money(row.gross)}</td>
    </tr>
  );
}
