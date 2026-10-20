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
      {() => <EditorPage id={id} />}
    </DeskFrame>
  );
}
