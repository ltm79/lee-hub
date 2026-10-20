import { fetchDeskFile } from "@/lib/desk/account";
import { getBlob, putBlob } from "@/lib/desk/blobs";
import { getSubmitted, type SubmittedRow } from "@/lib/desk/people";

export async function hydrateSubmitted(id: string): Promise<SubmittedRow | null> {
  const row = await getSubmitted({ data: id });
  if (!row) return null;
  for (const file of row.files ?? []) {
    if (await getBlob(file.id)) continue;
    const downloaded = await fetchDeskFile({ data: file.id });
    if (!downloaded?.contentBase64) continue;
    const bytes = Uint8Array.from(atob(downloaded.contentBase64), (char) => char.charCodeAt(0));
    await putBlob(row.id, file.id, new Blob([bytes], { type: downloaded.mime || file.type }));
  }
  return row;
}
