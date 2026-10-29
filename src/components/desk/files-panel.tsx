import { useEffect, useState } from "react";
import { Download, FileText, Paperclip, X } from "lucide-react";
import { deleteBlob, getBlob } from "@/lib/desk/blobs";
import { docGroups, docSlots, packetFiles } from "@/lib/desk/docs";
import { ACCEPT, formatBytes, storeIncoming } from "@/lib/desk/intake";
import { useDesk } from "@/lib/desk/store";
import type { Answers, Attachment, Kind } from "@/lib/desk/types";
import { saveBlob } from "@/lib/desk/zip";
import { Card } from "@/components/desk/ui";

type SetAnswer = (key: string, value: string) => void;

function previewKind(file: Attachment): "image" | "pdf" | null {
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name)) return "image";
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  return null;
}

export function FilesPanel({
  packetId,
  kind,
  answers,
  set,
}: {
  packetId: string;
  kind: Kind;
  answers: Answers;
  set: SetAnswer;
}) {
  const packet = useDesk((state) => state.packets.find((item) => item.id === packetId));
  const addFiles = useDesk((state) => state.addFiles);
  const updateAnswer = useDesk((state) => state.updateAnswer);
  const removeFile = useDesk((state) => state.removeFile);
  const files = packet ? packetFiles(packet) : [];
  const groups = docGroups(kind, answers);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ url: string; file: Attachment; kind: "image" | "pdf" } | null>(null);

  useEffect(() => {
    if (!preview) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closePreview();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  function closePreview() {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  async function attach(slot: string, list: FileList | File[]) {
    setError("");
    const { added, errors } = await storeIncoming(packetId, slot, list, files);
    if (added.length) {
      addFiles(packetId, added);
      if (slot !== "other") updateAnswer(packetId, slot, "1");
    }
    setError(errors[0] ?? "");
  }

  async function openFile(file: Attachment) {
    const blob = await getBlob(file.id);
    if (!blob) {
      setError(`${file.name} is no longer stored in this browser.`);
      return;
    }
    const mode = previewKind(file);
    if (!mode) {
      saveBlob(blob, file.name);
      return;
    }
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return { url: URL.createObjectURL(blob), file, kind: mode };
    });
  }

  async function saveFile(file: Attachment) {
    const blob = await getBlob(file.id);
    if (!blob) {
      setError(`${file.name} is no longer stored in this browser.`);
      return;
    }
    saveBlob(blob, file.name);
  }

  function dropFile(file: Attachment) {
    removeFile(packetId, file.id);
    void deleteBlob(file.id);
  }

  const known = new Set(docSlots(kind));
  const other = files.filter((file) => file.slot === "other" || !known.has(file.slot));
  const intro =
    groups.length > 0
      ? "This is the voucher document checklist. Check a line when that item is included, and attach the file."
      : "This voucher has no document checklist. Attach the check copy, wire advice, or the earlier voucher this payment follows.";

  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink-soft">{intro}</p>
      {error ? (
        <p className="text-sm text-red-deep" role="alert">
          {error}
        </p>
      ) : null}
      {groups.map((group, index) => (
        <Card key={group.title} title={group.title} eyebrow={index === 0 ? "Voucher Document Checklist" : undefined}>
          <ul className="grid gap-2">
            {group.items.map((item) => (
              <DocRow
                key={item.key}
                label={item.label}
                checked={answers[item.key] === "1"}
                files={files.filter((file) => file.slot === item.key)}
                onToggle={(on) => set(item.key, on ? "1" : "")}
                onAttach={(list) => void attach(item.key, list)}
                onOpen={(file) => void openFile(file)}
                onSave={(file) => void saveFile(file)}
                onRemove={dropFile}
              />
            ))}
          </ul>
        </Card>
      ))}
      <Card title="Supporting Documents" eyebrow={groups.length ? undefined : "Kept with this voucher"}>
        <OtherDrop
          files={other}
          onAttach={(list) => void attach("other", list)}
          onOpen={(file) => void openFile(file)}
          onSave={(file) => void saveFile(file)}
          onRemove={dropFile}
        />
      </Card>
      {preview ? (
        <div className="fixed inset-0 z-40 flex flex-col bg-ink/50 p-3 sm:p-6" onClick={closePreview}>
          <div
            className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden rounded-lg border border-line bg-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{preview.file.name}</p>
              <button
                type="button"
                className="inline-flex h-11 items-center rounded-md border border-line-strong px-3 text-sm font-semibold"
                onClick={() => void saveFile(preview.file)}
              >
                Download
              </button>
              <button
                type="button"
                className="inline-flex size-11 items-center justify-center rounded-md border border-line"
                aria-label="Close preview"
                onClick={closePreview}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            {preview.kind === "image" ? (
              <img src={preview.url} alt="" className="min-h-0 flex-1 bg-paper object-contain" />
            ) : (
              <iframe title={preview.file.name} src={preview.url} className="min-h-0 w-full flex-1 bg-paper" />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DocRow({
  label,
  checked,
  files,
  onToggle,
  onAttach,
  onOpen,
  onSave,
  onRemove,
}: {
  label: string;
  checked: boolean;
  files: Attachment[];
  onToggle: (on: boolean) => void;
  onAttach: (list: FileList) => void;
  onOpen: (file: Attachment) => void;
  onSave: (file: Attachment) => void;
  onRemove: (file: Attachment) => void;
}) {
  const [over, setOver] = useState(false);
  const hot = checked || files.length > 0 || over;
  return (
    <li
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (event.dataTransfer.files.length) onAttach(event.dataTransfer.files);
      }}
      className={`rounded-md border px-3 py-2 ${hot ? "border-red bg-red-soft" : "border-line bg-card"}`}
    >
      <div className="flex items-start gap-3">
        <label className="flex min-h-11 flex-1 items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onToggle(event.target.checked)}
            className="mt-1 size-4 accent-red"
          />
          <span>
            {label}
            {files.length === 0 ? <span className="mt-0.5 block text-xs text-muted">No file attached</span> : null}
          </span>
        </label>
        <AttachButton label={`Attach ${label}`} onAttach={onAttach} />
      </div>
      {files.length > 0 ? (
        <ul className="mt-1 grid gap-1">
          {files.map((file) => (
            <FileLine key={file.id} file={file} onOpen={onOpen} onSave={onSave} onRemove={onRemove} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function OtherDrop({
  files,
  onAttach,
  onOpen,
  onSave,
  onRemove,
}: {
  files: Attachment[];
  onAttach: (list: FileList) => void;
  onOpen: (file: Attachment) => void;
  onSave: (file: Attachment) => void;
  onRemove: (file: Attachment) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      className={`rounded-md border border-dashed px-4 py-5 text-center ${over ? "border-red bg-red-soft" : "border-line-strong bg-paper"}`}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (event.dataTransfer.files.length) onAttach(event.dataTransfer.files);
      }}
    >
      <Paperclip className="mx-auto size-5 text-red" aria-hidden="true" />
      <p className="mt-2 text-sm font-medium">Drop supporting documents here</p>
      <p className="mt-1 text-sm text-muted">PDF, image, Word, Excel, or text. 20 MB each.</p>
      <div className="mt-3">
        <AttachButton label="Choose files" onAttach={onAttach} />
      </div>
      {files.length > 0 ? (
        <ul className="mt-4 grid gap-1 text-left">
          {files.map((file) => (
            <FileLine key={file.id} file={file} onOpen={onOpen} onSave={onSave} onRemove={onRemove} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AttachButton({ label, onAttach }: { label: string; onAttach: (list: FileList) => void }) {
  return (
    <label className="inline-flex h-11 shrink-0 cursor-pointer items-center rounded-md border border-line-strong bg-card px-3 text-sm font-semibold text-ink">
      {label === "Choose files" ? "Choose files" : "Attach"}
      <input
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        aria-label={label}
        onChange={(event) => {
          const list = event.target.files;
          if (list && list.length) onAttach(list);
          event.target.value = "";
        }}
      />
    </label>
  );
}

function FileLine({
  file,
  onOpen,
  onSave,
  onRemove,
}: {
  file: Attachment;
  onOpen: (file: Attachment) => void;
  onSave: (file: Attachment) => void;
  onRemove: (file: Attachment) => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-md border border-line bg-card px-2">
      <FileText className="size-4 shrink-0 text-red" aria-hidden="true" />
      <button type="button" className="h-11 min-w-0 flex-1 truncate text-left text-sm" onClick={() => onOpen(file)}>
        {file.name}
      </button>
      <span className="shrink-0 text-xs text-muted tabular-nums">{formatBytes(file.size)}</span>
      <button
        type="button"
        className="inline-flex size-11 items-center justify-center text-ink-soft"
        aria-label={`Download ${file.name}`}
        onClick={() => onSave(file)}
      >
        <Download className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="inline-flex size-11 items-center justify-center text-ink-soft"
        aria-label={`Remove ${file.name}`}
        onClick={() => onRemove(file)}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}
