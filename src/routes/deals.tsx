import { createFileRoute } from "@tanstack/react-router";
import { DeskFrame } from "@/components/desk-frame";
import { HomePage } from "@/components/desk/home-page";

export const Route = createFileRoute("/deals")({
  component: DealsPage,
  head: () => ({
    meta: [{ title: "Deals · Lee Hub" }],
  }),
});

function DealsPage() {
  return (
    <DeskFrame section="deals">
      {(snap) =>
        snap.member.role === "staff" && !snap.member.deals ? (
          <p className="text-sm text-muted">Deal Desk is not turned on for this login. Ask an administrator.</p>
        ) : (
          <HomePage />
        )
      }
    </DeskFrame>
  );
}
