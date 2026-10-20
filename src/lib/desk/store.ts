import { create } from "zustand";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  deleteDeskFile,
  deleteDeskPacket,
  fetchDeskFile,
  listDesk,
  saveDeskEmail,
  saveDeskFile,
  saveDeskPacket,
} from "@/lib/desk/account";
import { deletePacketBlobs, getBlob, putBlob } from "@/lib/desk/blobs";
import type { Answers, Attachment, Kind, Packet } from "@/lib/desk/types";

type DeskState = {
  packets: Packet[];
  defaultEmail: string;
  createPacket: (kind: Kind, answers?: Answers, ownerId?: string) => string;
  updateAnswer: (id: string, key: string, value: string) => void;
  addFiles: (id: string, files: Attachment[]) => void;
  removeFile: (id: string, fileId: string) => void;
  setStatus: (id: string, status: Packet["status"]) => void;
  saveNow: (id: string) => Promise<void>;
  setDefaultEmail: (email: string) => void;
  removePacket: (id: string) => void;
  saveError: string;
};

const SAMPLE: Answers = {
  sample: "1",
  transaction: "lease",
  address: "1400 E Walnut Ave",
  city: "Commerce, CA 90040",
  propertyType: "industrial",
  sf: "42,500",
  lessor: "Walnut Industrial Holdings LLC",
  lessorDba: "Walnut Industrial",
  lessorContact: "Elena Cho",
  lessee: "Pacific Cold Storage Inc.",
  lesseeContact: "Marcus Hale",
  represented: "both",
  leaseFrom: "11/01/2026",
  leaseThrough: "10/31/2031",
  leaseTerm: "11/01/2026 – 10/31/2031",
  executionDate: "10/06/2026",
  askingRate: "1.35",
  askingType: "NNN",
  leaseRate: "1.28",
  leaseType: "NNN",
  effectiveRate: "1.22",
  termMos: "60",
  ti: "15.00 PSF",
  freeRent: "2 months",
  nnn: "NNN, estimated $0.28 PSF",
  esc1Period: "Year 1",
  esc1Psf: "1.28",
  esc1Type: "NNN",
  esc2Period: "Years 2-5",
  esc2Psf: "3% annual",
  esc2Type: "NNN",
  row1From: "1",
  row1To: "60",
  row1Rent: "54400",
  row1Months: "60",
  row1Pct: "6",
  fundsType: "wire",
  fundsFrom: "Pacific Cold Storage Inc.",
  amountReceived: "195,840.00",
  gross: "195,840.00",
  split1Agent: "A. Reyes",
  split1Entity: "Lee & Associates",
  split1Pct: "60",
  split2Agent: "J. Patel",
  split2Entity: "Lee & Associates",
  split2Pct: "40",
  list1Name: "A. Reyes",
  list1Firm: "Lee & Associates",
  proc1Name: "J. Patel",
  proc1Firm: "Lee & Associates",
  checkLease1: "1",
  checkLease2: "1",
  checkLease5: "1",
  billName: "Accounts Payable",
  billCompany: "Pacific Cold Storage Inc.",
  billCity: "Commerce, CA 90040",
  invoice: "no",
  agentSign: "A. Reyes",
};

function remember(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not save to your account.";
  useDesk.setState({ saveError: message });
}

function saved() {
  if (useDesk.getState().saveError) useDesk.setState({ saveError: "" });
}

const packetTimers = new Map<string, ReturnType<typeof setTimeout>>();

function queuePacket(id: string) {
  const existing = packetTimers.get(id);
  if (existing) clearTimeout(existing);
  packetTimers.set(
    id,
    setTimeout(() => {
      packetTimers.delete(id);
      const packet = useDesk.getState().packets.find((item) => item.id === id);
      if (!packet) return;
      void saveDeskPacket({ data: packet }).then(saved).catch(remember);
    }, 400),
  );
}

let emailTimer: ReturnType<typeof setTimeout> | undefined;

function queueEmail(email: string) {
  if (emailTimer) clearTimeout(emailTimer);
  emailTimer = setTimeout(() => {
    void saveDeskEmail({ data: email }).then(saved).catch(remember);
  }, 400);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(blob);
  });
}

async function uploadFile(packetId: string, file: Attachment) {
  const blob = await getBlob(file.id);
  if (!blob) return;
  await saveDeskFile({
    data: {
      packetId,
      id: file.id,
      name: file.name,
      mime: file.type,
      slot: file.slot,
      contentBase64: await blobToBase64(blob),
    },
  });
}

export const useDesk = create<DeskState>()((set, get) => ({
  packets: [],
  defaultEmail: "",
  saveError: "",
  createPacket: (kind, answers = {}, ownerId) => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const packet: Packet = {
      id,
      kind,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      answers,
      files: [],
      ownerId,
    };
    set((state) => ({ packets: [packet, ...state.packets] }));
    void saveDeskPacket({ data: packet }).then(saved).catch(remember);
    return id;
  },
  updateAnswer: (id, key, value) => {
    set((state) => ({
      packets: state.packets.map((packet) => {
        if (packet.id !== id) return packet;
        const answers = { ...packet.answers };
        if (value) answers[key] = value;
        else delete answers[key];
        return { ...packet, answers, updatedAt: Date.now() };
      }),
    }));
    if (key === "address") {
      const pending = packetTimers.get(id);
      if (pending) {
        clearTimeout(pending);
        packetTimers.delete(id);
      }
      const packet = get().packets.find((item) => item.id === id);
      if (packet) void saveDeskPacket({ data: packet }).then(saved).catch(remember);
      return;
    }
    queuePacket(id);
  },
  addFiles: (id, incoming) => {
    if (incoming.length === 0) return;
    set((state) => ({
      packets: state.packets.map((packet) =>
        packet.id === id
          ? { ...packet, files: [...(packet.files ?? []), ...incoming], updatedAt: Date.now() }
          : packet,
      ),
    }));
    const packet = get().packets.find((item) => item.id === id);
    void (async () => {
      if (packet) await saveDeskPacket({ data: packet });
      for (const file of incoming) await uploadFile(id, file);
      saved();
    })().catch(remember);
  },
  removeFile: (id, fileId) => {
    set((state) => ({
      packets: state.packets.map((packet) =>
        packet.id === id
          ? {
              ...packet,
              files: (packet.files ?? []).filter((file) => file.id !== fileId),
              updatedAt: Date.now(),
            }
          : packet,
      ),
    }));
    const packet = get().packets.find((item) => item.id === id);
    void (async () => {
      if (packet) await saveDeskPacket({ data: packet });
      await deleteDeskFile({ data: fileId });
      saved();
    })().catch(remember);
  },
  setStatus: (id, status) => {
    set((state) => ({
      packets: state.packets.map((packet) =>
        packet.id === id
          ? {
              ...packet,
              status,
              updatedAt: Date.now(),
              submittedAt: status === "submitted" ? Date.now() : packet.submittedAt,
            }
          : packet,
      ),
    }));
    const packet = get().packets.find((item) => item.id === id);
    if (packet) void saveDeskPacket({ data: packet }).then(saved).catch(remember);
  },
  saveNow: async (id) => {
    const pending = packetTimers.get(id);
    if (pending) {
      clearTimeout(pending);
      packetTimers.delete(id);
    }
    const packet = get().packets.find((item) => item.id === id);
    if (!packet) return;
    await saveDeskPacket({ data: packet });
    saved();
  },
  setDefaultEmail: (email) => {
    set({ defaultEmail: email });
    queueEmail(email);
  },
  removePacket: (id) => {
    set((state) => ({ packets: state.packets.filter((packet) => packet.id !== id) }));
    void deletePacketBlobs(id);
    void deleteDeskPacket({ data: id }).then(saved).catch(remember);
  },
}));

export function sampleAnswers(): Answers {
  return { ...SAMPLE };
}

let loadedFor = "";
let loadPromise: Promise<void> | null = null;

function readBrowserDrafts(): { packets: Packet[]; defaultEmail: string } | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem("lee-deal-desk");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { packets?: Packet[]; defaultEmail?: string } };
    const packets = Array.isArray(parsed.state?.packets) ? parsed.state.packets : [];
    return { packets, defaultEmail: parsed.state?.defaultEmail ?? "" };
  } catch {
    return null;
  }
}

async function pullDesk() {
  const remote = await listDesk();
  const local = readBrowserDrafts();
  const seen = new Set(remote.packets.map((packet) => packet.id));
  const extras = (local?.packets ?? []).filter((packet) => packet?.id && !seen.has(packet.id));
  useDesk.setState({
    packets: [...extras, ...remote.packets],
    defaultEmail: remote.defaultEmail || local?.defaultEmail || "",
    saveError: "",
  });
  if (local && typeof localStorage !== "undefined") localStorage.removeItem("lee-deal-desk");
  for (const packet of extras) {
    await saveDeskPacket({ data: packet });
    for (const file of packet.files ?? []) await uploadFile(packet.id, file);
  }
  if (local?.defaultEmail && !remote.defaultEmail) await saveDeskEmail({ data: local.defaultEmail });
  for (const packet of useDesk.getState().packets) {
    for (const file of packet.files ?? []) {
      if (await getBlob(file.id)) continue;
      const downloaded = await fetchDeskFile({ data: file.id });
      if (!downloaded?.contentBase64) continue;
      const bytes = Uint8Array.from(atob(downloaded.contentBase64), (char) => char.charCodeAt(0));
      await putBlob(packet.id, file.id, new Blob([bytes], { type: downloaded.mime || file.type }));
    }
  }
}

function ensureDesk(userId: string): Promise<void> {
  if (loadedFor === userId && loadPromise) return loadPromise;
  loadedFor = userId;
  loadPromise = pullDesk().catch((error) => {
    loadedFor = "";
    loadPromise = null;
    remember(error);
  });
  return loadPromise;
}

export function useDeskHydrated(): boolean {
  const { user, isPending } = useCurrentUserState();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (isPending) {
      setReady(false);
      return;
    }
    if (!user) {
      loadedFor = "";
      loadPromise = null;
      useDesk.setState({ packets: [], defaultEmail: "", saveError: "" });
      setReady(true);
      return;
    }
    let stop = false;
    setReady(false);
    void ensureDesk(user.id).then(() => {
      if (!stop) setReady(true);
    });
    return () => {
      stop = true;
    };
  }, [isPending, user?.id]);
  return ready && !isPending;
}
