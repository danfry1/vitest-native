#!/usr/bin/env bash
#
# Cross-package-manager resolution matrix for the native engine.
#
# Builds + packs vitest-native, then installs a minimal real React Native test
# project under npm, pnpm, and bun, and runs the SAME suite under each — in two
# scenarios:
#   clean — a normal single-React install (the happy path)
#   split — a second physical `react` planted inside react-native's own
#           node_modules, so the externalized RN graph resolves a DIFFERENT React
#           than the test/renderer (the everyday monorepo / version-skew / strict-
#           store condition). Without the Node-layer React-singleton dedupe (see
#           src/native/hooks.mjs + loader.mjs) this crashes with "Invalid hook call".
#
# Installs run in a temp dir OUTSIDE the repo so each PM's store stays isolated and
# corepack doesn't trip on the repo's `packageManager` field. Requires npm, pnpm,
# and bun on PATH; any missing manager is skipped.
set -u

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
TARBALL_DIR="$WORK/_tarball"
SUMMARY="$WORK/SUMMARY.txt"
mkdir -p "$TARBALL_DIR"
: > "$SUMMARY"

echo "Building + packing vitest-native…"
( cd "$PKG_DIR" && bun run build ) >/dev/null 2>&1 || { echo "build failed"; exit 1; }
TARBALL="$(cd "$PKG_DIR" && npm pack --pack-destination "$TARBALL_DIR" 2>/dev/null | tail -1)"
TARBALL="$TARBALL_DIR/$TARBALL"
[ -f "$TARBALL" ] || { echo "pack failed"; exit 1; }

plant_split () {
  local rn_dir
  rn_dir=$(node -e 'console.log(require("module").createRequire(process.cwd()+"/package.json").resolve("react-native"))' 2>/dev/null | xargs dirname 2>/dev/null)
  [ -z "$rn_dir" ] && return 1
  mkdir -p "$rn_dir/node_modules/react"
  cp -R node_modules/react/. "$rn_dir/node_modules/react/" 2>/dev/null
}

run_pm () {
  local pm="$1" install_cmd="$2"
  command -v "$pm" >/dev/null 2>&1 || { echo "$pm | SKIPPED (not installed)" | tee -a "$SUMMARY"; return; }
  local dir="$WORK/$pm"
  rm -rf "$dir"; mkdir -p "$dir"
  cp "$PKG_DIR/pm-matrix/template/"*.tsx "$PKG_DIR/pm-matrix/template/"*.mts "$dir/"
  sed "s#__TARBALL__#$TARBALL#" "$PKG_DIR/pm-matrix/template/package.json" > "$dir/package.json"
  cd "$dir" || return

  echo "[$pm] installing…"
  if ! eval "$install_cmd" >"$dir/install.log" 2>&1; then
    echo "$pm | INSTALL FAILED" | tee -a "$SUMMARY"; tail -15 "$dir/install.log"; return
  fi

  ./node_modules/.bin/vitest run >"$dir/test-clean.log" 2>&1; local a=$?
  local rc_clean; rc_clean=$(find node_modules -path '*/react/package.json' | wc -l | tr -d ' ')

  plant_split
  local rc_split; rc_split=$(find node_modules -path '*/react/package.json' | wc -l | tr -d ' ')
  # Guard against a vacuous "split" run: if planting did not actually add a second
  # physical react, the scenario is just a second clean install and a PASS proves
  # nothing. Fail loudly instead.
  if [ "$rc_split" -le "$rc_clean" ]; then
    echo "$pm | clean(react=$rc_clean): — | split: PLANT FAILED (react still $rc_split, expected >$rc_clean)" | tee -a "$SUMMARY"
    return
  fi
  ./node_modules/.bin/vitest run >"$dir/test-split.log" 2>&1; local b=$?

  local sa sb; [ $a -eq 0 ] && sa=PASS || sa=FAIL; [ $b -eq 0 ] && sb=PASS || sb=FAIL
  echo "$pm | clean(react=$rc_clean): $sa | split(react=$rc_split): $sb" | tee -a "$SUMMARY"
}

run_pm npm  "npm install --no-audit --no-fund"
run_pm pnpm "pnpm install"
run_pm bun  "bun install"

echo
echo "================ PM RESOLUTION MATRIX ================"
cat "$SUMMARY"
echo "(logs under $WORK)"
# Non-zero exit if any scenario failed.
grep -q "FAIL" "$SUMMARY" && exit 1 || exit 0
