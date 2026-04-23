import { logFirebaseError } from "@/lib/firebase";

const EXPECTED_STATUSES = new Set([401, 404]);

export async function apiFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, options);
  if (!res.ok && !EXPECTED_STATUSES.has(res.status)) {
    logFirebaseError(new Error(`${res.status} ${url}`), {
      error_type: "API_ERROR",
      operation: "api_fetch",
      status: res.status.toString(),
    });
  }
  return res;
}

export async function parseErrorResponse(
  res: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = await res.json();
    return body.error ?? fallback;
  } catch {
    return `${fallback} (${res.status})`;
  }
}
