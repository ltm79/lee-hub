import type { ReactNode } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { DeskLoading, GateState } from "@/components/desk-states";
import { Shell, hubGroups, type DeskSection } from "@/components/shell";
import { usePortal } from "@/components/use-portal";
import type { PortalReady } from "@/lib/portal.types";

export function DeskFrame({
  section,
  children,
}: {
  section: DeskSection;
  children: (
    snap: PortalReady,
    patchFavorites: (favoriteIds: string[]) => void,
  ) => ReactNode;
}) {
  const portal = usePortal();
  if (portal.isPending || (portal.user && !portal.snap && !portal.error)) return <DeskLoading />;
  if (!portal.user || portal.error?.includes("Unauthorized")) return <RedirectToSignIn />;
  if (portal.error) return <GateState title="Lee Hub didn't open" body={portal.error} />;
  if (!portal.snap) return <DeskLoading />;
  if (portal.snap.status === "pending") {
    return (
      <GateState
        title="Access hasn't been opened"
        body={`${portal.snap.name} is signed in as ${portal.snap.email}, but this office hasn't added that login yet. Ask an administrator to approve it.`}
      />
    );
  }
  if (portal.snap.status === "disabled") {
    return (
      <GateState
        title="This login is turned off"
        body="Ask an administrator if you still need Lee Hub."
      />
    );
  }
  const snap = portal.snap;
  const canDeals = snap.member.role !== "staff" || snap.member.deals;
  const links = canDeals
    ? snap.links
    : snap.links.filter((link) => !/\/(deals|vouchers)(?:\/|$|\?)/.test(link.url));
  return (
    <Shell section={section} city={snap.office.city} isAdmin={snap.member.role === "admin"} canDeals={canDeals} groups={hubGroups({ ...snap, links })}>
      {children(snap, (favoriteIds) => {
        portal.patch((current) =>
          current.status === "ready" ? { ...current, favoriteIds } : current,
        );
      })}
    </Shell>
  );
}
