import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Banknote, Building2, FileText, FolderArchive, Handshake, Trash2 } from "lucide-react";
import { KIND_META, KIND_ORDER, packetTitle, type Kind, type Packet } from "@/lib/desk/types";
import { packetFiles } from "@/lib/desk/docs";
import { downloadVoucher } from "@/lib/desk/fill";
import { downloadPacket } from "@/lib/desk/packet";
import { sampleAnswers, useDesk, useDeskHydrated } from "@/lib/desk/store";
import { useMember } from "@/lib/desk/use-member";
import { listLinkedAgents, listSubmitted, type SubmittedRow } from "@/lib/desk/people";
import { hydrateSubmitted } from "@/lib/desk/review";
import { PrimaryButton, SecondaryButton } from "@/components/desk/ui";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

const ICONS = {
  lease: Building2,
  sale: FileText,
  consult: Handshake,
  additional: Banknote,
} as const;

export function HomePage() {
  const navigate = useNavigate();
  const ready = useDeskHydrated();
  const { user, isPending } = useCurrentUserState();
  const { member, role, pending: memberPending } = useMember();
  const [submitted, setSubmitted] = useState<SubmittedRow[]>([]);
  const [agentFilter, setAgentFilter] = useState("all");
  const [forAgent, setForAgent] = useState("");
  const [linkedAgents, setLinkedAgents] = useState<{ userId: string; name: string; office: string }[]>([]);
  const packets = useDesk((state) => state.packets);
  const saveError = useDesk((state) => state.saveError);
  const createPacket = useDesk((state) => state.createPacket);
  const removePacket = useDesk((state) => state.removePacket);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "draft" | "submitted">("all");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (role !== "assistant") return;
    void listLinkedAgents()
      .then((rows) => {
        setLinkedAgents(rows);
        setForAgent((current) => current || rows[0]?.userId || "");
      })
      .catch(() => setLinkedAgents([]));
  }, [role]);

  useEffect(() => {
    if (role !== "admin" && role !== "staff") return;
    void listSubmitted()
      .then(setSubmitted)
      .catch(() => setError("Submitted vouchers could not be loaded."));
  }, [role]);

  const agents = useMemo(() => {
    const names = new Map<string, string>();
    for (const row of submitted) {
      names.set(row.username, row.office ? `${row.agentName} · ${row.office}` : row.agentName);
    }
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [submitted]);
  const shownSubmitted =
    agentFilter === "all" ? submitted : submitted.filter((row) => row.username === agentFilter);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...packets]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((packet) => (filter === "all" ? true : packet.status === filter))
      .filter((packet) => {
        if (!needle) return true;
        const hay = `${packet.answers.address ?? ""} ${packet.answers.city ?? ""} ${KIND_META[packet.kind].title} ${packetFiles(packet)
          .map((file) => file.name)
          .join(" ")}`.toLowerCase();
        return hay.includes(needle);
      });
  }, [packets, query, filter]);

  function openNew(kind: Kind, answers?: Packet["answers"]) {
    if (role === "assistant" && !forAgent) {
      setError("Choose the agent this voucher is for.");
      return;
    }
    const id = createPacket(kind, answers, role === "assistant" ? forAgent : undefined);
    void navigate({ to: "/vouchers/$id", params: { id } });
  }

  if (!ready || isPending || memberPending) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-sm text-muted">Opening your desk…</p>
      </main>
    );
  }

  if (!user) return <RedirectToSignIn />;

  if (!member) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="font-serif text-4xl">This login is not on the desk</h1>
        <p className="mt-3 text-ink-soft">Ask an admin for a username and password.</p>
        <div className="mt-6">
          <UserButton />
        </div>
      </main>
    );
  }

  const office = role === "admin" || role === "staff";
  const filing = role === "agent" || role === "assistant";

  return (
    <div className="min-h-screen">
      <div className="h-1 bg-red" />
      <header className="border-b border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-red">Lee & Associates</p>
            <UserButton />
          </div>
          <h1 className="mt-2 font-serif text-4xl text-ink sm:text-5xl">Deal Desk</h1>
          <p className="mt-3 max-w-2xl text-base text-ink-soft">
            {role === "assistant"
              ? "File a voucher on an agent's login. Staff see it after you mark it submitted."
              : role === "staff" || role === "admin"
                ? "Submitted vouchers from every agent land here, with the backup files attached to them."
                : "Your drafts stay on this login. Start a voucher here and it is waiting the next time you sign in."}
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-6 sm:py-8">
        {saveError ? <p className="text-sm text-red-deep">{saveError}</p> : null}
        {office ? (
          <section>
            <h2 className="font-serif text-2xl">Submitted</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Agents still finish their own drafts. This list is only what they have marked submitted.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="block">
                <span className="sr-only">Agent</span>
                <select
                  value={agentFilter}
                  onChange={(event) => setAgentFilter(event.target.value)}
                  aria-label="Filter by agent"
                  className="h-11 rounded-md border border-line bg-card px-3 text-sm"
                >
                  <option value="all">All agents</option>
                  {agents.map(([username, name]) => (
                    <option key={username} value={username}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {shownSubmitted.length === 0 ? (
              <p className="mt-4 text-sm text-muted">
                {submitted.length === 0 ? "Nothing has been submitted yet." : "Nothing from that agent."}
              </p>
            ) : (
              <ul className="mt-4 grid gap-2">
                {shownSubmitted.map((packet) => (
                  <li key={packet.id} className="rounded-lg border border-line bg-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-red">
                      {KIND_META[packet.kind].short} · {packet.agentName}
                      {packet.office ? ` · ${packet.office}` : ""}
                    </p>
                    <h3 className="font-serif text-2xl">{packetTitle(packet)}</h3>
                    <p className="text-sm text-muted">
                      {packet.username}
                      {packet.answers.city ? ` · ${packet.answers.city}` : ""}
                      {packetFiles(packet).length
                        ? ` · ${packetFiles(packet).length} file${packetFiles(packet).length === 1 ? "" : "s"}`
                        : ""}
                    </p>
                    <PrimaryButton
                      className="mt-3"
                      onClick={() => {
                        void hydrateSubmitted(packet.id).then(() =>
                          navigate({ to: "/vouchers/$id", params: { id: packet.id } }),
                        );
                      }}
                    >
                      Open
                    </PrimaryButton>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
        {filing ? (
        <>
        <section>
          <h2 className="font-serif text-2xl">New voucher</h2>
          {role === "assistant" ? (
            linkedAgents.length === 0 ? (
              <p className="mt-3 text-sm text-muted">An administrator has not linked you to an agent yet.</p>
            ) : (
              <label className="mt-4 block max-w-sm text-sm font-medium">
                File for
                <select
                  value={forAgent}
                  onChange={(event) => setForAgent(event.target.value)}
                  className="mt-2 h-11 w-full rounded-md border border-line bg-card px-3 text-sm font-normal"
                >
                  {linkedAgents.map((agent) => (
                    <option key={agent.userId} value={agent.userId}>
                      {agent.name}
                      {agent.office ? ` · ${agent.office}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {KIND_ORDER.map((kind) => {
              const meta = KIND_META[kind];
              const Icon = ICONS[kind];
              return (
                <article key={kind} className="flex flex-col rounded-lg border border-line bg-card p-4">
                  <Icon className="size-5 text-red" aria-hidden="true" />
                  <h3 className="mt-3 font-serif text-2xl">{meta.short}</h3>
                  <p className="mt-1 text-xs font-medium uppercase tracking-widest text-muted">{meta.pages}</p>
                  <p className="mt-2 flex-1 text-sm text-ink-soft">{meta.blurb}</p>
                  <PrimaryButton className="mt-4 w-full" onClick={() => openNew(kind)}>
                    Start
                  </PrimaryButton>
                </article>
              );
            })}
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-serif text-2xl">Vouchers</h2>
            <SecondaryButton onClick={() => openNew("lease", sampleAnswers())}>Open a sample lease</SecondaryButton>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            {role === "assistant"
              ? "These vouchers stay on the agent's login. Marking one submitted is what staff can open."
              : "Drafts stay on your username. Marking a voucher submitted is what staff can open."}
          </p>

          {!ready ? (
            <p className="mt-6 text-sm text-muted">Loading saved vouchers…</p>
          ) : packets.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-line-strong bg-card px-4 py-8 text-center">
              <p className="font-serif text-2xl">No vouchers yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
                Start a blank voucher, or open the sample lease to see the rent schedule and commission math already filled in.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search address or city"
                  className="h-11 w-full rounded-md border border-line bg-card px-3 text-sm sm:max-w-xs"
                  aria-label="Search vouchers"
                />
                <div className="flex gap-2">
                  {(
                    [
                      ["all", "All"],
                      ["draft", "Drafts"],
                      ["submitted", "Submitted"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={filter === id}
                      onClick={() => setFilter(id)}
                      className={`h-11 rounded-md border px-3 text-sm font-medium ${
                        filter === id ? "border-ink bg-ink text-card" : "border-line bg-card text-ink"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {visible.length === 0 ? (
                <p className="text-sm text-muted">Nothing matches that filter.</p>
              ) : (
                <ul className="grid gap-2">
                  {visible.map((packet) => (
                    <li key={packet.id} className="rounded-lg border border-line bg-card p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-widest text-red">
                            {KIND_META[packet.kind].short}
                            {packet.answers.sample === "1" ? " · Sample" : ""}
                            {role === "assistant"
                              ? ` · ${linkedAgents.find((agent) => agent.userId === packet.ownerId)?.name ?? "Agent"}`
                              : ""}
                          </p>
                          <h3 className="truncate font-serif text-2xl">{packetTitle(packet)}</h3>
                          <p className="text-sm text-muted">
                            {packet.answers.city ? `${packet.answers.city} · ` : ""}
                            {packet.status === "submitted" ? "Submitted" : "Draft"}
                            {packetFiles(packet).length
                              ? ` · ${packetFiles(packet).length} file${packetFiles(packet).length === 1 ? "" : "s"}`
                              : ""}
                            {" · "}
                            updated {formatDistanceToNow(packet.updatedAt, { addSuffix: true })}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <PrimaryButton onClick={() => void navigate({ to: "/vouchers/$id", params: { id: packet.id } })}>
                            Open
                          </PrimaryButton>
                          <SecondaryButton
                            onClick={() => {
                              setError("");
                              void downloadPacket(packet)
                                .then((leftOut) => {
                                  if (leftOut > 0) {
                                    setError("A file from this voucher is no longer in this browser and was left out.");
                                  }
                                })
                                .catch(() => setError("The voucher could not be built."));
                            }}
                          >
                            <FolderArchive className="size-4" aria-hidden="true" />
                            Voucher
                          </SecondaryButton>
                          <SecondaryButton
                            onClick={() => {
                              setError("");
                              void downloadVoucher(packet).catch(() => setError("The PDF could not be built."));
                            }}
                          >
                            PDF
                          </SecondaryButton>
                          {pendingDelete === packet.id ? (
                            <SecondaryButton
                              onClick={() => {
                                removePacket(packet.id);
                                setPendingDelete(null);
                              }}
                            >
                              Confirm delete
                            </SecondaryButton>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Delete ${packetTitle(packet)}`}
                              onClick={() => setPendingDelete(packet.id)}
                              className="inline-flex size-11 items-center justify-center rounded-md border border-line text-ink-soft"
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {error ? <p className="text-sm text-red-deep">{error}</p> : null}
            </div>
          )}
        </section>
        </>
        ) : null}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-muted sm:px-6">
        500 Citadel Dr. #140, Commerce · 13181 Crossroads Pkwy N #300, City of Industry
      </footer>
    </div>
  );
}
