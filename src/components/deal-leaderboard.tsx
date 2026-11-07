import { useEffect, useMemo, useState } from "react";
import { Search, Upload } from "lucide-react";
import { parseLeaderboardSheet, type BoardDraft } from "@/lib/board.excel";
import { loadDealBoard, saveDealBoard, type BoardView } from "@/lib/board.functions";

function dollars(amount: number) {
  const digits = Math.abs(amount) >= 100 ? 0 : 2;
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits });
}

function compact(amount: number) {
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return `$${millions.toFixed(millions >= 10 ? 1 : 2)}M`;
  }
  if (amount >= 10_000) return `$${Math.round(amount / 1000)}K`;
  return dollars(amount);
}

function personKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function samePerson(a: string, b: string) {
  const left = personKey(a);
  const right = personKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const aParts = left.split(" ");
  const bParts = right.split(" ");
  return aParts[0] === bParts[0] && aParts[aParts.length - 1] === bParts[bParts.length - 1];
}

function published(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function shareOf(gross: number, total: number) {
  if (!total) return "0%";
  const share = (gross / total) * 100;
  return `${share >= 10 ? share.toFixed(0) : share.toFixed(1)}%`;
}

type BoardRow = BoardView["rows"][number];

function Bar({ width, tone }: { width: number; tone: "you" | "them" | "row" }) {
  const color = tone === "you" ? "bg-teal" : tone === "them" ? "bg-deep" : "bg-crimson";
  return (
    <span className="block h-1.5 overflow-hidden rounded-[3px] bg-paper">
      <span className={`block h-full ${color}`} style={{ width: `${Math.max(3, width)}%` }} />
    </span>
  );
}

export function DealLeaderboard({ isAdmin, viewerName }: { isAdmin: boolean; viewerName: string }) {
  const [board, setBoard] = useState<BoardView | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<BoardDraft | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function reload() {
    void loadDealBoard()
      .then((result) => {
        if (!result.ok) {
          setError(result.error);
          setBoard(null);
          return;
        }
        setError("");
        setBoard(result.board);
      })
      .catch(() => {
        setError("The leaderboard could not be loaded.");
        setBoard(null);
      });
  }

  useEffect(() => {
    reload();
  }, []);

  const rows = board?.rows ?? [];
  const total = useMemo(() => rows.reduce((sum, row) => sum + row.gross, 0), [rows]);
  const lead = rows[0] ?? null;
  const needle = query.trim().toLowerCase();
  const visible = needle ? rows.filter((row) => row.name.toLowerCase().includes(needle)) : rows;
  const mine = rows.find((row) => samePerson(row.name, viewerName)) ?? null;
  const picked = rows.find((row) => row.name === selected && !samePerson(row.name, viewerName)) ?? null;
  const rival =
    picked ??
    (mine && lead && lead.name !== mine.name ? lead : null) ??
    (mine ? rows.find((row) => row.rank === mine.rank + 1) ?? null : null) ??
    (rows.length > 1 ? rows[1] : null);
  const left = mine ?? rows[0] ?? null;
  const max = lead?.gross || 1;
  const pairMax = Math.max(left?.gross ?? 0, rival?.gross ?? 0, 1);

  function pick(row: BoardRow) {
    if (samePerson(row.name, viewerName)) {
      setSelected("");
      return;
    }
    setSelected((current) => (current === row.name ? "" : row.name));
  }

  async function readFile(file: File) {
    setNote("");
    if (file.size > 5_000_000) {
      setDraft(null);
      setNote("That file is larger than 5 MB.");
      return;
    }
    const parsed = parseLeaderboardSheet(await file.arrayBuffer());
    setDraft(parsed.draft);
    setNote(parsed.error);
  }

  async function publish() {
    if (!draft) return;
    setBusy(true);
    const result = await saveDealBoard({ data: draft }).catch(() => ({
      ok: false as const,
      error: "The leaderboard could not be published.",
    }));
    setBusy(false);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    setDraft(null);
    setNote(`Published ${result.saved} agents.`);
    reload();
  }

  const asOf = board?.asOfLabel
    ? `As of ${board.asOfLabel}`
    : board?.updatedAt
      ? `Updated ${published(board.updatedAt)}`
      : "Not published yet";

  if (board === undefined && !error) return <p className="mt-4 text-sm text-muted">Opening the leaderboard…</p>;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-ink">Deal leaderboard</h3>
          <p className="text-xs text-muted">
            {asOf}
            {board?.rangeLabel ? ` · ${board.rangeLabel}` : ""}
            {board ? ` · ${rows.length} agents` : ""}
          </p>
        </div>
        {board ? (
          <p className="text-sm text-ink">
            <span className="text-muted">Office gross </span>
            <span className="font-semibold tabular-nums">{compact(total)}</span>
          </p>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-deep">{error}</p> : null}

      {!board && !error ? (
        <p className="mt-3 rounded-[6px] border border-line bg-surface px-3 py-4 text-sm text-muted">
          {isAdmin
            ? "Upload the Dealius leaderboard export. Agents and gross are published for shareholders."
            : "The office has not published a leaderboard yet."}
        </p>
      ) : null}

      {board ? (
        <>
          {left && rival && left.name !== rival.name ? (
            <section className="mt-3 rounded-[6px] border border-line bg-surface px-3 py-3">
              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">
                    {mine ? `You · #${left.rank}` : `#${left.rank}`}
                  </p>
                  <p className="truncate text-sm font-semibold text-ink">{left.name}</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{dollars(left.gross)}</p>
                </div>
                <p className="pt-4 text-[11px] font-semibold uppercase tracking-widest text-faint">vs</p>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-deep">#{rival.rank}</p>
                  <p className="truncate text-sm font-semibold text-ink">{rival.name}</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{dollars(rival.gross)}</p>
                </div>
              </div>
              <div className="mt-3 grid gap-1.5">
                <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2">
                  <span className="text-xs font-semibold text-teal">{mine ? "You" : `#${left.rank}`}</span>
                  <Bar width={(left.gross / pairMax) * 100} tone="you" />
                </div>
                <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2">
                  <span className="text-xs font-semibold text-deep">#{rival.rank}</span>
                  <Bar width={(rival.gross / pairMax) * 100} tone="them" />
                </div>
              </div>
              <p className="mt-2 text-sm text-ink">
                {left.gross === rival.gross
                  ? "Same broker gross"
                  : left.gross > rival.gross
                    ? `${mine ? "You are" : `${left.name} is`} ${dollars(left.gross - rival.gross)} ahead`
                    : `${rival.name} is ${dollars(rival.gross - left.gross)} ahead of ${mine ? "you" : left.name}`}
                <span className="text-muted">
                  {" "}
                  · {Math.abs(left.rank - rival.rank)} {Math.abs(left.rank - rival.rank) === 1 ? "place" : "places"} apart · {shareOf(left.gross, total)} of the office
                </span>
              </p>
            </section>
          ) : mine ? (
            <div className="mt-3 rounded-[6px] border border-teal/30 bg-mist px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-teal">You · #{mine.rank}</p>
                <p className="text-sm font-semibold tabular-nums text-ink">{dollars(mine.gross)}</p>
              </div>
              <p className="truncate text-sm font-semibold text-ink">{mine.name}</p>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted">Your name is not on this file.</p>
          )}

          <p className="mt-2 text-xs text-faint">Select a name to change the comparison.</p>

          <label className="mt-2 flex h-9 items-center gap-2 rounded-[6px] border border-line bg-surface px-3">
            <Search className="size-4 text-faint" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find an agent"
              className="h-full w-full bg-transparent text-sm outline-none"
            />
          </label>

          <div className="mt-2 max-h-80 overflow-auto rounded-[6px] border border-line bg-surface">
            {visible.length === 0 ? <p className="px-3 py-4 text-sm text-muted">No agent matches that name.</p> : null}
            {visible.map((row) => {
              const isMine = mine?.name === row.name;
              const isRival = rival?.name === row.name;
              return (
                <button
                  key={`${row.rank}-${row.name}`}
                  type="button"
                  onClick={() => pick(row)}
                  className={
                    isRival
                      ? "flex w-full items-center gap-3 border-b border-line bg-blush px-3 py-1.5 text-left last:border-b-0"
                      : isMine
                        ? "flex w-full items-center gap-3 border-b border-line bg-mist px-3 py-1.5 text-left last:border-b-0"
                        : "flex w-full items-center gap-3 border-b border-line px-3 py-1.5 text-left last:border-b-0 hover:bg-paper"
                  }
                >
                  <span className="w-6 shrink-0 text-xs font-semibold tabular-nums text-faint">{row.rank}</span>
                  <span className="w-36 shrink-0 truncate text-sm font-semibold text-ink sm:w-44">
                    {row.name}
                    {isMine ? <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-teal">You</span> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Bar width={(row.gross / max) * 100} tone={isMine ? "you" : isRival ? "them" : "row"} />
                  </span>
                  <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">{dollars(row.gross)}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {isAdmin ? (
        <section className="mt-3 rounded-[6px] border border-dashed border-line bg-surface px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Upload a Dealius export. Only names and broker gross are saved.</p>
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[6px] bg-ink px-3 text-sm font-semibold text-white">
              <Upload className="size-4" aria-hidden="true" />
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
          </div>
          {draft ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink">
                {draft.rows.length} agents
                {draft.asOfLabel ? ` · as of ${draft.asOfLabel}` : ""}
                {draft.rangeLabel ? ` · ${draft.rangeLabel}` : ""}. This replaces the board.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void publish()}
                className="h-9 rounded-[6px] bg-deep px-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Publishing…" : "Publish"}
              </button>
            </div>
          ) : null}
          {note ? <p className="mt-2 text-sm text-deep">{note}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
