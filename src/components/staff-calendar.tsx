import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown } from "lucide-react";
import {
  loadCalendar,
  postOfficeEvent,
  removeCalendarEvent,
  reviewCalendarRequest,
  submitCalendarRequest,
  type CalendarEvent,
} from "@/lib/calendar.functions";

const KINDS: Record<string, { label: string; bar: string; chip: string }> = {
  ooo: { label: "Out of Office", bar: "bg-crimson text-white", chip: "bg-crimson" },
  late: { label: "Arriving Late", bar: "bg-deep text-white", chip: "bg-deep" },
  conference: { label: "Conference", bar: "bg-teal text-white", chip: "bg-teal" },
  holiday: { label: "Holiday", bar: "bg-[#5c6b4a] text-white", chip: "bg-[#5c6b4a]" },
  meeting: { label: "Staff Meeting", bar: "bg-[#5b3a8c] text-white", chip: "bg-[#5b3a8c]" },
};

function iso(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function pretty(value: string) {
  if (!value) return "";
  return parseIso(value).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0]?.[0] ?? ""}. ${parts[parts.length - 1]}`;
}

function eventLabel(event: CalendarEvent) {
  if (event.kind === "holiday" || event.kind === "meeting") return event.title;
  const who = shortName(event.personName);
  return who ? `${who} - ${event.title}` : event.title;
}

function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function lanesFor(events: CalendarEvent[], week: Date[]) {
  const start = iso(week[0]);
  const end = iso(week[6]);
  const hits = events
    .filter((event) => event.end >= start && event.start <= end)
    .map((event) => {
      const col = Math.max(0, week.findIndex((day) => iso(day) >= event.start));
      let span = 0;
      for (let index = col; index < 7; index += 1) {
        if (iso(week[index]) > event.end) break;
        span += 1;
      }
      return { event, col, span };
    })
    .sort((a, b) => a.col - b.col || b.span - a.span);
  const laneEnds: number[] = [];
  return hits.map((hit) => {
    let lane = laneEnds.findIndex((taken) => taken < hit.col);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = hit.col + hit.span - 1;
    return { ...hit, lane };
  });
}

function approvedWhen(value: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
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
  const ampm = part("dayPeriod").toLowerCase().replace(/\s/g, "");
  const time = minute === "00" ? `${part("hour")}${ampm}` : `${part("hour")}:${minute}${ampm}`;
  return `${part("weekday")}, ${part("month")} ${part("day")}, ${part("year")} at ${time}`;
}

function pdfText(value: string) {
  return value.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

async function confirmationPdf(event: CalendarEvent) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.12, 0.13);
  const muted = rgb(0.38, 0.38, 0.42);
  const crimson = rgb(0.6, 0.11, 0.18);
  const stamp = approvedWhen(event.reviewedAt) || "Approved";
  let y = 700;
  page.drawRectangle({ x: 0, y: 742, width: 612, height: 50, color: crimson });
  page.drawText("LEE & ASSOCIATES", { x: 56, y: 764, size: 11, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Lee Hub  ·  Staff Calendar", { x: 56, y: 750, size: 9, font, color: rgb(1, 1, 1) });
  y = 690;
  page.drawText("Time off confirmation", { x: 56, y, size: 22, font: bold, color: ink });
  y -= 22;
  page.drawText("APPROVED", { x: 56, y, size: 12, font: bold, color: crimson });
  const rows: [string, string][] = [
    ["Name", event.personName || "Staff"],
    ["Type", KINDS[event.kind]?.label ?? "Time off"],
    ["Calendar", event.title],
    ["From", pretty(event.start)],
    ["Through", pretty(event.end)],
    ["Note", event.note || "None"],
    ["Approved by", event.reviewerName || "Operations"],
    ["Approved", stamp],
  ];
  y -= 36;
  for (const [label, value] of rows) {
    page.drawText(label.toUpperCase(), { x: 56, y, size: 8, font: bold, color: muted });
    y -= 16;
    const line = pdfText(value).slice(0, 88) || "None";
    page.drawText(line, { x: 56, y, size: 13, font, color: ink });
    y -= 26;
  }
  page.drawText("One-page office record. This confirms the request was approved in Lee Hub.", {
    x: 56,
    y: 64,
    size: 9,
    font,
    color: muted,
  });
  const bytes = await doc.save();
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const who = pdfText(event.personName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "staff";
  link.href = url;
  link.download = `time-off-${who}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

export function StaffCalendar() {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [mine, setMine] = useState<CalendarEvent[]>([]);
  const [pending, setPending] = useState<CalendarEvent[]>([]);
  const [canRequest, setCanRequest] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<"request" | "office" | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [kind, setKind] = useState("ooo");
  const [title, setTitle] = useState("Out of Office");
  const [detail, setDetail] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  function reload() {
    void loadCalendar()
      .then((result) => {
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setError("");
        setEvents(result.events);
        setMine(result.mine);
        setPending(result.pending);
        setCanRequest(result.canRequest);
        setCanReview(result.canReview);
      })
      .catch(() => setError("The calendar could not be loaded."));
  }

  useEffect(() => {
    reload();
  }, []);

  const cells = useMemo(() => monthCells(cursor.year, cursor.month), [cursor]);
  const weeks = [0, 1, 2, 3, 4, 5].map((index) => cells.slice(index * 7, index * 7 + 7));
  const myPending = mine.filter((event) => event.status === "pending");
  const myRest = mine.filter((event) => event.status !== "pending");
  const label = new Date(cursor.year, cursor.month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const todayIso = iso(today);

  function shift(step: number) {
    const next = new Date(cursor.year, cursor.month + step, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  }

  async function sendRequest() {
    setBusy(true);
    const result = await submitCalendarRequest({ data: { kind, title, note: detail, start, end } }).catch((error: unknown) => ({
      ok: false as const,
      error: error instanceof Error && error.message ? error.message : "The request could not be sent.",
    }));
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error || "The request could not be sent.");
      return;
    }
    setOpen(null);
    setDetail("");
    setStart("");
    setEnd("");
    setNote("Request has been submitted.");
    reload();
  }

  async function sendOffice() {
    setBusy(true);
    const result = await postOfficeEvent({ data: { kind, title, start, end } }).catch(() => ({
      ok: false as const,
      error: "That date could not be added.",
    }));
    setBusy(false);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    setOpen(null);
    setNote("Added to the calendar.");
    reload();
  }

  async function decide(id: string, decision: "approved" | "denied") {
    setBusy(true);
    const result = await reviewCalendarRequest({ data: { id, decision } }).catch(() => ({
      ok: false as const,
      error: "That request could not be updated.",
    }));
    setBusy(false);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    setNote(decision === "approved" ? "Approved and placed on the calendar." : "Request declined.");
    setSelected(null);
    reload();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-deep">Office</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Staff Calendar</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRequest ? (
            <button
              type="button"
              onClick={() => {
                setKind("ooo");
                setTitle("Out of Office");
                setDetail("");
                setFormError("");
                setOpen("request");
              }}
              className="h-10 rounded-[6px] bg-ink px-3 text-sm font-semibold text-white transition duration-150 hover:bg-deep"
            >
              Request time
            </button>
          ) : null}
          {canReview ? (
            <button
              type="button"
              onClick={() => {
                setKind("holiday");
                setTitle("");
                setOpen("office");
              }}
              className="h-10 rounded-[6px] border border-line bg-surface px-3 text-sm font-semibold text-ink transition duration-150 hover:border-deep hover:bg-paper"
            >
              Add office date
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-deep">{error}</p> : null}
      {note ? <p className="mt-3 text-sm text-ink">{note}</p> : null}

      <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold text-muted">
        {Object.entries(KINDS).map(([key, item]) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className={`size-2.5 rounded-sm ${item.chip}`} />
            {item.label}
          </span>
        ))}
      </div>

      {myPending.length > 0 ? (
        <section className="mt-4 rounded-[6px] border border-sand bg-cream p-3">
          <h2 className="text-sm font-semibold text-deep">Pending requests · {myPending.length}</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {myPending.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] bg-white px-3 py-2 transition duration-150 hover:bg-blush">
                <div>
                  <p className="text-sm font-semibold text-ink">{event.title}</p>
                  <p className="text-xs text-muted">
                    {pretty(event.start)} – {pretty(event.end)}
                    {event.note ? ` · ${event.note}` : ""}
                  </p>
                </div>
                <span className="rounded-sm bg-sand px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">Pending</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pending.length > 0 ? (
        <section className="mt-4 rounded-[6px] border border-line bg-surface p-3">
          <h2 className="text-sm font-semibold text-ink">Waiting for approval · {pending.length}</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {pending.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] bg-paper px-3 py-2 transition duration-150 hover:bg-blush">
                <div>
                  <p className="text-sm font-semibold text-ink">{event.personName} · {event.title}</p>
                  <p className="text-xs text-muted">{pretty(event.start)} – {pretty(event.end)}{event.note ? ` · ${event.note}` : ""}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => void decide(event.id, "approved")} className="h-8 rounded-[6px] bg-deep px-3 text-xs font-semibold text-white transition duration-150 hover:bg-ink disabled:opacity-60">
                    Approve
                  </button>
                  <button type="button" disabled={busy} onClick={() => void decide(event.id, "denied")} className="h-8 rounded-[6px] border border-line px-3 text-xs font-semibold text-ink transition duration-150 hover:border-crimson hover:text-crimson disabled:opacity-60">
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-[6px] border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <button type="button" onClick={() => shift(-1)} className="grid size-9 place-items-center rounded-md transition duration-150 hover:bg-blush" aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </button>
          <h2 className="text-sm font-semibold text-ink">{label}</h2>
          <button type="button" onClick={() => shift(1)} className="grid size-9 place-items-center rounded-md transition duration-150 hover:bg-blush" aria-label="Next month">
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 border-b border-line text-[11px] font-semibold uppercase tracking-wide text-faint">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="px-2 py-2">{day}</div>
          ))}
        </div>
        {weeks.map((week) => {
          const bars = lanesFor(events, week);
          const height = Math.max(1, bars.reduce((max, bar) => Math.max(max, bar.lane + 1), 0));
          return (
            <div key={iso(week[0])} className="relative grid grid-cols-7 border-b border-line last:border-b-0" style={{ minHeight: Math.max(96, 40 + height * 22) }}>
              {week.map((day) => {
                const key = iso(day);
                const outside = day.getMonth() !== cursor.month;
                return (
                  <div key={key} className="min-h-24 border-l border-line p-1 transition duration-150 first:border-l-0 hover:bg-paper">
                    <span className={key === todayIso ? "inline-grid size-6 place-items-center rounded-full bg-ink text-xs font-semibold text-white" : outside ? "text-xs text-faint" : "text-xs font-medium text-ink"}>
                      {day.getDate()}
                    </span>
                  </div>
                );
              })}
              <div className="pointer-events-none absolute inset-x-0 top-7" style={{ height: height * 22 }}>
                {bars.map(({ event, col, span, lane }) => (
                  <button
                    key={`${event.id}-${iso(week[0])}`}
                    type="button"
                    onClick={() => setSelected(event)}
                    className={`pointer-events-auto absolute h-5 truncate rounded-sm px-1.5 text-left text-[11px] font-semibold transition duration-150 hover:brightness-110 ${KINDS[event.kind]?.bar ?? "bg-ink text-white"}`}
                    style={{ left: `${(col / 7) * 100}%`, width: `calc(${(span / 7) * 100}% - 4px)`, top: lane * 22, marginLeft: 2 }}
                  >
                    {eventLabel(event)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {myRest.length > 0 && canRequest ? (
        <section className="mt-4">
          <h2 className="text-sm font-semibold text-ink">Your requests</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {myRest.slice(0, 8).map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 rounded-sm px-1 text-sm transition duration-150 hover:bg-paper">
                <span className="truncate text-ink">{event.title} · {pretty(event.start)}</span>
                <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">{event.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-30 grid place-items-center bg-ink/30 p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-[6px] bg-surface p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-deep">{KINDS[selected.kind]?.label ?? "Calendar"}</p>
            <h3 className="mt-1 text-xl font-semibold text-ink">{eventLabel(selected)}</h3>
            <p className="mt-2 text-sm text-muted">{pretty(selected.start)} – {pretty(selected.end)}</p>
            {selected.note ? <p className="mt-2 text-sm text-ink">{selected.note}</p> : null}
            {selected.reviewerName ? <p className="mt-2 text-xs text-muted">Approved by {selected.reviewerName}</p> : null}
            {selected.reviewedAt ? <p className="mt-1 text-xs text-muted">Approved {approvedWhen(selected.reviewedAt)}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {canReview && selected.status === "approved" && selected.personName ? (
                <button type="button" onClick={() => void confirmationPdf(selected)} className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-ink px-3 text-sm font-semibold text-white transition duration-150 hover:bg-deep">
                  <FileDown className="size-4" />
                  PDF confirmation
                </button>
              ) : null}
              {canReview ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void removeCalendarEvent({ data: { id: selected.id } }).then((result) => {
                      if (!result.ok) setNote(result.error);
                      else {
                        setSelected(null);
                        reload();
                      }
                    });
                  }}
                  className="h-10 rounded-[6px] border border-line px-3 text-sm font-semibold text-ink transition duration-150 hover:border-crimson hover:text-crimson"
                >
                  Remove
                </button>
              ) : null}
              <button type="button" onClick={() => setSelected(null)} className="h-10 px-3 text-sm font-semibold text-muted transition duration-150 hover:text-ink">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-30 grid place-items-center bg-ink/30 p-4" onClick={() => setOpen(null)}>
          <form
            className="w-full max-w-md rounded-[6px] bg-surface p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void (open === "request" ? sendRequest() : sendOffice());
            }}
          >
            <h3 className="text-lg font-semibold text-ink">{open === "request" ? "Request time" : "Office date"}</h3>
            <label className="mt-4 block text-sm font-medium">
              Type
              <select
                value={kind}
                onChange={(event) => {
                  const next = event.target.value;
                  setKind(next);
                  if (next === "ooo") setTitle("Out of Office");
                  if (next === "late") setTitle("Arriving Late");
                  if (next === "conference" || next === "holiday" || next === "meeting") setTitle("");
                }}
                className="mt-1 h-10 w-full rounded-sm border border-line bg-surface px-3 text-sm font-normal"
              >
                {open === "request" ? (
                  <>
                    <option value="ooo">Out of Office</option>
                    <option value="late">Arriving Late</option>
                    <option value="conference">Conference</option>
                  </>
                ) : (
                  <>
                    <option value="holiday">Holiday</option>
                    <option value="meeting">Staff Meeting</option>
                  </>
                )}
              </select>
            </label>
            <label className="mt-3 block text-sm font-medium">
              Calendar label
              <input value={title} onChange={(event) => setTitle(event.target.value)} required className="mt-1 h-10 w-full rounded-sm border border-line px-3 text-sm font-normal" placeholder="Out of Office, Adobe Conference, Thanksgiving" />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-sm font-medium">
                From
                <input type="date" value={start} onChange={(event) => setStart(event.target.value)} required className="mt-1 h-10 w-full rounded-sm border border-line px-2 text-sm font-normal" />
              </label>
              <label className="text-sm font-medium">
                Through
                <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} required className="mt-1 h-10 w-full rounded-sm border border-line px-2 text-sm font-normal" />
              </label>
            </div>
            {open === "request" ? (
              <label className="mt-3 block text-sm font-medium">
                Note for the operations manager
                <textarea value={detail} onChange={(event) => setDetail(event.target.value)} className="mt-1 h-20 w-full rounded-sm border border-line px-3 py-2 text-sm font-normal" />
              </label>
            ) : null}
            {formError && open === "request" ? <p className="mt-3 text-sm text-deep">{formError}</p> : null}
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={busy} className="h-10 rounded-[6px] bg-ink px-3 text-sm font-semibold text-white transition duration-150 hover:bg-deep disabled:opacity-60">
                {busy ? "Saving…" : open === "request" ? "Send request" : "Add"}
              </button>
              <button type="button" onClick={() => setOpen(null)} className="h-10 px-3 text-sm font-semibold text-muted transition duration-150 hover:text-ink">
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
