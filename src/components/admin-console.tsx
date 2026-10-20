import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ServiceIcon, ICON_CHOICES } from "@/components/icons";
import { Button, Modal, TextArea, TextField } from "@/components/ui";
import { clearPortalCache } from "@/components/use-portal";
import {
  createLogin,
  deleteCategory,
  deleteLink,
  loadAdmin,
  moveCategory,
  moveLink,
  resetPassword,
  saveCategory,
  saveLink,
  saveOffice,
  updateMember,
} from "@/lib/portal.functions";
import type { ActionResult, AdminLink, AdminPerson, AdminSnapshot, MemberRole } from "@/lib/portal.types";
import { MEMBER_OFFICES, roleLabel } from "@/lib/portal.types";

function asRole(value: string): MemberRole {
  if (value === "admin" || value === "staff") return value;
  return "agent";
}

type Panel = "links" | "people" | "office";

type LinkDraft = {
  id?: string;
  categoryId: string;
  name: string;
  url: string;
  blurb: string;
  hint: string;
  icon: string;
  active: boolean;
};

function suggestPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function AdminConsole({
  isAdmin,
  office,
}: {
  isAdmin: boolean;
  office: { name: string; city: string; tagline: string };
}) {
  const [panel, setPanel] = useState<Panel>("links");
  const [data, setData] = useState<AdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<AdminPerson | null>(null);
  const [resetting, setResetting] = useState<AdminPerson | null>(null);
  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
  const [confirmLink, setConfirmLink] = useState<string | null>(null);
  const [confirmCategory, setConfirmCategory] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function reload() {
    const result = await loadAdmin();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setData(result.data);
    setError(null);
  }

  useEffect(() => {
    if (!isAdmin) return;
    let cancel = false;
    loadAdmin()
      .then((result) => {
        if (cancel) return;
        if (!result.ok) setError(result.error);
        else setData(result.data);
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Could not load admin");
      });
    return () => {
      cancel = true;
    };
  }, [isAdmin]);

  async function run(action: () => Promise<ActionResult>, success: string) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await action();
      if (!result.ok) {
        setNotice({ tone: "bad", text: result.error });
        return false;
      }
      clearPortalCache();
      await reload();
      setNotice({ tone: "ok", text: success });
      return true;
    } catch (reason) {
      setNotice({
        tone: "bad",
        text: reason instanceof Error ? reason.message : "Could not save that.",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <div>
        <h1 className="text-3xl font-semibold">Admin</h1>
        <p className="mt-3 max-w-xl text-muted">
          Administrators manage logins and the service list. Ask one of them if you need a change.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-3xl font-semibold">Admin</h1>
        <p className="mt-3 text-deep">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <h1 className="text-3xl font-semibold">Admin</h1>
        <p className="mt-3 text-muted">Loading the office controls.</p>
      </div>
    );
  }

  const pending = data.people.filter((person) => person.pending).length;

  return (
    <div>
      <p className="text-sm font-medium text-crimson">Office controls</p>
      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Admin</h1>
          <p className="mt-2 max-w-xl text-muted">
            Create a login for each person, then point Lee Hub at the tools this office actually uses.
          </p>
        </div>
        {panel === "people" ? (
          <Button onClick={() => setLoginOpen(true)}>New login</Button>
        ) : null}
        {panel === "links" ? (
          <Button
            onClick={() =>
              setLinkDraft({
                categoryId: data.categories[0]?.id ?? "",
                name: "",
                url: "",
                blurb: "",
                hint: "",
                icon: "link",
                active: true,
              })
            }
          >
            Add service
          </Button>
        ) : null}
      </div>

      {notice ? (
        <p className={notice.tone === "ok" ? "mt-4 text-sm text-ink" : "mt-4 text-sm text-deep"} role="status">
          {notice.text}
        </p>
      ) : null}
      {pending > 0 ? (
        <button
          type="button"
          onClick={() => setPanel("people")}
          className="mt-4 block rounded-md bg-blush px-3 py-2.5 text-left text-sm text-deep transition duration-150 ease-smooth-out hover:bg-crimson hover:text-on-crimson"
        >
          {pending === 1 ? "1 person is waiting for access." : `${pending} people are waiting for access.`}
        </button>
      ) : null}

      <div className="mt-6 inline-flex rounded-md bg-line/70 p-1">
        {(
          [
            ["links", "Services"],
            ["people", "Logins"],
            ["office", "Office"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPanel(id)}
            className={
              panel === id
                ? "h-9 rounded-sm bg-surface px-3 text-sm font-medium text-ink shadow-card transition duration-150 ease-smooth-out"
                : "h-9 rounded-sm px-3 text-sm font-medium text-muted transition duration-150 ease-smooth-out hover:text-ink"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {panel === "links" ? (
        <LinksPanel
          data={data}
          busy={busy}
          confirmLink={confirmLink}
          confirmCategory={confirmCategory}
          categoryName={categoryName}
          renameId={renameId}
          renameValue={renameValue}
          onCategoryName={setCategoryName}
          onRenameValue={setRenameValue}
          onStartRename={(id, name) => {
            setRenameId(id);
            setRenameValue(name);
          }}
          onCancelRename={() => setRenameId(null)}
          onConfirmLink={setConfirmLink}
          onConfirmCategory={setConfirmCategory}
          onEdit={setLinkDraft}
          onRun={run}
        />
      ) : null}

      {panel === "people" ? (
        <PeoplePanel
          people={data.people}
          busy={busy}
          onEdit={setEditingPerson}
          onReset={setResetting}
          onRun={run}
        />
      ) : null}

      {panel === "office" ? <OfficePanel office={office} busy={busy} onRun={run} /> : null}

      <LoginDialog
        open={loginOpen}
        busy={busy}
        onOpenChange={setLoginOpen}
        onCreate={async (draft) => {
          const ok = await run(
            () => createLogin({ data: draft }),
            `Login created for ${draft.email}. Share the password with them directly.`,
          );
          if (ok) setLoginOpen(false);
        }}
      />

      <PersonDialog
        person={editingPerson}
        busy={busy}
        onClose={() => setEditingPerson(null)}
        onSave={async (draft) => {
          const ok = await run(() => updateMember({ data: draft }), "Login updated.");
          if (ok) setEditingPerson(null);
        }}
      />

      <ResetDialog
        person={resetting}
        busy={busy}
        onClose={() => setResetting(null)}
        onSave={async (userId, password) => {
          const ok = await run(
            () => resetPassword({ data: { userId, password } }),
            "Password updated. Share the new one directly.",
          );
          if (ok) setResetting(null);
        }}
      />

      <LinkDialog
        draft={linkDraft}
        categories={data.categories}
        busy={busy}
        onClose={() => setLinkDraft(null)}
        onChange={setLinkDraft}
        onSave={async (draft) => {
          const ok = await run(
            () => saveLink({ data: draft }),
            draft.id ? "Service updated." : "Service added.",
          );
          if (ok) setLinkDraft(null);
        }}
      />
    </div>
  );
}

function LinksPanel({
  data,
  busy,
  confirmLink,
  confirmCategory,
  categoryName,
  renameId,
  renameValue,
  onCategoryName,
  onRenameValue,
  onStartRename,
  onCancelRename,
  onConfirmLink,
  onConfirmCategory,
  onEdit,
  onRun,
}: {
  data: AdminSnapshot;
  busy: boolean;
  confirmLink: string | null;
  confirmCategory: string | null;
  categoryName: string;
  renameId: string | null;
  renameValue: string;
  onCategoryName: (value: string) => void;
  onRenameValue: (value: string) => void;
  onStartRename: (id: string, name: string) => void;
  onCancelRename: () => void;
  onConfirmLink: (id: string | null) => void;
  onConfirmCategory: (id: string | null) => void;
  onEdit: (draft: LinkDraft) => void;
  onRun: (action: () => Promise<ActionResult>, success: string) => Promise<boolean>;
}) {
  return (
    <div className="mt-8 flex flex-col gap-8">
      {data.categories.map((category, index) => {
        const links = data.links.filter((link) => link.categoryId === category.id);
        return (
          <section key={category.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              {renameId === category.id ? (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void onRun(
                      () => saveCategory({ data: { id: category.id, name: renameValue } }),
                      "Group renamed.",
                    ).then((ok) => {
                      if (ok) onCancelRename();
                    });
                  }}
                >
                  <input
                    value={renameValue}
                    onChange={(event) => onRenameValue(event.target.value)}
                    aria-label="Group name"
                    className="h-11 rounded-sm border border-line bg-surface px-3"
                  />
                  <Button type="submit" disabled={busy}>
                    Save
                  </Button>
                  <Button variant="ghost" onClick={onCancelRename}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <h2 className="text-lg font-semibold">{category.name}</h2>
              )}
              <div className="flex flex-wrap gap-1">
                <Button
                  variant="ghost"
                  aria-label={`Move ${category.name} up`}
                  disabled={busy || index === 0}
                  onClick={() => void onRun(() => moveCategory({ data: { id: category.id, direction: "up" } }), "Group order updated.")}
                >
                  <ChevronUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Move ${category.name} down`}
                  disabled={busy || index === data.categories.length - 1}
                  onClick={() => void onRun(() => moveCategory({ data: { id: category.id, direction: "down" } }), "Group order updated.")}
                >
                  <ChevronDown className="size-4" />
                </Button>
                <Button variant="ghost" onClick={() => onStartRename(category.id, category.name)}>
                  Rename
                </Button>
                {confirmCategory === category.id ? (
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      void onRun(
                        () => deleteCategory({ data: { id: category.id } }),
                        "Group removed.",
                      ).then(() => onConfirmCategory(null))
                    }
                  >
                    Confirm remove
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => onConfirmCategory(category.id)}>
                    Remove group
                  </Button>
                )}
              </div>
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {links.map((link) => (
                <LinkRow
                  key={link.id}
                  link={link}
                  busy={busy}
                  confirming={confirmLink === link.id}
                  onEdit={() =>
                    onEdit({
                      id: link.id,
                      categoryId: link.categoryId,
                      name: link.name,
                      url: link.url,
                      blurb: link.blurb,
                      hint: link.hint,
                      icon: link.icon,
                      active: link.active,
                    })
                  }
                  onMove={(direction) =>
                    void onRun(() => moveLink({ data: { id: link.id, direction } }), "Order updated.")
                  }
                  onAskRemove={() => onConfirmLink(link.id)}
                  onRemove={() =>
                    void onRun(() => deleteLink({ data: { id: link.id } }), "Service removed.").then(
                      () => onConfirmLink(null),
                    )
                  }
                />
              ))}
              {links.length === 0 ? <li className="text-sm text-muted">No services in this group.</li> : null}
            </ul>
          </section>
        );
      })}

      <form
        className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void onRun(() => saveCategory({ data: { name: categoryName } }), "Group added.").then((ok) => {
            if (ok) onCategoryName("");
          });
        }}
      >
        <label className="block flex-1 text-sm font-medium">
          New group
          <input
            value={categoryName}
            onChange={(event) => onCategoryName(event.target.value)}
            placeholder="Property management"
            className="mt-2 h-10 w-full rounded-sm border border-line bg-paper px-3 text-base font-normal"
          />
        </label>
        <Button type="submit" variant="secondary" disabled={busy || !categoryName.trim()}>
          Add group
        </Button>
      </form>
    </div>
  );
}

function LinkRow({
  link,
  busy,
  confirming,
  onEdit,
  onMove,
  onAskRemove,
  onRemove,
}: {
  link: AdminLink;
  busy: boolean;
  confirming: boolean;
  onEdit: () => void;
  onMove: (direction: "up" | "down") => void;
  onAskRemove: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 transition duration-200 ease-smooth-out hover:border-crimson sm:flex-row sm:items-center">
      <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-blush text-crimson">
        <ServiceIcon name={link.icon} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {link.name}
          {link.active ? null : <span className="ml-2 text-sm font-normal text-faint">Hidden</span>}
        </p>
        <p className="truncate text-sm text-muted">{link.url}</p>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" aria-label={`Move ${link.name} up`} onClick={() => onMove("up")}>
          <ChevronUp className="size-4" />
        </Button>
        <Button variant="ghost" aria-label={`Move ${link.name} down`} onClick={() => onMove("down")}>
          <ChevronDown className="size-4" />
        </Button>
        <Button variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        {confirming ? (
          <Button variant="danger" disabled={busy} onClick={onRemove}>
            Confirm
          </Button>
        ) : (
          <Button variant="ghost" onClick={onAskRemove}>
            Remove
          </Button>
        )}
      </div>
    </li>
  );
}

function PeoplePanel({
  people,
  busy,
  onEdit,
  onReset,
  onRun,
}: {
  people: AdminPerson[];
  busy: boolean;
  onEdit: (person: AdminPerson) => void;
  onReset: (person: AdminPerson) => void;
  onRun: (action: () => Promise<ActionResult>, success: string) => Promise<boolean>;
}) {
  const [officeFilter, setOfficeFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const shown = people
    .filter((person) => {
      if (officeFilter === "all") return true;
      if (officeFilter === "none") return !person.office;
      return person.office === officeFilter;
    })
    .filter((person) => (roleFilter === "all" ? true : person.role === roleFilter))
    .slice()
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (sort === "office") return (a.office || "\uffff").localeCompare(b.office || "\uffff") || byName;
      if (sort === "role") {
        const rank = (role: MemberRole | null) => (role === "admin" ? 0 : role === "staff" ? 1 : role === "agent" ? 2 : 3);
        return rank(a.role) - rank(b.role) || byName;
      }
      return byName;
    });

  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Filter by office"
          value={officeFilter}
          onChange={(event) => setOfficeFilter(event.target.value)}
          className="h-10 rounded-sm border border-line bg-surface px-3 text-sm"
        >
          <option value="all">All offices</option>
          {MEMBER_OFFICES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value="none">No office</option>
        </select>
        <select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          className="h-10 rounded-sm border border-line bg-surface px-3 text-sm"
        >
          <option value="all">All roles</option>
          <option value="agent">Agent</option>
          <option value="staff">Staff</option>
          <option value="admin">Administrator</option>
        </select>
        <select
          aria-label="Sort logins"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="h-10 rounded-sm border border-line bg-surface px-3 text-sm"
        >
          <option value="name">Sort by name</option>
          <option value="office">Sort by office</option>
          <option value="role">Sort by role</option>
        </select>
      </div>
      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No logins match that filter.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {shown.map((person) => (
            <li
              key={person.userId}
              className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 transition duration-200 ease-smooth-out hover:border-crimson sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{person.name}</p>
                <p className="truncate text-sm text-muted">{person.email}</p>
                <p className="mt-1 text-sm text-faint">
                  {person.pending
                    ? "Waiting for access"
                    : `${roleLabel(person.role)}${person.office ? ` · ${person.office}` : ""}${person.title ? ` · ${person.title}` : ""}${person.active ? "" : " · Off"}`}
                  {person.hasPassword ? "" : " · No password yet"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {person.pending ? (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void onRun(
                        () =>
                          updateMember({
                            data: {
                              userId: person.userId,
                              role: "agent",
                              active: true,
                              title: person.title,
                              office: person.office,
                            },
                          }),
                        `${person.name} can open Lee Hub.`,
                      )
                    }
                  >
                    Approve
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => onEdit(person)}>
                    Edit
                  </Button>
                )}
                <Button variant="ghost" onClick={() => onReset(person)}>
                  Password
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OfficePanel({
  office,
  busy,
  onRun,
}: {
  office: { name: string; city: string; tagline: string };
  busy: boolean;
  onRun: (action: () => Promise<ActionResult>, success: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(office.name);
  const [city, setCity] = useState(office.city);
  const [tagline, setTagline] = useState(office.tagline);
  return (
    <form
      className="mt-8 flex max-w-lg flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onRun(() => saveOffice({ data: { name, city, tagline } }), "Office updated.");
      }}
    >
      <TextField label="Office name" value={name} onChange={(event) => setName(event.target.value)} />
      <TextField
        label="Market or city"
        value={city}
        onChange={(event) => setCity(event.target.value)}
        placeholder="Riverside"
      />
      <TextArea
        label="Line under the greeting"
        value={tagline}
        onChange={(event) => setTagline(event.target.value)}
      />
      <Button type="submit" disabled={busy}>
        Save office
      </Button>
    </form>
  );
}

function LoginDialog({
  open,
  busy,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (draft: {
    name: string;
    email: string;
    password: string;
    title: string;
    role: MemberRole;
    office: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<MemberRole>("agent");
  const [office, setOffice] = useState("");

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New login"
      description="They sign in with this email and password. It is not emailed."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onCreate({ name, email, password, title, role, office });
        }}
      >
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
        <TextField
          label="Work email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <TextField
          label="Title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Broker, analyst, coordinator"
        />
        <label className="block text-sm font-medium">
          Role
          <select
            value={role}
            onChange={(event) => setRole(asRole(event.target.value))}
            className="mt-2 h-10 w-full rounded-sm border border-line bg-surface px-3 text-base font-normal"
          >
            <option value="agent">Agent</option>
            <option value="staff">Staff</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Office
          <select
            value={office}
            onChange={(event) => setOffice(event.target.value)}
            required
            className="mt-2 h-10 w-full rounded-sm border border-line bg-surface px-3 text-base font-normal"
          >
            <option value="">Choose an office</option>
            {MEMBER_OFFICES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-2">
          <TextField
            label="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
          <Button variant="ghost" className="self-start px-0" onClick={() => setPassword(suggestPassword())}>
            Suggest a password
          </Button>
        </div>
        <Button type="submit" disabled={busy}>
          Create login
        </Button>
      </form>
    </Modal>
  );
}

function PersonDialog({
  person,
  busy,
  onClose,
  onSave,
}: {
  person: AdminPerson | null;
  busy: boolean;
  onClose: () => void;
  onSave: (draft: { userId: string; role: MemberRole; active: boolean; title: string; office: string; email: string }) => Promise<void>;
}) {
  const [email, setEmail] = useState(person?.email ?? "");
  const [title, setTitle] = useState(person?.title ?? "");
  const [role, setRole] = useState<MemberRole>(person?.role ?? "agent");
  const [office, setOffice] = useState(person?.office ?? "");
  const [active, setActive] = useState(person?.active ?? true);

  useEffect(() => {
    if (!person) return;
    setTitle(person.title);
    setEmail(person.email);
    setRole(person.role ?? "agent");
    setOffice(person.office ?? "");
    setActive(person.active);
  }, [person]);

  return (
    <Modal open={Boolean(person)} onOpenChange={(open) => !open && onClose()} title={person?.name ?? "Login"}>
      {person ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSave({ userId: person.userId, role, active, title, office, email });
          }}
        >
          <TextField
            label="Work email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <TextField label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <label className="block text-sm font-medium">
            Role
            <select
              value={role}
              onChange={(event) => setRole(asRole(event.target.value))}
              className="mt-2 h-10 w-full rounded-sm border border-line bg-surface px-3 text-base font-normal"
            >
              <option value="agent">Agent</option>
              <option value="staff">Staff</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Office
            <select
              value={office}
              onChange={(event) => setOffice(event.target.value)}
              required
              className="mt-2 h-10 w-full rounded-sm border border-line bg-surface px-3 text-base font-normal"
            >
              <option value="">Choose an office</option>
              {MEMBER_OFFICES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              className="size-5 accent-crimson"
            />
            Login is active
          </label>
          <Button type="submit" disabled={busy}>
            Save
          </Button>
        </form>
      ) : null}
    </Modal>
  );
}

function ResetDialog({
  person,
  busy,
  onClose,
  onSave,
}: {
  person: AdminPerson | null;
  busy: boolean;
  onClose: () => void;
  onSave: (userId: string, password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  useEffect(() => {
    if (person) setPassword("");
  }, [person]);
  return (
    <Modal
      open={Boolean(person)}
      onOpenChange={(open) => !open && onClose()}
      title="Set password"
      description={person ? `For ${person.email}. Their current sessions will end.` : undefined}
    >
      {person ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSave(person.userId, password);
          }}
        >
          <TextField
            label="New password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
          <Button variant="ghost" className="self-start px-0" onClick={() => setPassword(suggestPassword())}>
            Suggest a password
          </Button>
          <Button type="submit" disabled={busy}>
            Update password
          </Button>
        </form>
      ) : null}
    </Modal>
  );
}

function LinkDialog({
  draft,
  categories,
  busy,
  onClose,
  onChange,
  onSave,
}: {
  draft: LinkDraft | null;
  categories: { id: string; name: string }[];
  busy: boolean;
  onClose: () => void;
  onChange: (draft: LinkDraft) => void;
  onSave: (draft: LinkDraft) => Promise<void>;
}) {
  return (
    <Modal
      open={Boolean(draft)}
      onOpenChange={(open) => !open && onClose()}
      title={draft?.id ? "Edit service" : "Add service"}
      description="A short note on how to sign in. Don't store the password here."
    >
      {draft ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSave(draft);
          }}
        >
          <TextField
            label="Name"
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            required
          />
          <TextField
            label="Web address"
            value={draft.url}
            onChange={(event) => onChange({ ...draft, url: event.target.value })}
            placeholder="https://"
            required
          />
          <label className="block text-sm font-medium">
            Group
            <select
              value={draft.categoryId}
              onChange={(event) => onChange({ ...draft, categoryId: event.target.value })}
              className="mt-2 h-10 w-full rounded-sm border border-line bg-surface px-3 text-base font-normal"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <TextArea
            label="What it's for"
            value={draft.blurb}
            onChange={(event) => onChange({ ...draft, blurb: event.target.value })}
          />
          <TextField
            label="How to sign in"
            value={draft.hint}
            onChange={(event) => onChange({ ...draft, hint: event.target.value })}
            placeholder="Use your Lee email"
          />
          <div>
            <p className="text-sm font-medium">Icon</p>
            <div className="mt-2 grid grid-cols-6 gap-2">
              {ICON_CHOICES.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  aria-label={icon}
                  aria-pressed={draft.icon === icon}
                  onClick={() => onChange({ ...draft, icon })}
                  className={
                    draft.icon === icon
                      ? "grid size-10 place-items-center rounded-sm bg-crimson text-on-crimson transition duration-150 ease-smooth-out"
                      : "grid size-10 place-items-center rounded-sm bg-blush text-deep transition duration-150 ease-smooth-out hover:bg-crimson hover:text-on-crimson"
                  }
                >
                  <ServiceIcon name={icon} className="size-4" />
                </button>
              ))}
            </div>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) => onChange({ ...draft, active: event.target.checked })}
              className="size-5 accent-crimson"
            />
            Visible on the hub
          </label>
          <Button type="submit" disabled={busy || categories.length === 0}>
            Save service
          </Button>
        </form>
      ) : null}
    </Modal>
  );
}
