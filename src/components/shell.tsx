import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Briefcase, LayoutGrid, Menu, Settings, Trophy, Users, X } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { LeeLogo } from "@/components/mark";

export type DeskSection = "desk" | "deals" | "people" | "admin" | "board";

export type HubGroup = { id: string; name: string; tone: number };

export function hubGroups(snap: {
  favoriteIds: string[];
  categories: { id: string; name: string }[];
  links: { categoryId: string }[];
}): HubGroup[] {
  const groups: HubGroup[] = [];
  let tone = 0;
  if (snap.favoriteIds.length > 0) {
    groups.push({ id: "pinned", name: "Pinned", tone });
    tone += 1;
  }
  for (const category of snap.categories) {
    const hasLinks = snap.links.some((link) => link.categoryId === category.id);
    const market = category.id === "research" || category.name.trim().toLowerCase() === "market research";
    if (hasLinks || market) {
      groups.push({ id: category.id, name: category.name, tone });
      tone += 1;
    }
  }
  const hasMarket = snap.categories.some(
    (category) => category.id === "research" || category.name.trim().toLowerCase() === "market research",
  );
  if (!hasMarket) groups.push({ id: "market", name: "Market research", tone });
  return groups;
}

const NAV: { id: DeskSection; label: string; to: "/" | "/deals" | "/leaderboard" | "/people" | "/admin"; icon: typeof LayoutGrid }[] = [
  { id: "desk", label: "Hub", to: "/", icon: LayoutGrid },
  { id: "deals", label: "Deals", to: "/deals", icon: Briefcase },
  { id: "board", label: "Leaderboard", to: "/leaderboard", icon: Trophy },
  { id: "people", label: "People", to: "/people", icon: Users },
  { id: "admin", label: "Admin", to: "/admin", icon: Settings },
];

const TONES = [
  { bar: "bg-crimson", wash: "bg-blush", ink: "text-crimson", dot: "bg-crimson" },
  { bar: "bg-teal", wash: "bg-mist", ink: "text-teal", dot: "bg-teal" },
  { bar: "bg-deep", wash: "bg-blush", ink: "text-deep", dot: "bg-deep" },
  { bar: "bg-sand", wash: "bg-cream", ink: "text-sand", dot: "bg-sand" },
] as const;

export function toneFor(index: number) {
  return TONES[index % TONES.length];
}

function NavList({
  section,
  isAdmin,
  canDeals,
  groups,
  activeGroup,
  onNavigate,
}: {
  section: DeskSection;
  isAdmin: boolean;
  canDeals: boolean;
  groups: HubGroup[];
  activeGroup: string;
  onNavigate?: () => void;
}) {
  function jump(event: MouseEvent<HTMLAnchorElement>, id: string) {
    const node = document.getElementById(id);
    if (!node) return;
    event.preventDefault();
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    onNavigate?.();
  }

  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((item) => (item.id !== "admin" || isAdmin) && (item.id !== "deals" || canDeals)).map((item) => {
        const Icon = item.icon;
        const active = item.id === section;
        return (
          <Link
            key={item.id}
            to={item.to}
            onClick={onNavigate}
            className={
              active
                ? "flex h-10 items-center gap-3 rounded-md bg-blush px-3 text-sm font-medium text-deep transition duration-150 ease-smooth-out"
                : "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted transition duration-150 ease-smooth-out hover:bg-paper hover:text-ink"
            }
          >
            <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
      {groups.length > 0 ? (
        <div className="mt-5">
          <p className="px-3 text-[11px] font-medium tracking-wide text-faint">Sections</p>
          <div className="mt-1 flex flex-col">
            {groups.map((group) => {
              const id = `group-${group.id}`;
              const current = section === "desk" && activeGroup === group.id;
              return (
                <a
                  key={group.id}
                  href={`/#${id}`}
                  onClick={(event) => jump(event, id)}
                  className={
                    current
                      ? "flex h-9 items-center gap-2.5 rounded-md bg-paper px-3 text-sm font-medium text-ink"
                      : "flex h-9 items-center gap-2.5 rounded-md px-3 text-sm text-muted transition duration-150 ease-smooth-out hover:bg-paper hover:text-ink"
                  }
                >
                  <span className={`size-1.5 shrink-0 rounded-full ${toneFor(group.tone).dot}`} aria-hidden="true" />
                  <span className="truncate">{group.name}</span>
                </a>
              );
            })}
          </div>
        </div>
      ) : null}
    </nav>
  );
}

function BrandLockup({ city, variant }: { city: string; variant: "rail" | "bar" }) {
  if (variant === "bar") {
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <LeeLogo variant="mark" className="h-9 w-auto shrink-0 rounded-sm" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold tracking-tight text-ink">Lee Hub</p>
          <p className="truncate text-xs text-muted">{city || "Lee & Associates"}</p>
        </div>
      </div>
    );
  }
  return (
    <div>
      <LeeLogo className="w-full" />
      <p className="mt-5 text-2xl font-semibold tracking-tight text-ink">Lee Hub</p>
      <p className="mt-1 truncate text-sm text-muted">{city || "Lee & Associates"}</p>
    </div>
  );
}

export function Shell({
  section,
  city,
  isAdmin,
  canDeals,
  groups = [],
  children,
}: {
  section: DeskSection;
  city: string;
  isAdmin: boolean;
  canDeals: boolean;
  groups?: HubGroup[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState("");

  const groupKey = groups.map((group) => group.id).join("|");

  useEffect(() => {
    if (section !== "desk" || !groupKey) return;
    const nodes = groupKey
      .split("|")
      .map((id) => document.getElementById(`group-${id}`))
      .filter((node): node is HTMLElement => node !== null);
    if (nodes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveGroup(visible.target.id.replace(/^group-/, ""));
      },
      { rootMargin: "-15% 0px -65% 0px", threshold: [0.15, 0.4] },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [section, groupKey]);

  return (
    <div className="min-h-screen bg-paper text-ink md:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 text-ink md:flex">
        <BrandLockup city={city} variant="rail" />
        <div className="mt-8 min-h-0 flex-1 overflow-y-auto">
          <NavList section={section} isAdmin={isAdmin} canDeals={canDeals} groups={groups} activeGroup={activeGroup} />
        </div>
        <div className="mt-4 border-t border-line pt-4 [&_span]:max-w-36 [&_span]:truncate">
          <UserButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-line bg-surface px-4 text-ink md:hidden">
          <BrandLockup city={city} variant="bar" />
          <button
            type="button"
            className="grid size-11 place-items-center rounded-md text-ink hover:bg-paper"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </header>
        {open ? (
          <div className="border-b border-line bg-surface px-4 py-4 text-ink md:hidden">
            <NavList section={section} isAdmin={isAdmin} canDeals={canDeals} groups={groups} activeGroup={activeGroup} onNavigate={() => setOpen(false)} />
            <div className="mt-4 border-t border-line pt-4 [&_span]:truncate">
              <UserButton />
            </div>
          </div>
        ) : null}
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:px-8 md:py-10">
          {children}
        </div>
      </div>
    </div>
  );
}
