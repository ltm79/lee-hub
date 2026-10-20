import { createFileRoute } from "@tanstack/react-router";
import { DeskFrame } from "@/components/desk-frame";
import { Directory } from "@/components/directory";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <DeskFrame section="desk">
      {(snap, patchFavorites) => (
        <Directory snap={snap} onPatchFavorites={patchFavorites} />
      )}
    </DeskFrame>
  );
}
