import { createFileRoute } from "@tanstack/react-router";
import { DeskFrame } from "@/components/desk-frame";
import { PeopleBoard } from "@/components/people-board";

export const Route = createFileRoute("/people")({
  component: PeoplePage,
});

function PeoplePage() {
  return <DeskFrame section="people">{(snap) => <PeopleBoard snap={snap} />}</DeskFrame>;
}
