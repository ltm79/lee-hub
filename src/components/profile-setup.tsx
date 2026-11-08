import { useEffect, useState } from "react";
import { loadProfile, saveProfilePhoto } from "@/lib/profile.functions";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "L"
  );
}

function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const size = 320;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that photo."));
        return;
      }
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      ctx.fillStyle = "#f5f5f7";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that photo."));
    };
    image.src = url;
  });
}

export function ProfileSetup({ name, email }: { name: string; email: string }) {
  const [photo, setPhoto] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadProfile()
      .then((result) => {
        if (result.ok) setPhoto(result.photo);
        else setNote(result.error);
        setReady(true);
      })
      .catch(() => {
        setNote("The profile could not be opened.");
        setReady(true);
      });
  }, []);

  async function store(next: string) {
    setBusy(true);
    setNote("");
    const result = await saveProfilePhoto({ data: { photo: next } }).catch(() => ({
      ok: false as const,
      error: "The photo could not be saved.",
    }));
    setBusy(false);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    setPhoto(next);
    setNote(next ? "Headshot saved. It shows on the leaderboard where the name matches." : "Headshot removed.");
  }

  async function onFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setNote("Choose a photo.");
      return;
    }
    try {
      await store(await shrink(file));
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not read that photo.");
    }
  }

  return (
    <div className="max-w-xl">
      <p className="text-sm font-medium text-crimson">Profile</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your headshot</h1>
      <p className="mt-2 text-muted">
        This photo is used on the deal leaderboard. The login name has to match the name on the board. {name} · {email}
      </p>
      <div className="mt-6 flex items-center gap-4">
        {photo ? (
          <img src={photo} alt="" className="size-24 rounded-full object-cover" />
        ) : (
          <span className="grid size-24 place-items-center rounded-full bg-blush text-2xl font-semibold text-deep">{initials(name)}</span>
        )}
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-10 cursor-pointer items-center rounded-[6px] bg-ink px-4 text-sm font-semibold text-white">
            {photo ? "Replace photo" : "Upload photo"}
            <input
              type="file"
              accept="image/*"
              disabled={!ready || busy}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onFile(file);
                event.target.value = "";
              }}
            />
          </label>
          {photo ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void store("")}
              className="h-10 rounded-[6px] border border-line px-4 text-sm font-semibold disabled:opacity-60"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
      {!photo ? <p className="mt-3 text-sm text-muted">No photo yet. The leaderboard shows initials until one is uploaded.</p> : null}
      {note ? <p className="mt-3 text-sm text-deep">{note}</p> : null}
    </div>
  );
}
