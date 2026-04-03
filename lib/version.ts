/**
 * App version helpers
 * Tracks app version and schema version for migration handling
 *
 * Version locations and intentional divergence:
 *   - package.json: "0.1.0-beta.1" (full semver with prerelease tag)
 *   - app.json:     "0.1.0"        (Expo does not support prerelease suffixes)
 *   - version.ts:   "0.1.0"        (used for runtime comparisons — matches app.json
 *                                    since compareVersions() only handles major.minor.patch)
 *
 * When bumping versions, update all three. The prerelease tag in package.json
 * is intentionally omitted here and in app.json due to platform limitations.
 */

// Keep in sync with app.json (see comment above for why this omits prerelease tag)
const APP_VERSION = "0.1.0";
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
