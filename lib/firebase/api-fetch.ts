import { logFirebaseError } from "@/lib/firebase";

export async function apiFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, options);
  if (!res.ok) {
    logFirebaseError(new Error(`${res.status} ${url}`), {
      error_type: "API_ERROR",
      operation: "api_fetch",
      status: res.status.toString(),
    });
  }
  return res;
}
