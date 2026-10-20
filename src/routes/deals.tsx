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
      {() => <HomePage />}
    </DeskFrame>
  );
}
