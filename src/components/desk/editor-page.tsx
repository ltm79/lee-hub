import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, FolderArchive, Mail } from "lucide-react";
import { checkedWithoutFile, packetFiles } from "@/lib/desk/docs";
import { blockers, KIND_META, streetAddress, type Packet } from "@/lib/desk/types";
import { downloadVoucher } from "@/lib/desk/fill";
import { downloadPacket, emailPacket } from "@/lib/desk/packet";
import { useDesk, useDeskHydrated } from "@/lib/desk/store";
import { listRecipients, type StaffRecipient } from "@/lib/desk/people";
import { useMember } from "@/lib/desk/use-member";
import { hydrateSubmitted } from "@/lib/desk/review";
import { sectionsFor, VoucherSection } from "@/components/desk/forms";
import { PrimaryButton, SecondaryButton } from "@/components/desk/ui";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function EditorPage({ id }: { id: string }) {
  const ready = useDeskHydrated();
  const { user, isPending } = useCurrentUserState();
  const { role, pending: memberPending } = useMember();
  const own = useDesk((state) => state.packets.find((item) => item.id === id));
  const [foreign, setForeign] = useState<Packet | null>(null);
  const [agentName, setAgentName] = useState("");
  const [foreignReady, setForeignReady] = useState(false);
  const updateAnswer = useDesk((state) => state.updateAnswer);
  const setStatus = useDesk((state) => state.setStatus);
  const saveNow = useDesk((state) => state.saveNow);
  const defaultEmail = useDesk((state) => state.defaultEmail);
  const setDefaultEmail = useDesk((state) => state.setDefaultEmail);
  const [section, setSection] = useState("property");
  const [busy, setBusy] = useState<"" | "pdf" | "packet" | "email" | "save">("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [staff, setStaff] = useState<StaffRecipient[]>([]);

  useEffect(() => {
    if (isPending || !user) return;
    let stop = false;
    void listRecipients()
      .then((rows) => {
        if (!stop) setStaff(rows);
      })
      .catch(() => {
        if (!stop) setStaff([]);
      });
    return () => {
      stop = true;
    };
  }, [isPending, user?.id]);

  useEffect(() => {
    if (!ready || memberPending) return;
    if (own || (role !== "staff" && role !== "admin")) {
      setForeign(null);
      setForeignReady(true);
      return;
    }
    let stop = false;
    setForeignReady(false);
    void hydrateSubmitted(id).then((row) => {
      if (stop) return;
      setForeign(row);
      setAgentName(row ? `${row.agentName}${row.office ? `, ${row.office}` : ""}` : "");
      setForeignReady(true);
    });
    return () => {
      stop = true;
    };
  }, [ready, memberPending, own, role, id]);

  const packet = own ?? foreign;
  const viewOnly = !own && Boolean(foreign);

  if (!ready || isPending || memberPending || !foreignReady) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-sm text-muted">Opening voucher…</p>
      </main>
    );
  }

  if (!user) return <RedirectToSignIn />;

  if (!packet) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="font-serif text-4xl">This voucher is not on your account</h1>
        <p className="mt-3 text-ink-soft">Drafts follow the agent who signed in, not the browser.</p>
        <Link to="/deals" className="mt-6 inline-flex h-11 items-center font-semibold text-red">
          Back to Deal Desk
        </Link>
      </main>
    );
  }

  const title = streetAddress(packet.answers.address);
  const meta = KIND_META[packet.kind];
  const sections = sectionsFor(packet.kind);
  const missing = blockers(packet.kind, packet.answers);
  const files = packetFiles(packet);
  const uncheckedFiles = checkedWithoutFile(packet);
  const active = sections.some((item) => item.id === section) ? section : "property";
  const storedStaff = (packet.answers.sendStaff ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const legacyEmails = (packet.answers.sendTo ?? defaultEmail)
    .split(/[,;]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const selectedIds = storedStaff.length
    ? storedStaff
    : staff.filter((person) => legacyEmails.includes(person.email.toLowerCase())).map((person) => person.userId);
  const chosen = staff.filter((person) => selectedIds.includes(person.userId));
  const email = chosen.map((person) => person.email).join(", ");
  const emailOk = chosen.length > 0;
  const readyToSend = missing.length === 0 && emailOk;

  function toggleStaff(userId: string) {
    if (!packet) return;
    const next = new Set(selectedIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    const people = staff.filter((person) => next.has(person.userId));
    const ids = people.map((person) => person.userId).join(",");
    const addresses = people.map((person) => person.email).join(", ");
    updateAnswer(packet.id, "sendStaff", ids);
    updateAnswer(packet.id, "sendTo", addresses);
    setDefaultEmail(addresses);
  }

  function leftOutNote(count: number) {
    if (count <= 0) return;
    setError(
      count === 1
        ? "1 attached file is no longer in this browser and was left out of the voucher."
        : `${count} attached files are no longer in this browser and were left out of the voucher.`,
    );
  }

  async function onSaveDraft() {
    if (!packet) return;
    setBusy("save");
    setError("");
    setNote("");
    try {
      await saveNow(packet.id);
      setNote("Draft saved. It stays on your login if you leave this page.");
    } catch {
      setError("The draft could not be saved. Try again.");
    } finally {
      setBusy("");
    }
  }

  async function onDownload() {
    if (!packet) return;
    setBusy("pdf");
    setError("");
    setNote("");
    try {
      await downloadVoucher(packet);
    } catch {
      setError("The PDF could not be built. Try again.");
    } finally {
      setBusy("");
    }
  }

  async function onPacket() {
    if (!packet) return;
    setBusy("packet");
    setError("");
    setNote("");
    try {
      leftOutNote(await downloadPacket(packet));
    } catch {
      setError("The voucher could not be built. Try again.");
    } finally {
      setBusy("");
    }
  }

  async function onEmail() {
    if (!packet || !readyToSend) return;
    setBusy("email");
    setError("");
    setNote("");
    try {
      const result = await emailPacket(packet, email);
      leftOutNote(result.missing);
      setNote(
        `A draft is ready for ${chosen.map((person) => person.name).join(", ")}. Open it if it downloaded — Outlook or Apple Mail, whichever is the default, will show the voucher and each file. Send it from there, then mark this voucher submitted.`,
      );
    } catch (caught) {
      const failed = caught as { message?: string };
      setError(failed.message || "The mail draft could not be built. Try again.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="min-h-screen">
      <div className="h-1 bg-red" />
      <header className="sticky top-0 z-20 border-b border-line bg-paper">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/deals" className="inline-flex h-11 shrink-0 items-center gap-2 text-sm font-semibold text-ink">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Desk
            </Link>
            <div className="min-w-0 flex-1">
              {title ? <p className="truncate text-sm font-semibold text-ink">{title}</p> : null}
              <p className="truncate text-xs text-muted">
                {meta.short} · {packet.status === "submitted" ? "Submitted" : "Draft"}
                {files.length ? ` · ${files.length} file${files.length === 1 ? "" : "s"}` : ""}
              </p>
            </div>
            <PrimaryButton className="shrink-0" disabled={busy !== ""} onClick={() => void onDownload()}>
              <Download className="size-4" aria-hidden="true" />
              {busy === "pdf" ? "Building…" : "PDF"}
            </PrimaryButton>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto" aria-label="Voucher sections">
            {sections.map((item) => {
              const needs = missing.some((issue) => issue.section === item.id);
              const selected = item.id === active;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={selected ? "page" : undefined}
                  onClick={() => {
                    setSection(item.id);
                    document.getElementById("voucher-form")?.scrollIntoView({ block: "start" });
                  }}
                  className={`h-11 shrink-0 rounded-md border px-3 text-sm font-medium ${
                    selected ? "border-ink bg-ink text-card" : "border-line bg-card text-ink"
                  }`}
                >
                  {item.label}
                  {needs ? <span className="ml-2 inline-block size-2 rounded-full bg-red align-middle" /> : null}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main id="voucher-form" className="mx-auto max-w-3xl scroll-mt-36 px-4 py-5 sm:px-6">
        <div className="mb-4 flex justify-end">
          <UserButton />
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-red">{meta.title}</p>
        {title ? <h1 className="mt-1 font-serif text-4xl">{title}</h1> : null}
        {viewOnly ? (
          <p className="mt-2 text-sm text-ink-soft">Submitted by {agentName}. Staff can read this voucher and its files. The agent still owns the draft.</p>
        ) : null}
        <div className="mt-4 mb-4 grid gap-3">
          <p className="text-sm text-ink-soft">
            {missing.length === 0
              ? "Required fields are in."
              : `Still needs ${missing.map((item) => item.label.toLowerCase()).join(", ")}.`}
            {files.length === 0
              ? " No backup files attached yet."
              : ` ${files.length} backup file${files.length === 1 ? "" : "s"} attached.`}
            {uncheckedFiles > 0
              ? ` ${uncheckedFiles} checked document${uncheckedFiles === 1 ? "" : "s"} still need a file.`
              : ""}
          </p>
          {error ? <p className="text-sm text-red-deep">{error}</p> : null}
          {note ? <p className="text-sm text-ink-soft">{note}</p> : null}
          <div className="flex flex-wrap gap-2">
            {viewOnly ? null : (
              <SecondaryButton disabled={busy !== ""} onClick={() => void onSaveDraft()}>
                {busy === "save" ? "Saving…" : "Save draft"}
              </SecondaryButton>
            )}
            {viewOnly ? null : (
              <PrimaryButton disabled={!readyToSend || busy !== ""} onClick={() => void onEmail()}>
                <Mail className="size-4" aria-hidden="true" />
                {busy === "email" ? "Sending…" : "Send"}
              </PrimaryButton>
            )}
            <SecondaryButton disabled={busy !== ""} onClick={() => void onPacket()}>
              <FolderArchive className="size-4" aria-hidden="true" />
              {busy === "packet" ? "Building…" : "Download voucher"}
            </SecondaryButton>
            {viewOnly ? null : (
              <SecondaryButton
                disabled={missing.length > 0 || busy !== ""}
                onClick={() => setStatus(packet.id, packet.status === "submitted" ? "draft" : "submitted")}
              >
                {packet.status === "submitted" ? "Move to drafts" : "Mark submitted"}
              </SecondaryButton>
            )}
          </div>
          {viewOnly ? null : (
          <p className="text-xs text-muted">
            Send opens a draft in Outlook, Apple Mail, or whichever mail app is the default. The staff you picked are already addressed, and the voucher PDF and each backup file are attached on their own.
          </p>
          )}
        </div>
        <VoucherSection
          packetId={packet.id}
          kind={packet.kind}
          section={active}
          answers={packet.answers}
          set={(key, value) => updateAnswer(packet.id, key, value)}
        />
        {!viewOnly && active === sections[sections.length - 1]?.id ? (
          <fieldset className="mt-4">
            <legend className="text-sm text-ink-soft">Email the voucher to</legend>
            {staff.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                No staff with an email login yet. An admin adds them under People, using their email as the username.
              </p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {staff.map((person) => {
                  const on = selectedIds.includes(person.userId);
                  return (
                    <li key={person.userId}>
                      <label
                        className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${
                          on ? "border-ink bg-card" : "border-line bg-card"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleStaff(person.userId)}
                          className="size-4 accent-red"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-ink">{person.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {person.office ? `${person.office} · ` : ""}
                            {person.email}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">Pick one staff member, or several. Each person gets the same voucher.</p>
          </fieldset>
        ) : null}
      </main>
    </div>
  );
}
