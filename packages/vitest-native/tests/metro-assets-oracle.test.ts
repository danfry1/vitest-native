/**
 * Differential oracle: the asset descriptor native/assets.mjs registers is checked
 * against what REAL Metro registers for the same file — metro/src/Assets.js
 * `getAssetData` (the transformer's input) passed through
 * metro/src/Bundler/util.js `generateAssetCodeFileAst` (the module it writes),
 * with that module's code executed against a stand-in registry.
 *
 * Literals in the native suite pin a handful of shapes; this file is what keeps
 * them honest. A descriptor written from a belief about Metro — the scale a width
 * is divided by, which keys the module drops, how a platform variant groups — can
 * only be contradicted by Metro itself.
 *
 * The image formats below are header-only files: Metro measures them with the
 * `image-size` package and this package reads the same header fields itself, so
 * they double as an oracle for the dimension reader.
 */
import { afterAll, describe, it, expect } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { assetIdKey, imageDimensions, metroAssetDescriptor } from "../src/native/assets.mjs";

const req = createRequire(import.meta.url);
const metroRequire = createRequire(req.resolve("metro/package.json"));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { getAssetData }: any = req("metro/private/Assets");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { generateAssetCodeFileAst }: any = req("metro/private/Bundler/util");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generate: any = metroRequire("@babel/generator").default;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(HERE, "../tests-native/fixtures/assets");
const projectRoot = path.resolve(HERE, "..");

/** The object Metro's generated asset module passes to registerAsset. */
async function metroRegistered(
  file: string,
  platform: string | null,
  root = projectRoot,
  publicPath = "/assets",
) {
  const data = await getAssetData(file, path.relative(root, file), [], platform, publicPath);
  const { code } = generate(generateAssetCodeFileAst("asset-registry", data));
  let registered: unknown;
  const module = { exports: undefined as unknown };
  new Function("module", "require", code)(module, () => ({
    registerAsset: (asset: unknown) => {
      registered = asset;
      return 1;
    },
  }));
  return registered;
}

const ours = (file: string, platform: string | null, root = projectRoot) =>
  metroAssetDescriptor(file, { projectRoot: root, platform: platform as string });

describe("asset descriptors match Metro's", () => {
  const cases: [string, string | null][] = [
    ["logo.png", "ios"],
    ["logo@2x.png", "ios"],
    ["logo@3x.png", "android"],
    ["badge@2x.png", "ios"],
    ["badge@3x.png", null],
    ["splash.png", "ios"],
    ["splash.png", "android"],
    ["splash.png", null],
    ["splash.ios.png", "ios"],
    ["splash.android.png", "ios"],
    ["Glyphs.ttf", "ios"],
  ];
  for (const [name, platform] of cases) {
    it(`${name} (platform ${platform})`, async () => {
      const file = path.join(FIXTURES, name);
      expect(ours(file, platform)).toEqual(await metroRegistered(file, platform));
    });
  }

  it("an asset outside the project root keeps Metro's `..` server location", async () => {
    const root = path.join(projectRoot, "src");
    const file = path.join(FIXTURES, "logo.png");
    const expected = await metroRegistered(file, "ios", root);
    expect(ours(file, "ios", root)).toEqual(expected);
    expect(expected).toMatchObject({
      httpServerLocation: "/assets/../tests-native/fixtures/assets",
    });
  });
});

describe("image dimensions match Metro's (image-size) for each format", () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-asset-oracle-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const u24le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
  const u32le = (n: number) => [...u16le(n & 0xffff), ...u16le(n >>> 16)];
  const riff = (chunk: string, body: number[]) =>
    Buffer.from([
      ...Buffer.from("RIFF"),
      ...u32le(4 + 8 + body.length),
      ...Buffer.from("WEBP"),
      ...Buffer.from(chunk),
      ...u32le(body.length),
      ...body,
    ]);
  const png = (() => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(41, 0);
    ihdr.writeUInt32BE(43, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]);
    };
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(Buffer.alloc(43 * (1 + 41 * 3)))),
    ]);
  })();

  const files: [string, Buffer, { width: number; height: number }][] = [
    ["image.png", png, { width: 41, height: 43 }],
    [
      // SOI, an APP0 segment to skip, then SOF0: precision, height 5, width 7.
      "photo.jpg",
      Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
        0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x05, 0x00, 0x07, 0x03,
        0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
      ]),
      { width: 7, height: 5 },
    ],
    [
      "anim.gif",
      Buffer.from([...Buffer.from("GIF89a"), ...u16le(11), ...u16le(13), 0, 0, 0, 0x3b]),
      { width: 11, height: 13 },
    ],
    [
      // A top-down bitmap: negative height.
      "bitmap.bmp",
      Buffer.from([
        ...Buffer.from("BM"),
        ...Array.from({ length: 16 }, () => 0),
        ...u32le(17),
        ...u32le(-19 >>> 0),
        ...Array.from({ length: 28 }, () => 0),
      ]),
      { width: 17, height: 19 },
    ],
    [
      "extended.webp",
      riff("VP8X", [0, 0, 0, 0, ...u24le(23 - 1), ...u24le(29 - 1)]),
      { width: 23, height: 29 },
    ],
    [
      "lossless.webp",
      riff("VP8L", [0x2f, ...u32le((31 - 1) | ((37 - 1) << 14)), 0, 0]),
      { width: 31, height: 37 },
    ],
    [
      "lossy.webp",
      riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(47), ...u16le(53), 0, 0]),
      { width: 47, height: 53 },
    ],
  ];

  for (const [name, bytes, size] of files) {
    it(name, async () => {
      const file = path.join(dir, name);
      fs.writeFileSync(file, bytes);
      expect(imageDimensions(bytes)).toEqual(size);
      expect(ours(file, "ios", dir)).toEqual(await metroRegistered(file, "ios", dir));
    });
  }

  it("a file that is not the image its extension claims registers without dimensions", () => {
    // Metro would throw from image-size here; a test suite with placeholder image
    // fixtures would then fail to import them, so this package registers the asset
    // without width and height instead — the one deliberate divergence.
    const file = path.join(dir, "placeholder.png");
    fs.writeFileSync(file, "not a png");
    const descriptor = ours(file, "ios", dir);
    expect(descriptor).toMatchObject({ name: "placeholder", type: "png", scales: [1] });
    expect(descriptor).not.toHaveProperty("width");
  });
});

// Expo's transform worker registers Metro's descriptor, computed under Expo CLI's dev
// publicPath, plus `fileHashes`, the md5 of each scale variant in `files` order, with
// the path in httpServerLocation URL-encoded (@expo/metro-config
// build/transform-worker/getAssets.js). consumer-tests/expo checks the result against
// that function itself; here, against Metro, for a project `expo` resolves from.
describe("assets in a project Expo bundles", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-expo-assets-"));
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "node_modules", "expo"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), "{}");
  fs.writeFileSync(path.join(root, "node_modules", "expo", "package.json"), '{"name":"expo"}');

  it("carry Metro's descriptor plus one md5 per scale variant", async () => {
    const file = path.join(FIXTURES, "logo.png");
    const md5 = (name: string) =>
      crypto
        .createHash("md5")
        .update(fs.readFileSync(path.join(FIXTURES, name)))
        .digest("hex");
    const metro = (await metroRegistered(file, "ios", root, "/assets/?unstable_path=.")) as {
      httpServerLocation: string;
    };
    const [location, value] = metro.httpServerLocation.split("?unstable_path=");
    expect(ours(file, "ios", root)).toEqual({
      ...metro,
      httpServerLocation: `${location}?unstable_path=${encodeURIComponent(value)}`,
      fileHashes: [md5("logo.png"), md5("logo@2x.png"), md5("logo@3x.png")],
    });
    expect(ours(file, "ios")).not.toHaveProperty("fileHashes");
  });
});

// One asset, one id: the Vite graph and Node's loaders spell a Windows path
// differently, and both must reach the same registry entry.
describe("asset id keys", () => {
  it("spell a path one way whichever loader reached the file", () => {
    expect(assetIdKey("D:\\a\\app\\logo.png")).toBe("D:/a/app/logo.png");
    expect(assetIdKey("d:/a/app/logo.png")).toBe("D:/a/app/logo.png");
    expect(assetIdKey("/app/logo.png")).toBe("/app/logo.png");
  });
});
