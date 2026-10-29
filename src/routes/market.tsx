import { createFileRoute } from "@tanstack/react-router";
import { DeskFrame } from "@/components/desk-frame";
import { MarketInsight } from "@/components/market-dashboard";

export const Route = createFileRoute("/market")({
  component: MarketPage,
  head: () => ({
    meta: [{ title: "Market Insight · Lee Hub" }],
  }),
});

function MarketPage() {
  return (
    <DeskFrame section="market">
      {(snap) => <MarketInsight isAdmin={snap.member.role === "admin"} />}
    </DeskFrame>
  );
}
