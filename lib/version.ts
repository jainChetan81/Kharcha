/**
 * App version helpers
 * Tracks app version and schema version for migration handling
 *
 * Keep in sync with package.json and app.json when bumping. Expo does not
 * support prerelease suffixes in app.json, and compareVersions() below only
 * handles major.minor.patch — so any `-beta`/`-rc` tag lives in package.json
 * alone.
 */

// Keep in sync with app.json
const APP_VERSION = "0.7.0";
export function compareVersions(v1: string, v2: string): -1 | 0 | 1 {
  const [major1, minor1, patch1] = v1.split(".").map(Number);
  const [major2, minor2, patch2] = v2.split(".").map(Number);

  if (major1 !== major2) return major1 < major2 ? -1 : 1;
  if (minor1 !== minor2) return minor1 < minor2 ? -1 : 1;
  if (patch1 !== patch2) return patch1 < patch2 ? -1 : 1;

  return 0;
}

/**
 * Check if upgrade needed
 * @param previousVersion - Version from DB config
 * @returns true if current app version > previous version in DB
 */
export function isUpgrade(previousVersion: string | null): boolean {
  if (!previousVersion) return true; // First time setup
  return compareVersions(APP_VERSION, previousVersion) > 0;
}

/**
 * Check if major version upgrade (breaking changes)
 */
export function isMajorUpgrade(previousVersion: string | null): boolean {
  if (!previousVersion) return false;

  const [prevMajor] = previousVersion.split(".").map(Number);
  const [currentMajor] = APP_VERSION.split(".").map(Number);

  return currentMajor > prevMajor;
}

export { APP_VERSION };
