// Short-lived Metro configuration evaluator. Only JSON crosses fd 3.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { VitestNativeError } from "../errors.mjs";

const BARE_SOURCE_EXTS = ["js", "jsx", "json", "ts", "tsx"];
const BARE_ASSET_EXTS = [
  "bmp",
  "gif",
  "jpg",
  "jpeg",
  "png",
  "psd",
  "svg",
  "webp",
  "xml",
  "m4v",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "webm",
  "aac",
  "aiff",
  "caf",
  "m4a",
  "mp3",
  "wav",
  "html",
  "pdf",
  "yaml",
  "yml",
  "otf",
  "ttf",
  "zip",
];

function messageOf(error) {
  return error instanceof Error ? error.stack || error.message : String(error);
}

function respond(value) {
  fs.writeSync(3, JSON.stringify(value));
}

function canResolve(req, id) {
  try {
    req.resolve(id);
    return true;
  } catch {
    return false;
  }
}

function findConfig(projectRoot, explicit) {
  if (explicit) return path.resolve(projectRoot, explicit);
  for (const relative of [
    "metro.config.js",
    "metro.config.cjs",
    "metro.config.mjs",
    "metro.config.json",
    "metro.config.ts",
    "metro.config.cts",
    "metro.config.mts",
    ".config/metro.js",
    ".config/metro.cjs",
    ".config/metro.mjs",
    ".config/metro.json",
    ".config/metro.ts",
    ".config/metro.cts",
    ".config/metro.mts",
  ]) {
    const candidate = path.join(projectRoot, relative);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  const packageFile = path.join(projectRoot, "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(packageFile, "utf8"));
    if (pkg.metro && typeof pkg.metro === "object" && !Array.isArray(pkg.metro)) {
      return packageFile;
    }
  } catch {}
  return null;
}

async function importConfig(configPath, req) {
  if (!configPath) return null;
  if (path.basename(configPath) === "package.json") {
    return JSON.parse(fs.readFileSync(configPath, "utf8")).metro;
  }
  let loaded;
  try {
    loaded = req(configPath);
  } catch (requireError) {
    // Retrying ordinary evaluation failures can execute side effects twice.
    // Only a loader-format refusal warrants switching to dynamic import.
    if (!["ERR_REQUIRE_ESM", "ERR_REQUIRE_ASYNC_MODULE"].includes(requireError.code)) {
      throw requireError;
    }
    loaded = await import(pathToFileURL(configPath).href);
  }
  loaded = await loaded;
  return loaded?.__esModule ? loaded.default : (loaded?.default ?? loaded);
}

function fallbackDefault(projectRoot) {
  return {
    projectRoot,
    resolver: {
      sourceExts: [...BARE_SOURCE_EXTS],
      assetExts: [...BARE_ASSET_EXTS],
      resolverMainFields: ["react-native", "browser", "main"],
      unstable_conditionNames: ["react-native"],
      unstable_conditionsByPlatform: {},
      resolveRequest: null,
    },
  };
}

function mergeFallback(base, next) {
  return {
    ...base,
    ...next,
    resolver: { ...base.resolver, ...next?.resolver },
  };
}

async function loadFallback(projectRoot, configPath, req) {
  const defaults = fallbackDefault(projectRoot);
  const raw = await importConfig(configPath, req);
  const resolved = typeof raw === "function" ? await raw(defaults) : raw;
  return resolved ? mergeFallback(defaults, resolved) : defaults;
}

async function loadReactNative(projectRoot, configPath, req) {
  if (!canResolve(req, "@react-native/metro-config")) {
    return { config: await loadFallback(projectRoot, configPath, req), framework: "fallback" };
  }
  const rnMetroPath = req.resolve("@react-native/metro-config");
  const rnMetro = req(rnMetroPath);
  const defaults = await rnMetro.getDefaultConfig(projectRoot);
  if (!configPath) return { config: defaults, framework: "react-native" };

  // Resolve/load through the exact metro-config paired with the project's RN
  // configuration package. This preserves its JS/TS/ESM support and avoids a
  // hidden dependency from vitest-native to a possibly incompatible Metro.
  const metroReq = createRequire(rnMetroPath);
  const metro = metroReq("metro-config");
  const rawResult = await metro.resolveConfig(configPath, projectRoot);
  const raw = rawResult.config;
  const resolved = typeof raw === "function" ? await raw(defaults) : raw;
  return {
    config: resolved ? await metro.mergeConfig(defaults, resolved) : defaults,
    framework: "react-native",
  };
}

async function loadProject(input) {
  const projectRoot = path.resolve(input.projectRoot);
  // Configs commonly resolve relative paths from cwd. Each child belongs to one
  // project, so workspace config evaluation cannot inherit another project's cwd.
  process.chdir(projectRoot);
  const req = createRequire(path.join(projectRoot, "package.json"));
  const configPath = findConfig(projectRoot, input.configFile);
  let loaded;
  if (canResolve(req, "expo/package.json")) {
    const expoMetro = req("expo/metro-config");
    if (typeof expoMetro.loadUserConfig === "function") {
      loaded = {
        config: await expoMetro.loadUserConfig({
          projectRoot,
          serverRoot: projectRoot,
          overrideConfigPath: configPath ?? undefined,
        }),
        framework: "expo",
      };
    } else {
      // Older Expo releases expose getDefaultConfig but not loadUserConfig.
      // Evaluate the local override against Expo's own default and merge the
      // declarative resolver portion; the child still dies after extraction.
      const defaults = await expoMetro.getDefaultConfig(projectRoot);
      const raw = await importConfig(configPath, req);
      const resolved = typeof raw === "function" ? await raw(defaults) : raw;
      loaded = {
        config: resolved ? mergeFallback(defaults, resolved) : defaults,
        framework: "expo",
      };
    }
  } else {
    loaded = await loadReactNative(projectRoot, configPath, req);
  }

  const resolver = loaded.config?.resolver;
  if (!resolver || !Array.isArray(resolver.sourceExts) || !Array.isArray(resolver.assetExts)) {
    throw new VitestNativeError(
      "METRO_PROFILE_INVALID",
      "resolved Metro config has no resolver.sourceExts/assetExts arrays",
    );
  }
  const byPlatform = resolver.unstable_conditionsByPlatform?.[input.platform] ?? [];
  return {
    schemaVersion: 1,
    framework: loaded.framework,
    configPath,
    sourceExts: resolver.sourceExts,
    assetExts: resolver.assetExts,
    resolverMainFields: resolver.resolverMainFields ?? ["react-native", "browser", "main"],
    conditionNames: [...new Set([...(resolver.unstable_conditionNames ?? []), ...byPlatform])],
    customResolver: typeof resolver.resolveRequest === "function",
  };
}

try {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  const started = performance.now();
  const profile = await loadProject(input);
  respond({
    ok: true,
    profile,
    durationMs: Math.round(performance.now() - started),
    heapUsed: process.memoryUsage().heapUsed,
    rss: process.memoryUsage().rss,
  });
} catch (error) {
  respond({ ok: false, error: messageOf(error) });
  process.exitCode = 1;
}
