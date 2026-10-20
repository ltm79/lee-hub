import { ChevronRight, FileText, Folder, FolderPlus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import {
  createLibraryFolder,
  deleteLibraryNode,
  downloadLibraryFile,
  listLibrary,
  uploadLibraryFile,
} from "@/lib/portal.functions";
import type { LibraryNode } from "@/lib/portal.types";

const ACCEPT = ".pdf,.csv,.xls,.xlsx,.xlsm,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt,.zip";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const CHUNK_BYTES = 2_097_150;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readBlob(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      const comma = raw.indexOf(",");
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that file."));
    reader.readAsDataURL(blob);
  });
}

function saveDownload(name: string, content: string) {
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes]));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function MarketLibrary({ canEdit }: { canEdit: boolean }) {
  const [stack, setStack] = useState<{ id: string; name: string }[]>([]);
  const [nodes, setNodes] = useState<LibraryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const parentId = stack.at(-1)?.id ?? "";

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setNodes([]);
    setError("");
    setConfirmId("");
    listLibrary({ data: { parentId } })
      .then((result) => {
        if (cancel) return;
        if (result.ok) setNodes(result.nodes);
        else {
          setNodes([]);
          setError(result.error);
        }
      })
      .catch(() => {
        if (!cancel) setError("Could not open this folder.");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [parentId]);

  async function refresh() {
    const result = await listLibrary({ data: { parentId } });
    if (result.ok) {
      setNodes(result.nodes);
      setError("");
    } else setError(result.error);
  }

  async function addFolder(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await createLibraryFolder({ data: { parentId, name: folderName } });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFolderName("");
    setAdding(false);
    await refresh();
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setError("");
    for (const file of Array.from(list)) {
      if (file.size <= 0) {
        setError("That file is empty.");
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(`${file.name} is over 20 MB.`);
        break;
      }
      const id = crypto.randomUUID();
      let offset = 0;
      let failed = false;
      for (let start = 0; start < file.size; start += CHUNK_BYTES) {
        const content = await readBlob(file.slice(start, Math.min(file.size, start + CHUNK_BYTES)));
        const result = await uploadLibraryFile({
          data: {
            id,
            parentId,
            name: file.name,
            content,
            offset,
            done: start + CHUNK_BYTES >= file.size,
          },
        });
        if (!result.ok) {
          setError(result.error);
          failed = true;
          break;
        }
        offset += content.length;
      }
      if (failed) break;
    }
    if (fileRef.current) fileRef.current.value = "";
    setBusy(false);
    await refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    const result = await deleteLibraryNode({ data: { id } });
    setBusy(false);
    setConfirmId("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await refresh();
  }

  async function download(node: LibraryNode) {
    setError("");
    const parts: string[] = [];
    let offset = 0;
    let name = node.name;
    for (;;) {
      const result = await downloadLibraryFile({ data: { id: node.id, offset } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      name = result.name;
      parts.push(result.content);
      offset += result.content.length;
      if (offset >= result.total) break;
    }
    try {
      saveDownload(name, parts.join(""));
    } catch {
      setError("Could not open that file.");
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold">Market files</h3>
          <p className="mt-1 text-sm text-muted">Folders and reports kept for this market.</p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => setAdding(true)}>
              <FolderPlus className="size-4" aria-hidden="true" />
              New folder
            </Button>
            <Button disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" aria-hidden="true" />
              Add file
            </Button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(event) => void addFiles(event.target.files)}
            />
          </div>
        ) : null}
      </div>

      {stack.length > 0 ? (
        <nav className="mt-3 flex flex-wrap items-center gap-1 text-sm" aria-label="Folder path">
          <button
            type="button"
            className="rounded-sm px-1.5 py-1 font-medium text-crimson hover:bg-blush"
            onClick={() => setStack([])}
          >
            Market files
          </button>
          {stack.map((crumb, index) => (
            <span key={crumb.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="size-3.5 text-faint" aria-hidden="true" />
              <button
                type="button"
                className="max-w-40 truncate rounded-sm px-1.5 py-1 font-medium text-ink hover:bg-blush"
                onClick={() => setStack(stack.slice(0, index + 1))}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
      ) : null}

      {adding ? (
        <form onSubmit={(event) => void addFolder(event)} className="mt-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="folder-name">
            Folder name
          </label>
          <input
            id="folder-name"
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            placeholder="Submarket, quarter, or city"
            autoFocus
            className="h-10 w-full rounded-sm border border-line bg-surface px-3 text-base outline-none focus:border-crimson sm:w-72"
          />
          <Button type="submit" disabled={busy || !folderName.trim()}>
            Add folder
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setAdding(false);
              setFolderName("");
            }}
          >
            Cancel
          </Button>
        </form>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-deep" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? <p className="mt-4 text-sm text-muted">Opening this folder.</p> : null}

      {!loading && !error && nodes.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center">
          <p className="font-medium">Nothing in this folder yet</p>
          <p className="mt-1 text-sm text-muted">
            {canEdit ? "Add a subfolder or a market file. Up to 20 MB each." : "Files added by an administrator show up here."}
          </p>
        </div>
      ) : null}

      {nodes.length > 0 ? (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-card">
          {nodes.map((node) => (
            <li key={node.id} className="flex items-center gap-2 pr-1 pl-3">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
                onClick={() =>
                  node.kind === "folder" ? setStack([...stack, { id: node.id, name: node.name }]) : void download(node)
                }
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-blush text-crimson">
                  {node.kind === "folder" ? (
                    <Folder className="size-4" aria-hidden="true" />
                  ) : (
                    <FileText className="size-4" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{node.name}</span>
                  <span className="block text-sm text-muted">
                    {node.kind === "folder" ? "Folder" : formatSize(node.sizeBytes)}
                  </span>
                </span>
              </button>
              {canEdit && confirmId === node.id ? (
                <span className="flex shrink-0 items-center">
                  <button
                    type="button"
                    className="h-10 px-2 text-sm font-medium text-deep"
                    disabled={busy}
                    onClick={() => void remove(node.id)}
                  >
                    {node.kind === "folder" ? "Delete folder" : "Delete"}
                  </button>
                  <button type="button" className="h-10 px-2 text-sm text-muted" onClick={() => setConfirmId("")}>
                    Cancel
                  </button>
                </span>
              ) : null}
              {canEdit && confirmId !== node.id ? (
                <button
                  type="button"
                  aria-label={`Delete ${node.name}`}
                  className="grid size-11 shrink-0 place-items-center rounded-sm text-faint hover:bg-blush hover:text-crimson"
                  onClick={() => setConfirmId(node.id)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
