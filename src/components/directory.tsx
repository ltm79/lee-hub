import { Star } from "lucide-react";
import { ServiceIcon } from "@/components/icons";
import { hubGroups, toneFor } from "@/components/shell";
import { LocalConditions } from "@/components/local-conditions";
import { MarketLibrary } from "@/components/market-library";
import { toggleFavorite } from "@/lib/portal.functions";
import type { DeskLink, PortalReady } from "@/lib/portal.types";

function greet(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function isMarket(category: { id: string; name: string }) {
  return category.id === "research" || category.name.trim().toLowerCase() === "market research";
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function Tile({
  link,
  pinned,
  tone,
  onToggle,
}: {
  link: DeskLink;
  pinned: boolean;
  tone: number;
  onToggle: (id: string) => void;
}) {
  const color = toneFor(tone);
  return (
    <article className="group relative overflow-hidden rounded-[6px] border border-line bg-surface transition duration-200 ease-smooth-out hover:border-teal">
      <span className={`absolute inset-y-0 left-0 w-1 ${color.bar}`} aria-hidden="true" />
      <a
        href={link.url}
        {...(link.url.startsWith("/") ? {} : { target: "_blank", rel: "noreferrer noopener" })}
        className="flex items-center gap-3 rounded-[6px] py-2.5 pr-11 pl-4"
      >
        <span className={`grid size-8 shrink-0 place-items-center rounded-[6px] ${color.wash} ${color.ink}`}>
          <ServiceIcon name={link.icon} className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <h3 className="truncate font-semibold leading-tight text-ink">{link.name}</h3>
          {link.blurb ? <p className="mt-0.5 truncate text-sm text-muted">{link.blurb}</p> : null}
        </span>
      </a>
      <button
        type="button"
        aria-pressed={pinned}
        aria-label={pinned ? `Unpin ${link.name}` : `Pin ${link.name}`}
        onClick={() => onToggle(link.id)}
        className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-sm text-faint transition duration-150 ease-smooth-out hover:bg-blush hover:text-crimson"
      >
        <Star
          className={pinned ? "size-4 fill-crimson text-crimson transition duration-200 ease-smooth-out" : "size-4 transition duration-200 ease-smooth-out"}
          strokeWidth={1.75}
        />
      </button>
    </article>
  );
}

export function Directory({
  snap,
  onPatchFavorites,
}: {
  snap: PortalReady;
  onPatchFavorites: (favoriteIds: string[]) => void;
}) {
  const canDeals = snap.member.role !== "staff" || snap.member.deals;
  const links = canDeals
    ? snap.links
    : snap.links.filter((link) => !/\/(deals|vouchers)(?:\/|$|\?)/.test(link.url));
  const pinned = links.filter((link) => snap.favoriteIds.includes(link.id));
  const market = snap.categories.some(isMarket);
  const canEdit = snap.member.role === "admin";
  const tones = new Map(hubGroups({ ...snap, links }).map((group) => [group.id, group.tone]));

  async function onToggle(id: string) {
    const has = snap.favoriteIds.includes(id);
    const next = has ? snap.favoriteIds.filter((item) => item !== id) : [...snap.favoriteIds, id];
    onPatchFavorites(next);
    const result = await toggleFavorite({ data: { linkId: id } });
    if (!result.ok) onPatchFavorites(snap.favoriteIds);
  }

  return (
    <div data-desk="ready">
      <p className="text-sm font-medium text-crimson" suppressHydrationWarning>
        {snap.office.name}
        {snap.office.city ? ` · ${snap.office.city}` : ""}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight" suppressHydrationWarning>
        {greet(new Date())}, {firstName(snap.member.name)}
      </h1>
      {snap.office.tagline ? (
        <p className="mt-2 max-w-xl text-muted">{snap.office.tagline}</p>
      ) : null}
      <LocalConditions city={snap.office.city} />

      {links.length === 0 ? (
        <p className="mt-10 text-muted">
          No services have been published yet.
        </p>
      ) : null}

      {pinned.length > 0 ? (
        <section id="group-pinned" className="mt-10 scroll-mt-8">
          <h2 className="flex items-center gap-3 text-lg font-semibold">
            <span className="h-px w-6 bg-crimson" />
            Pinned
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {pinned.map((link) => (
              <Tile key={link.id} link={link} pinned tone={tones.get("pinned") ?? 0} onToggle={onToggle} />
            ))}
          </div>
        </section>
      ) : null}

      {snap.categories.map((category) => {
        const items = links.filter((link) => link.categoryId === category.id);
        const showFiles = isMarket(category);
        if (items.length === 0 && !showFiles) return null;
        const tone = tones.get(category.id) ?? 0;
        const color = toneFor(tone);
        return (
          <section key={category.id} id={`group-${category.id}`} className="mt-10 scroll-mt-8">
            <h2 className="flex items-center gap-3 text-lg font-semibold">
              <span className={`h-px w-6 ${color.bar}`} />
              {category.name}
            </h2>
            {items.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((link) => (
                  <Tile
                    key={link.id}
                    link={link}
                    tone={tone}
                    pinned={snap.favoriteIds.includes(link.id)}
                    onToggle={onToggle}
                  />
                ))}
              </div>
            ) : null}
            {showFiles ? <MarketLibrary canEdit={canEdit} /> : null}
          </section>
        );
      })}

      {!market ? (
        <section id="group-market" className="mt-10 scroll-mt-8">
          <h2 className="flex items-center gap-3 text-lg font-semibold">
            <span className="h-px w-6 bg-teal" />
            Market research
          </h2>
          <MarketLibrary canEdit={canEdit} />
        </section>
      ) : null}

      <p className="mt-12 text-sm text-faint">Lee & Associates · Internal use</p>
    </div>
  );
}
