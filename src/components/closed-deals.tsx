import { useEffect, useState } from "react";
import { dealiusMyDeals, type MyDeals } from "@/lib/dealius.functions";

function fiscalStart(now = new Date()) {
  const year = now.getMonth() >= 1 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-02-01`;
}

function fiscalEnd(now = new Date()) {
  const year = now.getMonth() >= 1 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year + 1}-01-31`;
}

function shownDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[2]}/${match[3]}/${match[1]}`;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function feet(value: number) {
  if (!value) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function ClosedDeals() {
  const [from, setFrom] = useState(fiscalStart);
  const [to, setTo] = useState(fiscalEnd);
  const [board, setBoard] = useState<MyDeals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stop = false;
    setLoading(true);
    function load() {
      void dealiusMyDeals({ data: { from, to } })
        .then((result) => {
          if (stop) return;
          setBoard(result);
          setLoading(Boolean(result.ok && result.partial));
          if (result.ok && result.partial) window.setTimeout(load, 400);
        })
        .catch(() => {
          if (stop) return;
          setBoard({ ok: false, error: "Closed deals could not be loaded." });
          setLoading(false);
        });
    }
    load();
    return () => {
      stop = true;
    };
  }, [from, to]);

  const rows = board?.ok ? board.rows : [];
  const paid = rows.some((row) => row.paid);
  const total = rows.reduce((sum, row) => sum + row.commission, 0);

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Closed deals</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Your closed Dealius deals for the fiscal year, February 1 through January 31. Change the dates to look at another range.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <label className="flex h-10 items-center gap-2 rounded-sm border border-line bg-surface px-3 text-sm">
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="bg-transparent" />
        </label>
        <label className="flex h-10 items-center gap-2 rounded-sm border border-line bg-surface px-3 text-sm">
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="bg-transparent" />
        </label>
      </div>
      {loading ? <p className="mt-6 text-sm text-muted">Loading your closed deals…</p> : null}
      {board && !board.ok ? <p className="mt-6 text-sm text-muted">{board.error}</p> : null}
      {board?.ok && board.note ? <p className="mt-3 max-w-2xl text-sm text-muted">{board.note}</p> : null}
      {board?.ok ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 text-right font-medium">SF</th>
                <th className="px-4 py-3 font-medium">Deal type</th>
                <th className="px-4 py-3 font-medium">{paid ? "Date paid" : "Date closed"}</th>
                <th className="px-4 py-3 text-right font-medium">Commission</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-4 py-3">{row.address}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{feet(row.squareFeet)}</td>
                  <td className="px-4 py-3">{row.dealType || "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{shownDate(row.paid || row.closed)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{money(row.commission)}</td>
                </tr>
              ))}
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-muted">
                    No closed deals for this login in that range. The Lee Hub email has to match the broker email in Dealius.
                  </td>
                </tr>
              ) : null}
            </tbody>
            {rows.length > 0 ? (
              <tfoot className="border-t border-line">
                <tr>
                  <td className="px-4 py-3 font-medium" colSpan={4}>
                    {rows.length} {rows.length === 1 ? "deal" : "deals"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(total)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : null}
    </div>
  );
}
