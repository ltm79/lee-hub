import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { whoAmI, type Member, type Role } from "@/lib/desk/people";

export function useMember(): {
  member: Member | null;
  role: Role | null;
  pending: boolean;
} {
  const { user, isPending } = useCurrentUserState();
  const [member, setMember] = useState<Member | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      setMember(null);
      setPending(false);
      return;
    }
    let stop = false;
    setPending(true);
    void whoAmI()
      .then((me) => {
        if (!stop) setMember(me);
      })
      .catch(() => {
        if (!stop) setMember(null);
      })
      .finally(() => {
        if (!stop) setPending(false);
      });
    return () => {
      stop = true;
    };
  }, [isPending, user?.id]);

  return { member, role: member?.role ?? null, pending: isPending || pending };
}
