import { ArrowUpRight, Star } from "lucide-react";
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
    <article className="group relative overflow-hidden rounded-lg border border-line bg-surface shadow-card transition duration-200 ease-smooth-out motion-safe:hover:-translate-y-0.5 hover:border-teal hover:shadow-lift">
      <span className={`absolute inset-y-0 left-0 w-1 ${color.bar}`} aria-hidden="true" />
      <a
        href={link.url}
        {...(link.url.startsWith("/") ? {} : { target: "_blank", rel: "noreferrer noopener" })}
        className="block rounded-lg p-4 pr-14 pl-5"
      >
        <span className={`grid size-10 place-items-center rounded-sm ${color.wash} ${color.ink} transition duration-200 ease-smooth-out motion-safe:group-hover:scale-105`}>
          <ServiceIcon name={link.icon} className="size-5" />
        </span>
        <h3 className="mt-4 font-semibold text-ink">{link.name}</h3>
        {link.blurb ? <p className="mt-1 text-sm text-muted">{link.blurb}</p> : null}
        <p className="mt-4 flex items-center justify-between gap-3 text-sm text-faint">
          <span className="min-w-0 truncate">{link.hint || (link.url.startsWith("/") ? "Opens in Lee Hub" : "Opens in a new tab")}</span>
          <ArrowUpRight className="size-4 shrink-0 text-teal transition duration-200 ease-smooth-out motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" aria-hidden="true" />
        </p>
      </a>
      <button
        type="button"
        aria-pressed={pinned}
        aria-label={pinned ? `Unpin ${link.name}` : `Pin ${link.name}`}
        onClick={() => onToggle(link.id)}
        className="absolute top-3 right-3 grid size-11 place-items-center rounded-sm text-faint transition duration-150 ease-smooth-out hover:bg-blush hover:text-crimson motion-safe:active:scale-[0.96]"
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
  const links = snap.links;
  const pinned = links.filter((link) => snap.favoriteIds.includes(link.id));
  const market = snap.categories.some(isMarket);
  const canEdit = snap.member.role === "admin";
  const tones = new Map(hubGroups(snap).map((group) => [group.id, group.tone]));

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
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
