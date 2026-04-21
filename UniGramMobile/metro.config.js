const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Reanimated 4.x points its "react-native" field to TypeScript source (src/index.ts),
// which Metro can't resolve through third-party packages like react-native-css-interop.
// Force Metro to use the pre-compiled build instead.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react-native-reanimated") {
    return {
      filePath: path.resolve(
        __dirname,
        "node_modules/react-native-reanimated/lib/module/index.js"
      ),
      type: "sourceFile",
    };
  }
  // event-target-shim v6 exports map omits "./index"; redirect to the CJS entry
  if (moduleName === "event-target-shim/index") {
    return {
      filePath: path.resolve(
        __dirname,
        "node_modules/react-native-webrtc/node_modules/event-target-shim/index.js"
      ),
      type: "sourceFile",
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
