import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search, Upload } from "lucide-react";
import { parseLeaderboardSheet, type BoardDraft } from "@/lib/board.excel";
import { loadDealBoard, saveDealBoard, type BoardView } from "@/lib/board.functions";

const DEALS_URL = "https://leeindustry.dealius.com/tracker#payments";

function dollars(amount: number) {
  const digits = Math.abs(amount) >= 100 ? 0 : 2;
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits });
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

function updatedLine(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const minute = part("minute");
  const hour = part("hour");
  const ampm = part("dayPeriod").toLowerCase().replace(/\s/g, "");
  const time = minute === "00" ? `${hour}${ampm}` : `${hour}:${minute}${ampm}`;
  return `Updated- ${part("weekday")}, ${part("month")} ${part("day")}, ${part("year")} at ${time}`;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "L"
  );
}

function Face({ name, photo, large }: { name: string; photo: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const box = large ? "size-16 text-base" : "size-8 text-[11px]";
  if (photo && !failed) {
    return (
      <span className={`block overflow-hidden rounded-full bg-blush ${large ? "size-16" : "size-8"}`}>
        <img
          src={photo}
          alt=""
          onError={() => setFailed(true)}
          className="size-full origin-top object-cover object-[center_15%] translate-y-[10%] scale-[0.82]"
        />
      </span>
    );
  }
  return (
    <span className={`grid ${box} place-items-center rounded-full bg-blush font-semibold text-deep`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function DealLeaderboard({ isAdmin, viewerName }: { isAdmin: boolean; viewerName: string }) {
  const [board, setBoard] = useState<BoardView | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [query, setQuery] = useState("");
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

  useEffect(() => {
    if (!open) {
      setDrawn(false);
      return;
    }
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const rows = board?.rows ?? [];
  const total = useMemo(() => rows.reduce((sum, row) => sum + row.gross, 0), [rows]);
  const top = rows.slice(0, 5);
  const needle = query.trim().toLowerCase();
  const visible = needle ? rows.filter((row) => row.name.toLowerCase().includes(needle)) : rows;
  const updated = board?.updatedAt ? updatedLine(board.updatedAt) : "";

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

  if (board === undefined && !error) return <p className="mt-4 text-sm text-muted">Opening the leaderboard…</p>;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-ink">
            Leaderboard
            <span className="ml-2 text-xs font-normal text-muted">*the following is only viewable by Shareholders</span>
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            {updated || "Not published yet"}
            {board ? (
              <>
                {" · "}
                <span className="font-semibold text-ink">Office gross {dollars(total)}</span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-deep">{error}</p> : null}

      {!board && !error ? (
        <p className="mt-3 rounded-[6px] border border-line bg-surface px-3 py-4 text-sm text-muted">
          {isAdmin
            ? "Upload the Dealius leaderboard export. Agents and gross are published for shareholders."
            : "The office has not published a leaderboard yet."}
        </p>
      ) : null}

      {board && top.length > 0 ? (
        <>
          <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {top.map((row) => {
              const mine = samePerson(row.name, viewerName);
              return (
                <li
                  key={`${row.rank}-${row.name}`}
                  className={mine ? "rounded-[6px] border border-teal bg-mist px-2 py-3 text-center" : "rounded-[6px] border border-line bg-surface px-2 py-3 text-center"}
                >
                  <p className="text-[11px] font-semibold tabular-nums text-faint">#{row.rank}</p>
                  <div className="mt-2 flex justify-center">
                    <Face name={row.name} photo={row.photo} large />
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-ink">
                    {row.name}
                    {mine ? <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-teal">You</span> : null}
                  </p>
                  {mine ? (
                    <a href={DEALS_URL} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-[11px] font-semibold text-crimson">
                      See deals
                    </a>
                  ) : null}
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{dollars(row.gross)}</p>
                </li>
              );
            })}
          </ol>

          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="mt-3 flex h-10 w-full items-center justify-between rounded-[6px] border border-line bg-surface px-3 text-sm font-semibold text-ink"
          >
            {open ? "Hide the full list" : `Show the full list · ${rows.length}`}
            <ChevronDown className={open ? "size-4 rotate-180 transition" : "size-4 transition"} aria-hidden="true" />
          </button>

          {open ? (
            <div className="mt-2">
              <label className="flex h-9 items-center gap-2 rounded-[6px] border border-line bg-surface px-3">
                <Search className="size-4 text-faint" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find an agent"
                  className="h-full w-full bg-transparent text-sm outline-none"
                />
              </label>
              <div className="mt-2 max-h-96 overflow-auto rounded-[6px] border border-line bg-surface">
                {visible.length === 0 ? <p className="px-3 py-4 text-sm text-muted">No agent matches that name.</p> : null}
                {visible.map((row) => {
                  const mine = samePerson(row.name, viewerName);
                  const lead = rows[0]?.gross || row.gross || 1;
                  const width = Math.max(3, Math.min(100, (row.gross / lead) * 100));
                  return (
                    <div key={`${row.rank}-${row.name}`} className="border-b border-line px-3 py-2 last:border-b-0 transition hover:bg-paper">
                      <div className="flex items-center gap-3">
                        <span className="w-6 shrink-0 text-xs font-semibold tabular-nums text-faint">{row.rank}</span>
                        <Face name={row.name} photo={row.photo} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                          {row.name}
                          {mine ? <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-teal">You</span> : null}
                        </span>
                        {mine ? (
                          <a
                            href={DEALS_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 rounded-[6px] border border-line bg-surface px-2 py-1 text-[11px] font-semibold text-crimson hover:border-crimson"
                          >
                            See deals
                          </a>
                        ) : null}
                        <span className="w-28 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">{dollars(row.gross)}</span>
                      </div>
                      <div className="mt-1.5 ml-9 h-1.5 overflow-hidden rounded-full bg-paper">
                        <div
                          className="h-full rounded-full bg-crimson transition-all duration-500 ease-out"
                          style={{ width: drawn ? `${width}%` : "0%" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
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
