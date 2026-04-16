const { withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Fixes Firebase iOS build with React Native by:
 * 1. Setting $RNFirebaseAsStaticFramework so only Firebase pods use static
 *    frameworks (avoids breaking RN bridge macros with global useFrameworks)
 * 2. Adding use_modular_headers! so Firebase's Swift dependencies generate
 *    module maps (required for static framework integration)
 */
module.exports = function withFirebaseIosFix(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile",
      );
      let podfile = fs.readFileSync(podfilePath, "utf8");

      const prepend = [];
      if (!podfile.includes("$RNFirebaseAsStaticFramework")) {
        prepend.push("$RNFirebaseAsStaticFramework = true");
      }
      if (!podfile.includes("use_modular_headers!")) {
        prepend.push("use_modular_headers!");
      }
      if (prepend.length > 0) {
        podfile = `${prepend.join("\n")}\n${podfile}`;
      }

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
};
