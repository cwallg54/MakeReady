import "server-only";
import {
  ShareServiceClient,
  StorageSharedKeyCredential,
  generateFileSASQueryParameters,
  FileSASPermissions,
  SASProtocol,
} from "@azure/storage-file-share";

/**
 * Azure Files client for the Content Library. Azure Files (an SMB share the
 * artists map as a drive) is the system of record for the actual asset bytes;
 * Neon only keeps metadata + a small thumbnail. Configure via env — every
 * function degrades gracefully (returns null / no-ops) when it's unset, so the
 * DB-backed library keeps working until Azure is wired up.
 *
 * Env (put in platform/.env.local, never committed):
 *   AZURE_STORAGE_CONNECTION_STRING   – full connection string (preferred), OR
 *   AZURE_STORAGE_ACCOUNT + AZURE_STORAGE_KEY – account name + access key
 *   AZURE_FILES_SHARE                 – the file share name (e.g. "content")
 *   AZURE_FILES_ROOT                  – optional sub-directory to treat as the root
 */

export function azureShareName(): string | null {
  return process.env.AZURE_FILES_SHARE || null;
}

function parseAccountFromConnStr(cs: string): { name: string; key: string } | null {
  const name = /AccountName=([^;]+)/i.exec(cs)?.[1];
  const key = /AccountKey=([^;]+)/i.exec(cs)?.[1];
  return name && key ? { name, key } : null;
}

function credentials(): { name: string; key: string } | null {
  const cs = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (cs) return parseAccountFromConnStr(cs);
  const name = process.env.AZURE_STORAGE_ACCOUNT;
  const key = process.env.AZURE_STORAGE_KEY;
  return name && key ? { name, key } : null;
}

export function azureConfigured(): boolean {
  return !!(credentials() && azureShareName());
}

function serviceClient(): ShareServiceClient | null {
  const cs = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (cs) {
    try { return ShareServiceClient.fromConnectionString(cs); } catch { /* fall through */ }
  }
  const cred = credentials();
  if (!cred) return null;
  try {
    return new ShareServiceClient(`https://${cred.name}.file.core.windows.net`, new StorageSharedKeyCredential(cred.name, cred.key));
  } catch {
    return null;
  }
}

export interface AzureFile { path: string; name: string; sizeBytes: number }

/** Recursively list files under the share (optionally under a sub-directory). */
export async function listShareFiles(subdir?: string): Promise<AzureFile[]> {
  const svc = serviceClient();
  const share = azureShareName();
  if (!svc || !share) return [];
  const shareClient = svc.getShareClient(share);
  const out: AzureFile[] = [];
  const root = subdir ?? process.env.AZURE_FILES_ROOT ?? "";

  async function walk(dirPath: string) {
    const dir = dirPath ? shareClient.getDirectoryClient(dirPath) : shareClient.rootDirectoryClient;
    for await (const item of dir.listFilesAndDirectories()) {
      const childPath = dirPath ? `${dirPath}/${item.name}` : item.name;
      if (item.kind === "directory") {
        await walk(childPath);
      } else {
        out.push({ path: childPath, name: item.name, sizeBytes: (item as { properties?: { contentLength?: number } }).properties?.contentLength ?? 0 });
      }
    }
  }
  await walk(root);
  return out;
}

/** Download a file's bytes (used to make a thumbnail / AI-tag on import). */
export async function readShareFile(path: string): Promise<Buffer | null> {
  const svc = serviceClient();
  const share = azureShareName();
  if (!svc || !share) return null;
  try {
    const file = svc.getShareClient(share).getDirectoryClient(dirOf(path)).getFileClient(baseName(path));
    const buf = await file.downloadToBuffer();
    return buf as Buffer;
  } catch (e) {
    console.error("[azure] readShareFile failed", path, e);
    return null;
  }
}

/** Upload bytes to the share (app-side uploads write back to the same drive). */
export async function uploadShareFile(path: string, data: Buffer, contentType?: string): Promise<boolean> {
  const svc = serviceClient();
  const share = azureShareName();
  if (!svc || !share) return false;
  try {
    const shareClient = svc.getShareClient(share);
    // Ensure the directory chain exists.
    const parts = dirOf(path).split("/").filter(Boolean);
    let dir = shareClient.rootDirectoryClient;
    let acc = "";
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p;
      dir = shareClient.getDirectoryClient(acc);
      await dir.createIfNotExists();
    }
    const file = shareClient.getDirectoryClient(dirOf(path)).getFileClient(baseName(path));
    await file.uploadData(data, { fileHttpHeaders: contentType ? { fileContentType: contentType } : undefined });
    return true;
  } catch (e) {
    console.error("[azure] uploadShareFile failed", path, e);
    return false;
  }
}

/** A short-lived read-only SAS URL for a file, so the browser streams it
 *  straight from Azure (big files never proxy through the app). */
export function fileSasUrl(path: string, minutes = 30): string | null {
  const cred = credentials();
  const share = azureShareName();
  if (!cred || !share) return null;
  try {
    const shared = new StorageSharedKeyCredential(cred.name, cred.key);
    const now = new Date();
    const sas = generateFileSASQueryParameters({
      shareName: share,
      filePath: path,
      permissions: FileSASPermissions.parse("r"),
      startsOn: new Date(now.getTime() - 5 * 60_000),
      expiresOn: new Date(now.getTime() + minutes * 60_000),
      protocol: SASProtocol.Https,
    }, shared).toString();
    const enc = path.split("/").map(encodeURIComponent).join("/");
    return `https://${cred.name}.file.core.windows.net/${share}/${enc}?${sas}`;
  } catch (e) {
    console.error("[azure] fileSasUrl failed", path, e);
    return null;
  }
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i) : "";
}
function baseName(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}
