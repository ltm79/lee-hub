import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { PortalReady } from "@/lib/portal.types";
import { roleLabel } from "@/lib/portal.types";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "L";
}

export function PeopleBoard({ snap }: { snap: PortalReady }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const people = useMemo(
    () =>
      snap.people.filter((person) => {
        if (!q) return true;
        return [person.name, person.email, person.title, person.role].join(" ").toLowerCase().includes(q);
      }),
    [q, snap.people],
  );

  return (
    <div>
      <p className="text-sm font-medium text-crimson">Directory</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">People</h1>
      <p className="mt-2 max-w-xl text-muted">
        Everyone with an active login. Titles are set by an administrator.
      </p>
      <div className="relative mt-6 max-w-xl">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or email"
          aria-label="Search people"
          className="h-10 w-full rounded-md border border-line bg-surface pl-10 text-base shadow-card outline-none transition duration-150 ease-smooth-out placeholder:text-faint focus:border-crimson"
        />
      </div>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {people.map((person) => (
          <li key={person.userId} className="rounded-lg border border-line bg-surface p-4 shadow-card transition duration-200 ease-smooth-out hover:border-crimson hover:shadow-lift">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-sm bg-blush text-sm font-semibold text-deep">
                {initials(person.name)}
              </span>
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{person.name}</h2>
                <p className="truncate text-sm text-muted">
                  {person.title || roleLabel(person.role)}
                </p>
              </div>
            </div>
            <a href={`mailto:${person.email}`} className="mt-4 block truncate text-sm text-crimson">
              {person.email}
            </a>
          </li>
        ))}
      </ul>
      {people.length === 0 ? <p className="mt-8 text-muted">No one matches that search.</p> : null}
    </div>
  );
}
