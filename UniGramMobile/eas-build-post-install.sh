#!/bin/bash

# ── 1. CMake 3.22.1 ──────────────────────────────────────────────────────────
# AGP needs cmake 3.22.1 in $ANDROID_HOME/cmake/3.22.1/ to build native modules
# (expo-modules-core, react-native-worklets, react-native-screens).
# EAS build machines don't have it pre-installed and sdkmanager can't reach the
# internet during the build phase, so we create the expected SDK directory entry
# as a symlink to whatever cmake version is available on the system.

CMAKE_SDK_PATH="${ANDROID_HOME}/cmake/3.22.1"

if [ ! -d "$CMAKE_SDK_PATH" ]; then
    echo "cmake 3.22.1 not found in Android SDK. Configuring system cmake..."

    if ! command -v cmake > /dev/null 2>&1; then
        echo "cmake not found in PATH, installing via apt..."
        sudo apt-get update -qq && sudo apt-get install -y cmake
    fi

    CMAKE_BIN=$(which cmake)
    echo "System cmake: $CMAKE_BIN ($(cmake --version | head -1))"

    mkdir -p "$CMAKE_SDK_PATH/bin"
    ln -sf "$CMAKE_BIN" "$CMAKE_SDK_PATH/bin/cmake"

    for tool in ctest cpack; do
        TOOL_BIN=$(which $tool 2>/dev/null || true)
        if [ -n "$TOOL_BIN" ]; then
            ln -sf "$TOOL_BIN" "$CMAKE_SDK_PATH/bin/$tool"
        fi
    done

    echo "cmake 3.22.1 configured: $CMAKE_SDK_PATH/bin/cmake -> $CMAKE_BIN"
else
    echo "cmake 3.22.1 already present in Android SDK."
fi

# ── 2. Remove Aliyun mirrors ──────────────────────────────────────────────────
# Aliyun mirrors (maven.aliyun.com) return HTTP 502 for JitPack artifacts such
# as com.github.Dimezis:BlurView (required by expo-blur). Gradle 8.x treats a
# 5xx response as a fatal resolution failure rather than trying the next repo,
# so any Aliyun entry before jitpack.io in the repository list breaks the build.
#
# We create a Gradle user-level init script that runs after expo prebuild
# regenerates android/ and removes any Aliyun repository before dependency
# resolution begins.

mkdir -p "${HOME}/.gradle/init.d"

cat > "${HOME}/.gradle/init.d/filter-aliyun-repos.gradle" << 'GROOVY'
// Removes Aliyun mirrors that return 502 for JitPack artifacts on EAS machines.
allprojects {
    afterEvaluate { project ->
        def aliyun = project.repositories.findAll { repo ->
            repo instanceof MavenArtifactRepository &&
            repo.url.toString().contains('aliyun')
        }
        aliyun.each { repo ->
            project.repositories.remove(repo)
            println "[filter-aliyun] Removed repository: ${repo.url}"
        }
    }
}
GROOVY

echo "Gradle init script created: ${HOME}/.gradle/init.d/filter-aliyun-repos.gradle"
