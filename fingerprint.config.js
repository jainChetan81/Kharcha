/**
 * Config for `@expo/fingerprint`, which computes the OTA runtime version
 * (app.json → `runtimeVersion: { policy: "fingerprint" }`).
 *
 * The fingerprint is a hash of the project's *native* layer — native deps,
 * config plugins, app.json native fields, and custom native modules under
 * `modules/`. OTA updates only reach builds whose fingerprint matches, so the
 * runtime changes exactly when (and only when) a new native build is required.
 *
 * `ExpoConfigVersions` strips `version`, `ios.buildNumber`, and
 * `android.versionCode` from the hash. Without this, bumping any of those
 * (which the release checklist does on every build) would change the runtime
 * and break OTA continuity — the same version-coupling problem the old
 * `appVersion` policy had. Excluding them keeps OTA reachability tied to native
 * compatibility, not marketing version.
 *
 * @type {import('@expo/fingerprint').Config}
 */
module.exports = {
  sourceSkips: ["ExpoConfigVersions"],
};
