import { getAndroidId, getIosIdForVendorAsync } from "expo-application";
import { API_ERRORS, CONFIG_KEYS } from "@/lib/constants";
import { getConfig, updateConfig } from "@/lib/db/config";
import { env } from "@/lib/env";
import { apiFetch, parseErrorResponse } from "@/lib/firebase/api-fetch";
import { isIOS } from "@/lib/utils";

export type DevicePlatform = "ios" | "android";

export const DEVICE_PLATFORM: DevicePlatform = isIOS ? "ios" : "android";

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getConfig(CONFIG_KEYS.DEVICE_ID);
  if (existing) return existing;

  const vendorId = isIOS ? await getIosIdForVendorAsync() : getAndroidId();
  const id = `kharcha-${vendorId ?? crypto.randomUUID()}`;
  await updateConfig(CONFIG_KEYS.DEVICE_ID, id);
  return id;
}

let registerInFlight: Promise<{ forwarding_email: string }> | null = null;

export async function registerDevice(
  deviceId: string,
  name?: string,
): Promise<{ forwarding_email: string }> {
  if (registerInFlight) return registerInFlight;

  registerInFlight = (async () => {
    const res = await apiFetch(`${env.API_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_id: deviceId,
        platform: DEVICE_PLATFORM,
        name: name || undefined,
      }),
    });

    if (!res.ok) {
      throw new Error(await parseErrorResponse(res, "Registration failed"));
    }

    const data = (await res.json()) as { forwarding_email: string };

    await updateConfig(
      CONFIG_KEYS.BACKEND_FORWARDING_EMAIL,
      data.forwarding_email,
    );

    return data;
  })().finally(() => {
    registerInFlight = null;
  });

  return registerInFlight;
}

// Auto-registers the device on 401 "Device not registered" and retries once.
// Use for all authed endpoints; do NOT use for /register itself.
export async function apiFetchAuthed(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const deviceId = await getOrCreateDeviceId();
  const headers = { ...(options?.headers ?? {}), "x-device-id": deviceId };

  const res = await apiFetch(url, { ...options, headers });
  if (res.status !== 401) return res;

  const body = await res
    .clone()
    .json()
    .catch(() => null);
  if (body?.error !== API_ERRORS.DEVICE_NOT_REGISTERED) return res;

  await registerDevice(deviceId);
  return apiFetch(url, { ...options, headers });
}
