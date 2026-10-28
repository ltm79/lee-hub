import { createFileRoute } from "@tanstack/react-router";
import { ClosedDeals } from "@/components/closed-deals";
import { DeskFrame } from "@/components/desk-frame";

export const Route = createFileRoute("/closed")({
  component: ClosedPage,
  head: () => ({
    meta: [{ title: "Closed deals · Lee Hub" }],
  }),
});

function ClosedPage() {
  return (
    <DeskFrame section="closed">
      {() => <ClosedDeals />}
    </DeskFrame>
  );
}
