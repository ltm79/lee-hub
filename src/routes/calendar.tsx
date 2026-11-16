import { createFileRoute } from "@tanstack/react-router";
import { DeskFrame } from "@/components/desk-frame";
import { StaffCalendar } from "@/components/staff-calendar";

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
  head: () => ({ meta: [{ title: "Staff Calendar · Lee Hub" }] }),
});

function CalendarPage() {
  return <DeskFrame section="calendar">{() => <StaffCalendar />}</DeskFrame>;
}
