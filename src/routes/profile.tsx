import { createFileRoute } from "@tanstack/react-router";
import { DeskFrame } from "@/components/desk-frame";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  head: () => ({
    meta: [{ title: "Profile · Lee Hub" }],
  }),
});

function ProfilePage() {
  return (
    <DeskFrame section="desk">
      {() => (
        <p className="max-w-xl text-muted">
          Headshots are set by an administrator in Admin, under Logins. A login cannot change its own photo.
        </p>
      )}
    </DeskFrame>
  );
}
