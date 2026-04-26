#!/bin/bash

# AGP needs cmake 3.22.1 in $ANDROID_HOME/cmake/3.22.1/ to build native modules
# (expo-modules-core, react-native-worklets, react-native-screens).
# EAS build machines don't have it pre-installed and sdkmanager can't reach the
# internet during the build phase, so we create the expected SDK directory entry
# as a symlink to whatever cmake version is available on the system.

CMAKE_SDK_PATH="${ANDROID_HOME}/cmake/3.22.1"

if [ -d "$CMAKE_SDK_PATH" ]; then
    echo "cmake 3.22.1 already present in Android SDK, skipping setup."
    exit 0
fi

echo "cmake 3.22.1 not found in Android SDK. Configuring system cmake..."

# Ensure cmake is installed
if ! command -v cmake > /dev/null 2>&1; then
    echo "cmake not found in PATH, installing via apt..."
    sudo apt-get update -qq && sudo apt-get install -y cmake
fi

CMAKE_BIN=$(which cmake)
echo "System cmake: $CMAKE_BIN ($(cmake --version | head -1))"

# Create the cmake 3.22.1 directory structure AGP expects.
# AGP determines the cmake version from the directory name, so having the binary
# here is enough — it won't re-check the version. The system cmake (≥3.22.1)
# satisfies cmake_minimum_required(VERSION 3.22.1) in the CMakeLists.txt files.
mkdir -p "$CMAKE_SDK_PATH/bin"
ln -sf "$CMAKE_BIN" "$CMAKE_SDK_PATH/bin/cmake"

for tool in ctest cpack; do
    TOOL_BIN=$(which $tool 2>/dev/null || true)
    if [ -n "$TOOL_BIN" ]; then
        ln -sf "$TOOL_BIN" "$CMAKE_SDK_PATH/bin/$tool"
    fi
done

echo "cmake 3.22.1 configured: $CMAKE_SDK_PATH/bin/cmake -> $CMAKE_BIN"
