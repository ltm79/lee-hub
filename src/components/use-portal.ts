import { useCallback, useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { loadPortal } from "@/lib/portal.functions";
import type { PortalSnapshot } from "@/lib/portal.types";

let cache: PortalSnapshot | null = null;

export function clearPortalCache() {
  cache = null;
}

export function usePortal() {
  const { user, isPending } = useCurrentUserState();
  const [snap, setSnap] = useState<PortalSnapshot | null>(cache);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const next = await loadPortal();
    cache = next;
    setSnap(next);
    setError(null);
    return next;
  }, []);

  useEffect(() => {
    if (isPending || !user) return;
    let cancel = false;
    loadPortal()
      .then((next) => {
        if (cancel) return;
        cache = next;
        setSnap(next);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (cancel) return;
        setError(reason instanceof Error ? reason.message : "Could not open Lee Hub");
      });
    return () => {
      cancel = true;
    };
  }, [isPending, user?.id]);

  const patch = useCallback((fn: (current: PortalSnapshot) => PortalSnapshot) => {
    setSnap((current) => {
      if (!current) return current;
      const next = fn(current);
      cache = next;
      return next;
    });
  }, []);

  return { user, isPending, snap, error, reload, patch };
}
