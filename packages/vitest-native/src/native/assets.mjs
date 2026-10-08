// Asset modules (`require('./logo.png')`, `import font from './Icon.ttf'`) as Metro
// builds them.
//
// Metro does not hand an app the asset's file name. Its asset transformer
// (metro-transform-worker/src/utils/assetTransformer.js `transform`) collects the
// asset's data with metro/src/Assets.js `getAssetData`, and
// metro/src/Bundler/util.js `generateAssetCodeFileAst` turns that into a module whose
// whole body is
//
//   module.exports = require(assetRegistryPath).registerAsset({...descriptor});
//
// so `require('./logo.png')` evaluates to a NUMBER: the id React Native's asset
// registry assigned. Everything in React Native that consumes an asset starts from
// that number — `Image.resolveAssetSource` (Libraries/Image/resolveAssetSource.js)
// looks it up with `getAssetByID` and returns null for anything unregistered, which
// is why stubbing an asset with its file name made `resolveAssetSource(require(png))`
// null and `.uri` on it a crash.
//
// Everything below mirrors those Metro functions on the same inputs, synchronously
// (the Node require hook cannot await), and with no dependency: Metro measures images
// with the `image-size` package, while the formats React Native apps ship as images
// are read here from their headers, as the format specifications define them.
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { VitestNativeError } from "../errors.mjs";

// metro-config/src/defaults/index.js: `publicPath: "/assets"`. The default every
// React Native template uses; it only feeds `httpServerLocation`.
const PUBLIC_PATH = "/assets";
// Expo CLI's dev server replaces it (@expo/cli build/src/start/server/metro/
// instantiateMetro.js); Expo's asset step then URL-encodes the path value.
const EXPO_PUBLIC_PATH = "/assets/?unstable_path=.";

// metro/src/Assets.js `isAssetTypeAnImage` — the types Metro measures. Compared
// case-sensitively there too, so `LOGO.PNG` is registered without dimensions.
const IMAGE_TYPES = new Set([
  "png",
  "jpg",
  "jpeg",
  "bmp",
  "gif",
  "webp",
  "psd",
  "svg",
  "tiff",
  "ktx",
]);

// metro/src/node-haste/lib/parsePlatformFilePath.js `PATH_RE` and
// metro/src/node-haste/lib/AssetPaths.js `ASSET_BASE_NAME_RE`.
const PATH_RE = /^(.+?)(\.([^.]+))?\.([^.]+)$/;
const ASSET_BASE_NAME_RE = /(.+?)(@([\d.]+)x)?$/;

/**
 * metro/src/node-haste/lib/AssetPaths.js `tryParse`: split a file name into the
 * asset it belongs to (`icon@2x.ios.png` → name `icon`, platform `ios`, resolution
 * 2, type `png`). A platform segment is recognised only for the platform being
 * built; any other `.android` stays part of the name, as in Metro.
 */
function parseAssetPath(filePath, platform) {
  const dirPath = path.dirname(filePath);
  const match = path.basename(filePath).match(PATH_RE);
  if (!match) return null;
  const type = match[4];
  let baseName = match[1];
  let filePlatform = match[3] ?? null;
  if (filePlatform !== null && filePlatform !== platform) {
    baseName = `${match[1]}.${filePlatform}`;
    filePlatform = null;
  }
  const base = baseName.match(ASSET_BASE_NAME_RE);
  if (!base) return null;
  const parsed = base[3] != null ? Number.parseFloat(base[3]) : Number.NaN;
  return {
    assetName: path.join(dirPath, `${base[1]}.${type}`),
    name: base[1],
    platform: filePlatform,
    resolution: Number.isNaN(parsed) ? 1 : parsed,
    type,
  };
}

/**
 * metro/src/Assets.js `buildAssetMap` + `getAbsoluteAssetRecord`: every scale
 * variant of the asset in its directory, sorted by scale. A platform-specific
 * group (`icon.ios.png`, `icon@2x.ios.png`) wins over the generic one.
 */
function assetRecord(file, platform) {
  const dir = path.dirname(file);
  const key = (assetName, filePlatform) =>
    filePlatform != null ? `${assetName} : ${filePlatform}` : assetName;
  const groups = new Map();
  for (const entry of fs.readdirSync(dir)) {
    const asset = parseAssetPath(entry, platform);
    if (asset === null) continue;
    const groupKey = key(asset.assetName, asset.platform);
    let group = groups.get(groupKey);
    if (!group) groups.set(groupKey, (group = { scales: [], files: [] }));
    let at = 0;
    while (at < group.scales.length && asset.resolution >= group.scales[at]) at++;
    group.scales.splice(at, 0, asset.resolution);
    group.files.splice(at, 0, path.join(dir, entry));
  }
  const requested = parseAssetPath(path.basename(file), platform);
  const record =
    (requested && groups.get(key(requested.assetName, platform))) ||
    (requested && groups.get(requested.assetName));
  return record ? { requested, ...record } : null;
}

/**
 * Pixel dimensions from an image's header, or null when the format is not one read
 * here or the header is not what its specification says. Metro gets these from
 * `image-size`; the formats below cover what React Native renders as images.
 */
export function imageDimensions(buffer) {
  const b = buffer;
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) {
    // PNG (W3C PNG Specification, 3rd ed., §5.2-5.3 and §11.2.1): the IHDR chunk is
    // first; width and height are its first two 4-byte big-endian fields. Apple's
    // Xcode-optimised PNGs put a CgBI chunk in front of it, which image-size also
    // reads through.
    const at = b.toString("latin1", 12, 16) === "CgBI" ? 32 : 16;
    if (b.length < at + 8) return null;
    return { width: b.readUInt32BE(at), height: b.readUInt32BE(at + 4) };
  }
  if (b.length >= 10 && /^GIF8[79]a$/.test(b.toString("latin1", 0, 6))) {
    // GIF (GIF89a specification, §18 Logical Screen Descriptor): 2-byte
    // little-endian width and height right after the 6-byte signature.
    return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  }
  if (b.length >= 26 && b.toString("latin1", 0, 2) === "BM") {
    // BMP (BITMAPINFOHEADER): signed 32-bit width/height at 18/22; a negative height
    // marks a top-down bitmap. Read as image-size reads it.
    return { width: b.readUInt32LE(18), height: Math.abs(b.readInt32LE(22)) };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    // JPEG (ITU-T T.81, Annex B): walk the marker segments to the first
    // start-of-frame (SOF0-SOF15 except DHT C4, JPG C8 and DAC CC), whose header
    // holds the 2-byte big-endian height then width after the sample precision.
    let at = 2;
    while (at + 9 <= b.length) {
      if (b[at] !== 0xff) return null;
      const marker = b[at + 1];
      if (marker === 0xff) {
        at += 1; // fill byte
        continue;
      }
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return { width: b.readUInt16BE(at + 7), height: b.readUInt16BE(at + 5) };
      }
      at += 2 + b.readUInt16BE(at + 2);
    }
    return null;
  }
  if (
    b.length >= 16 &&
    b.toString("latin1", 0, 4) === "RIFF" &&
    b.toString("latin1", 8, 12) === "WEBP"
  ) {
    // WebP (RFC 9649): the first chunk decides the layout.
    const chunk = b.toString("latin1", 12, 16);
    if (chunk === "VP8X" && b.length >= 30) {
      // §2.7 extended format: 24-bit little-endian canvas width/height minus one.
      return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    }
    if (chunk === "VP8L" && b.length >= 25 && b[20] === 0x2f) {
      // §3.2 lossless bitstream: 14-bit width-1 and height-1 after the 0x2f signature.
      const bits = b.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
    }
    if (chunk === "VP8 " && b.length >= 30 && b.readUIntBE(23, 3) === 0x9d012a) {
      // Lossy (RFC 6386 §9.1): 14-bit dimensions after the 0x9d012a start code.
      return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    }
  }
  return null;
}

const expoProjects = new Map();

/**
 * Whether Expo's bundler serves the project: `expo` resolves from it, the rule the
 * Metro profile uses to load Expo's config (metro-profile-compiler.mjs). Expo's
 * transform worker adds `fileHashes`, the md5 of each scale variant in `files` order,
 * to every asset it registers (@expo/metro-config
 * build/transform-worker/getAssets.js ensureOtaAssetHashesAsync), and expo-asset's
 * source transformer resolves an asset through Expo only when they are present
 * (expo-asset build/Asset.fx.js).
 */
function expoBundlesAssets(projectRoot) {
  let expo = expoProjects.get(projectRoot);
  if (expo === undefined) {
    try {
      createRequire(path.join(projectRoot, "package.json")).resolve("expo/package.json");
      expo = true;
    } catch {
      expo = false;
    }
    expoProjects.set(projectRoot, expo);
  }
  return expo;
}

const md5 = (buffer) => crypto.createHash("md5").update(buffer).digest("hex");

/**
 * The descriptor Metro registers for `file`: metro/src/Assets.js `getAssetData`,
 * minus the keys metro/src/Bundler/util.js `generateAssetCodeFileAst` strips
 * (`files`, `fileSystemLocation`, `path`) before the object is written into the
 * module. That function serialises the descriptor with JSON.stringify, so an
 * `undefined` width/height — every non-image, such as a font — is absent rather than
 * present-and-undefined; the round trip at the end reproduces exactly that.
 *
 * Returns null when the file is not an asset Metro could register (no extension).
 */
export function metroAssetDescriptor(file, { projectRoot, platform }) {
  const record = assetRecord(file, platform);
  if (record === null || record.requested === null) return null;
  const { requested, scales, files } = record;

  // getAssetData: the URL directory is the asset's directory relative to the
  // project root, under publicPath; a path escaping the root keeps its `..`.
  const expo = expoBundlesAssets(projectRoot);
  const publicPath = expo ? EXPO_PUBLIC_PATH : PUBLIC_PATH;
  const localDir = path.dirname(path.relative(projectRoot, file));
  let urlPath = (
    localDir.startsWith("..")
      ? `${publicPath.replace(/\/$/, "")}/${localDir}`
      : path.join(publicPath, localDir)
  ).replace(/\\/g, "/");
  if (expo) {
    const query = /\?unstable_path=(.*)/.exec(urlPath);
    if (query?.[1]) urlPath = urlPath.replace(query[1], encodeURIComponent(query[1]));
  }

  // getAbsoluteAssetInfo: one md5 over every scale variant, in scale order.
  const hasher = crypto.createHash("md5");
  const contents = files.map((variant) => fs.readFileSync(variant));
  for (const content of contents) hasher.update(content);

  // getAssetData measures the SMALLEST variant and divides by its scale, so width
  // and height are in points whichever variant the app required.
  let dimensions = null;
  if (IMAGE_TYPES.has(path.extname(file).slice(1))) {
    try {
      dimensions = imageDimensions(contents[0]);
    } catch {
      dimensions = null;
    }
  }
  const scale = scales[0];
  return JSON.parse(
    JSON.stringify({
      __packager_asset: true,
      httpServerLocation: urlPath,
      width: dimensions ? dimensions.width / scale : undefined,
      height: dimensions ? dimensions.height / scale : undefined,
      scales,
      hash: hasher.digest("hex"),
      name: requested.name,
      type: requested.type,
      fileHashes: expo ? contents.map(md5) : undefined,
    }),
  );
}

const registryPaths = new Map();

/**
 * Absolute path of the module Metro's `transformer.assetRegistryPath` names for the
 * installed React Native — the registry `Image.resolveAssetSource` reads:
 *   - 0.87+: `react-native/asset-registry` (src/asset-registry.js, documented there as
 *     the entry for assetRegistryPath; resolveAssetSource reads the same
 *     src/private/assets/AssetRegistry module);
 *   - earlier: `react-native/Libraries/Image/AssetRegistry`, the
 *     @react-native/metro-config default, re-exporting the
 *     @react-native/assets-registry/registry module resolveAssetSource requires.
 * Resolved from the project, once. Null when React Native is not installed.
 */
export function assetRegistryPathFor(projectRoot) {
  if (registryPaths.has(projectRoot)) return registryPaths.get(projectRoot);
  const require = createRequire(path.join(projectRoot, "package.json"));
  let resolved = null;
  for (const request of [
    "react-native/asset-registry",
    "react-native/Libraries/Image/AssetRegistry",
  ]) {
    try {
      resolved = require.resolve(request);
      break;
    } catch {
      // Not this React Native's layout; try the next.
    }
  }
  registryPaths.set(projectRoot, resolved);
  return resolved;
}

const descriptorMemo = new Map();

function stampOf(file) {
  try {
    const dir = fs.statSync(path.dirname(file));
    const own = fs.statSync(file);
    return `${dir.mtimeMs}:${own.mtimeMs}:${own.size}`;
  } catch {
    return null;
  }
}

/** metroAssetDescriptor, memoised per file until the file or its directory changes. */
function cachedDescriptor(file, options) {
  const key = `${options.platform}\0${options.projectRoot}\0${file}`;
  const stamp = stampOf(file);
  const hit = descriptorMemo.get(key);
  if (hit && stamp !== null && hit.stamp === stamp) return hit.descriptor;
  const descriptor = metroAssetDescriptor(file, options);
  descriptorMemo.set(key, { stamp, descriptor });
  return descriptor;
}

// One id per asset file per registry instance — Metro bundles one module per asset
// path, so every `require` of it returns the same number. Here the same file can be
// reached as a Vite-graph import, a Node require and a Node import (three modules),
// and the registry is recreated with React Native for each test file, so ids are
// remembered per registry object: a new registry starts the numbering again.
//
// The id is keyed by the file's path, spelled one way: on Windows the Vite graph
// names it `D:/a/x.png` and Node's loaders `D:\a\x.png`, which would register the
// asset twice under two ids.
export const assetIdKey = (file) =>
  file.replace(/\\/g, "/").replace(/^[a-z]:/, (drive) => drive.toUpperCase());

const REGISTER = (registry, file, descriptor) =>
  `(() => { const r = ${registry}; ` +
  `const m = (globalThis[Symbol.for("vitest-native.asset-ids")] ??= new WeakMap()); ` +
  `let ids = m.get(r); if (!ids) m.set(r, (ids = new Map())); ` +
  `let id = ids.get(${JSON.stringify(assetIdKey(file))}); ` +
  `if (id === undefined) ids.set(${JSON.stringify(assetIdKey(file))}, (id = r.registerAsset(${JSON.stringify(descriptor)}))); ` +
  `return id; })()`;

/** The descriptor, or the error Metro would also stop on (`invalid asset file path`). */
function requireDescriptor(file, options) {
  const descriptor = cachedDescriptor(file, options);
  if (descriptor === null) {
    throw new VitestNativeError(
      "TRANSFORM_FAILED",
      `cannot load asset '${file}': the file name has no name before its extension, ` +
        "so Metro could not register it either.",
    );
  }
  return descriptor;
}

/**
 * Source of a Metro-shaped asset module whose registry is React Native's own.
 *   format "cjs": a CommonJS body (Node require hook, precompiled registry);
 *   format "esm": an ES module (Node ESM loader, Vite graph under the native engine).
 * The registry is required by absolute path through Node's CommonJS loader, which is
 * where React Native itself lives under the native engine — so the id lands in the
 * same registry instance resolveAssetSource reads.
 */
export function nativeAssetModuleSource(file, { projectRoot, platform, format }) {
  const registry = assetRegistryPathFor(projectRoot);
  if (registry === null) {
    throw new VitestNativeError(
      "UNSUPPORTED_PEER",
      `cannot load asset '${file}': React Native's asset registry ` +
        `(react-native/asset-registry or react-native/Libraries/Image/AssetRegistry) ` +
        `does not resolve from ${projectRoot}.`,
    );
  }
  const descriptor = requireDescriptor(file, { projectRoot, platform });
  const target = JSON.stringify(registry);
  return format === "esm"
    ? `import { createRequire as __vn_createRequire } from "node:module";\n` +
        `export default ${REGISTER(`__vn_createRequire(${target})(${target})`, file, descriptor)};\n`
    : `module.exports = ${REGISTER(`require(${target})`, file, descriptor)};\n`;
}

/**
 * Source of a Metro-shaped asset module under the mock engine, whose React Native
 * (and so whose asset registry) is the runtime mock the setup file installs.
 */
export function mockAssetModuleSource(file, { projectRoot, platform }) {
  const descriptor = requireDescriptor(file, { projectRoot, platform });
  return `export default ${REGISTER("globalThis.__vitest_native_mock.AssetRegistry", file, descriptor)};\n`;
}
