import { createFileRoute } from "@tanstack/react-router";
import { DeskFrame } from "@/components/desk-frame";
import { ProfileSetup } from "@/components/profile-setup";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  head: () => ({
    meta: [{ title: "Profile · Lee Hub" }],
  }),
});

function ProfilePage() {
  return (
    <DeskFrame section="profile">
      {(snap) => <ProfileSetup name={snap.member.name} email={snap.member.email} />}
    </DeskFrame>
  );
}
