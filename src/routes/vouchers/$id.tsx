import { createFileRoute } from "@tanstack/react-router";
import { DeskFrame } from "@/components/desk-frame";
import { EditorPage } from "@/components/desk/editor-page";

export const Route = createFileRoute("/vouchers/$id")({
  component: VoucherRoute,
  head: () => ({
    meta: [{ title: "Voucher · Lee Hub" }],
  }),
});

function VoucherRoute() {
  const { id } = Route.useParams();
  return (
    <DeskFrame section="deals">
      {(snap) =>
        snap.member.role === "staff" && !snap.member.deals ? (
          <p className="text-sm text-muted">Deal Desk is not turned on for this login. Ask an administrator.</p>
        ) : (
          <EditorPage id={id} />
        )
      }
    </DeskFrame>
  );
}
