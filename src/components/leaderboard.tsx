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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function shownDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[2]}/${match[3]}/${match[1]}`;
}

function onOurBoard(row: BoardRow) {
  const title = row.title.toLowerCase();
  const office = row.officeName.toLowerCase();
  const titled = title.includes("vice president") || /\bassociates?\b/.test(title);
  const industry = office.includes("city of industry") || (office.includes("industry") && office.includes("lee"));
  const central = /la\s*central|l\.a\.?\s*central|los angeles central/.test(office) || (office.includes("central") && office.includes("lee"));
  return titled && (industry || central);
}

function ours(rows: BoardRow[]) {
  return rows.filter(onOurBoard);
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
    function load() {
      void dealiusLeaderboard({ data: { from, to } })
        .then((result) => {
          if (stop) return;
          setBoard(result);
          if (result.ok && result.partial) window.setTimeout(load, 400);
        })
        .catch(() => {
          if (!stop) setBoard({ ok: false, error: "The leaderboard could not be loaded." });
        });
    }
    load();
    return () => {
      stop = true;
    };
  }, [from, to]);

  const top = board?.ok ? ours(board.rows).slice(0, 4) : [];

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-crimson">Dealius Leaderboard</h2>
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
      {board?.ok && top.length === 0 && !board.partial ? <p className="px-4 py-6 text-sm text-muted">No closed deals in this range.</p> : null}
      {board?.ok && board.partial ? <p className="px-4 py-6 text-sm text-muted">Totaling closed deals from Dealius…</p> : null}
      {top.length > 0 && board?.ok && !board.partial ? (
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
  const [sort, setSort] = useState<"gross" | "name">("gross");
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stop = false;
    setLoading(true);
    function load() {
      void dealiusLeaderboard({ data: { from, to } })
        .then((result) => {
          if (stop) return;
          setBoard(result);
          setLoading(Boolean(result.ok && result.partial));
          if (result.ok && result.partial) window.setTimeout(load, 400);
        })
        .catch(() => {
          if (stop) return;
          setBoard({ ok: false, error: "The leaderboard could not be loaded." });
          setLoading(false);
        });
    }
    load();
    return () => {
      stop = true;
    };
  }, [from, to]);

  const rows = useMemo(() => {
    const source = board?.ok ? ours(board.rows) : [];
    const filtered = source.filter((row) => {
      if (officeId && row.officeId !== officeId) return false;
      if (brokerId && row.id !== brokerId) return false;
      return true;
    });
    const ranked = [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      return b.gross - a.gross || a.name.localeCompare(b.name);
    });
    return ranked;
  }, [board, officeId, brokerId, sort]);

  const brokers = board?.ok ? ours(board.rows) : [];
  const offices = (board?.ok ? board.offices : []).filter((office) => {
    const name = office.name.toLowerCase();
    const industry = name.includes("city of industry") || (name.includes("industry") && name.includes("lee"));
    const central = /la\s*central|l\.a\.?\s*central|los angeles central/.test(name) || (name.includes("central") && name.includes("lee"));
    return industry || central;
  });

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
      <h1 className="text-3xl font-semibold tracking-tight">Dealius Leaderboard</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Closed deals only, by actual close date. Click a name to see the deals. Commission gross is before the house split.
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
      {loading ? <p className="mt-6 text-sm text-muted">Totaling closed deals from Dealius…</p> : null}
      {board && !board.ok ? <p className="mt-6 text-sm text-muted">{board.error}</p> : null}
      {!loading && board?.ok && board.capped ? (
        <p className="mt-3 text-sm text-muted">This range has more closed deals than the board can total in one pass.</p>
      ) : null}
      {board?.ok ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[24rem] text-left">
            <thead className="border-b border-line">
              <tr>
                <th className="px-4 py-3">{header("name", "Name", "left")}</th>
                <th className="px-4 py-3 text-right">{header("gross", "Broker gross", "right")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <BoardLine key={row.id} row={row} />
              ))}
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-sm text-muted">
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
  const [open, setOpen] = useState(false);
  const lines = [...row.lines].sort((a, b) => b.gross - a.gross || a.name.localeCompare(b.name));
  return (
    <>
      <tr className="border-t border-line">
        <td className="px-4 py-3">
          <button type="button" onClick={() => setOpen((value) => !value)} className="flex items-center gap-3 text-left">
            <Face name={row.name} photo={row.photo} />
            <div className="min-w-0">
              <p className="truncate font-medium">{row.name}</p>
              <p className="truncate text-xs text-muted">
                {row.title || row.officeName}
                {lines.length > 0 ? ` · ${lines.length} closed deals` : ""}
              </p>
            </div>
          </button>
        </td>
        <td className="px-4 py-3 text-right font-medium tabular-nums">{money(row.gross)}</td>
      </tr>
      {open ? (
        <tr className="border-t border-line bg-paper">
          <td colSpan={2} className="px-4 py-3">
            <p className="text-xs text-muted">
              Commission gross {money(row.gross)} · After house split {money(row.split)}
            </p>
            <ul className="mt-2 flex flex-col">
              {lines.map((line) => (
                <li key={line.dealId} className="flex items-baseline justify-between gap-3 border-t border-line py-2 text-sm first:border-t-0">
                  <span className="min-w-0">
                    <span className="block truncate">{line.name}</span>
                    <span className="text-xs text-muted">Closed {shownDate(line.closed)}</span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="block">{money(line.gross)}</span>
                    <span className="block text-xs text-muted">Split {money(line.split)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </>
  );
}
