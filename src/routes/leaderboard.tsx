import { createFileRoute } from "@tanstack/react-router";
import { DeskFrame } from "@/components/desk-frame";
import { LeaderboardTable } from "@/components/leaderboard";

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
  head: () => ({
    meta: [{ title: "Leaderboard · Lee Hub" }],
  }),
});

function LeaderboardPage() {
  return <DeskFrame section="board">{() => <LeaderboardTable />}</DeskFrame>;
}
