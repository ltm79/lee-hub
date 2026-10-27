import { createFileRoute } from "@tanstack/react-router";
import { DeskFrame } from "@/components/desk-frame";
import { LeaderboardTable } from "@/components/leaderboard";

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
  head: () => ({
    meta: [{ title: "Dealius Leaderboard · Lee Hub" }],
  }),
});

function LeaderboardPage() {
  return (
    <DeskFrame section="board">
      {(snap) =>
        snap.member.role === "admin" || snap.member.shareholder ? (
          <LeaderboardTable />
        ) : (
          <p className="text-muted">The Dealius leaderboard is for shareholders.</p>
        )
      }
    </DeskFrame>
  );
}
