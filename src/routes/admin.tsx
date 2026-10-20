import { createFileRoute } from "@tanstack/react-router";
import { AdminConsole } from "@/components/admin-console";
import { DeskFrame } from "@/components/desk-frame";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

function AdminPage() {
  return (
    <DeskFrame section="admin">
      {(snap) => (
        <AdminConsole isAdmin={snap.member.role === "admin"} office={snap.office} />
      )}
    </DeskFrame>
  );
}
