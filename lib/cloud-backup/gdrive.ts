// Google Drive backup using the `appDataFolder` space — a hidden, per-app
// folder in the user's Drive that doesn't appear in the Drive UI. Reuses
// the OAuth access token that's already minted for Gmail sync; we just need
// the additional `drive.appdata` scope on the consent screen.
//
// API docs:
//   https://developers.google.com/drive/api/v3/appdata
//   https://developers.google.com/drive/api/guides/manage-uploads#multipart
import { getValidAccessToken } from "@/lib/gmail/auth";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

// Drive `q` uses single quotes around string literals. Keep this a plain
// identifier (no apostrophes) or escape before interpolating.
const BACKUP_FILENAME = "kharcha-backup.db";
const BACKUP_MIME = "application/x-sqlite3";

export class DriveScopeMissingError extends Error {
  constructor() {
    super(
      "Google Drive permission missing. Reconnect Google in Gmail Sync to re-grant access.",
    );
    this.name = "DriveScopeMissingError";
  }
}

function isScopeError(status: number, bodyText: string): boolean {
  if (status !== 401 && status !== 403) return false;
  return (
    bodyText.includes("insufficientPermissions") ||
    bodyText.includes("insufficient_scope") ||
    bodyText.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT")
  );
}

export type DriveBackupFile = {
  id: string;
  name: string;
  modifiedTime: string;
  size: number;
};

async function getToken(): Promise<string> {
  const token = await getValidAccessToken();
  if (!token) {
    throw new Error("Not signed in to Google. Connect Gmail to enable backup.");
  }
  return token;
}

// Find the existing backup file in appDataFolder so we can replace it
// instead of creating a new file every time (keeps Drive tidy and avoids
// unbounded growth).
async function findExistingBackup(token: string): Promise<string | null> {
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set("spaces", "appDataFolder");
  url.searchParams.set("fields", "files(id,name,modifiedTime)");
  url.searchParams.set("q", `name='${BACKUP_FILENAME}' and trashed=false`);
  url.searchParams.set("pageSize", "1");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    if (isScopeError(res.status, text)) throw new DriveScopeMissingError();
    throw new Error(`Drive list failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { files?: Array<{ id: string }> };
  return data.files?.[0]?.id ?? null;
}

// Multipart upload (metadata + binary in one request). For files <5MB this
// is the simplest path; the SQLite backup is well under that threshold for
// any realistic personal-finance dataset.
async function uploadMultipart(
  token: string,
  body: ArrayBuffer,
  existingId: string | null,
): Promise<string> {
  const boundary = `kharcha-${Date.now()}`;
  const metadata = existingId
    ? {} // PATCH doesn't accept parents/spaces — file already exists
    : { name: BACKUP_FILENAME, parents: ["appDataFolder"] };

  const head =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${BACKUP_MIME}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;

  const headBytes = new TextEncoder().encode(head);
  const tailBytes = new TextEncoder().encode(tail);
  const merged = new Uint8Array(
    headBytes.byteLength + body.byteLength + tailBytes.byteLength,
  );
  merged.set(headBytes, 0);
  merged.set(new Uint8Array(body), headBytes.byteLength);
  merged.set(tailBytes, headBytes.byteLength + body.byteLength);

  const url = existingId
    ? `${DRIVE_UPLOAD}/files/${existingId}?uploadType=multipart`
    : `${DRIVE_UPLOAD}/files?uploadType=multipart`;

  const res = await fetch(url, {
    method: existingId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: merged,
  });
  if (!res.ok) {
    const text = await res.text();
    if (isScopeError(res.status, text)) throw new DriveScopeMissingError();
    throw new Error(`Drive upload failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { id: string };
  return json.id;
}

export async function uploadBackupToDrive(
  body: ArrayBuffer,
): Promise<{ fileId: string; modifiedTime: string }> {
  const token = await getToken();
  const existingId = await findExistingBackup(token);
  const fileId = await uploadMultipart(token, body, existingId);
  return { fileId, modifiedTime: new Date().toISOString() };
}

export async function getLatestDriveBackup(): Promise<DriveBackupFile | null> {
  const token = await getToken();
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set("spaces", "appDataFolder");
  url.searchParams.set("fields", "files(id,name,modifiedTime,size)");
  url.searchParams.set("q", `name='${BACKUP_FILENAME}' and trashed=false`);
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("orderBy", "modifiedTime desc");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    if (isScopeError(res.status, text)) throw new DriveScopeMissingError();
    throw new Error(`Drive list failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { files?: DriveBackupFile[] };
  const file = data.files?.[0];
  if (!file) return null;
  return {
    ...file,
    size: typeof file.size === "string" ? Number(file.size) : (file.size ?? 0),
  };
}

export async function downloadBackupFromDrive(
  fileId: string,
): Promise<ArrayBuffer> {
  const token = await getToken();
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    if (isScopeError(res.status, text)) throw new DriveScopeMissingError();
    throw new Error(`Drive download failed: ${res.status}`);
  }
  return res.arrayBuffer();
}
