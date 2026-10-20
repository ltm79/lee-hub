import { useEffect, useState } from "react";
import { createPerson, deletePerson, listPeople, OFFICES, resetPersonPassword, setPersonActive, setPersonOffice, type Member, type Office } from "@/lib/desk/people";
import { PrimaryButton, SecondaryButton } from "@/components/desk/ui";

export function PeoplePanel() {
  const [people, setPeople] = useState<Member[]>([]);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"agent" | "staff">("agent");
  const [office, setOffice] = useState<"" | Office>("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setPeople(await listPeople());
  }

  useEffect(() => {
    void refresh().catch(() => setError("The user list could not be loaded."));
  }, []);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNote("");
    try {
      if (!office) throw new Error("Choose LA Central or City of Industry.");
      await createPerson({ data: { username, name, password, role, office } });
      setUsername("");
      setName("");
      setPassword("");
      setOffice("");
      setNote(`${name.trim()} can sign in now.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That person could not be added.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="font-serif text-2xl">People</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Agents keep their own drafts. Staff can open every voucher an agent has submitted, including the backup files.
      </p>
      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => void onCreate(event)}>
        <label className="block">
          <span className="text-sm text-ink-soft">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 h-11 w-full rounded-md border border-line bg-card px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm text-ink-soft">Username or email</span>
          <input
            value={username}
            autoCapitalize="none"
            onChange={(event) => setUsername(event.target.value)}
            className="mt-1 h-11 w-full rounded-md border border-line bg-card px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm text-ink-soft">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 h-11 w-full rounded-md border border-line bg-card px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm text-ink-soft">Role</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value === "staff" ? "staff" : "agent")}
            className="mt-1 h-11 w-full rounded-md border border-line bg-card px-3 text-sm"
          >
            <option value="agent">Agent</option>
            <option value="staff">Staff</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-ink-soft">Office</span>
          <select
            value={office}
            onChange={(event) => setOffice(event.target.value === "City of Industry" ? "City of Industry" : event.target.value === "LA Central" ? "LA Central" : "")}
            className="mt-1 h-11 w-full rounded-md border border-line bg-card px-3 text-sm"
          >
            <option value="">Choose an office</option>
            {OFFICES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2">
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add person"}
          </PrimaryButton>
        </div>
      </form>
      {error ? <p className="mt-3 text-sm text-red-deep">{error}</p> : null}
      {note ? <p className="mt-3 text-sm text-ink-soft">{note}</p> : null}
      <ul className="mt-4 grid gap-2">
        {people.map((person) => (
          <PersonRow key={person.userId} person={person} onChange={() => void refresh()} />
        ))}
      </ul>
    </section>
  );
}

function PersonRow({ person, onChange }: { person: Member; onChange: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="rounded-lg border border-line bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{person.name}</p>
          <p className="text-sm text-muted">
            {person.username} · {person.role}
            {person.office ? ` · ${person.office}` : ""}
            {person.active ? "" : " · off"}
          </p>
        </div>
        {person.role === "admin" ? null : (
          <div className="flex flex-wrap gap-2">
            <SecondaryButton
              onClick={() => {
                void setPersonActive({ data: { userId: person.userId, active: !person.active } })
                  .then(onChange)
                  .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not update that login."));
              }}
            >
              {person.active ? "Turn off" : "Turn on"}
            </SecondaryButton>
            {confirming ? (
              <SecondaryButton
                onClick={() => {
                  setError("");
                  void deletePerson({ data: person.userId })
                    .then(() => {
                      setConfirming(false);
                      onChange();
                    })
                    .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not delete that login."));
                }}
              >
                Delete {person.name}
              </SecondaryButton>
            ) : (
              <SecondaryButton onClick={() => setConfirming(true)}>Delete</SecondaryButton>
            )}
          </div>
        )}
      </div>
      {confirming ? (
        <p className="mt-3 text-sm text-ink-soft">
          This removes the login, their drafts, and any vouchers they submitted.
          <button type="button" className="ml-3 font-semibold text-ink" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </p>
      ) : null}
      {person.role === "admin" ? null : (
        <label className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-soft">Office</span>
          <select
            value={person.office}
            aria-label={`Office for ${person.username}`}
            onChange={(event) => {
              const office = event.target.value === "City of Industry" ? "City of Industry" : "LA Central";
              setError("");
              void setPersonOffice({ data: { userId: person.userId, office } })
                .then(onChange)
                .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not change the office."));
            }}
            className="h-11 min-w-0 flex-1 rounded-md border border-line bg-paper px-3 text-sm"
          >
            {person.office ? null : <option value="">Choose an office</option>}
            {OFFICES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      )}
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          void resetPersonPassword({ data: { userId: person.userId, password } })
            .then(() => {
              setPassword("");
            })
            .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not reset the password."));
        }}
      >
        <input
          type="password"
          value={password}
          placeholder="New password"
          aria-label={`New password for ${person.username}`}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-md border border-line bg-paper px-3 text-sm"
        />
        <SecondaryButton type="submit">Reset password</SecondaryButton>
      </form>
      {error ? <p className="mt-2 text-sm text-red-deep">{error}</p> : null}
    </li>
  );
}
