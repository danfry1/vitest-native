export interface MetroAssetDescriptor {
  readonly __packager_asset: true;
  readonly httpServerLocation: string;
  readonly width?: number;
  readonly height?: number;
  readonly scales: number[];
  readonly hash: string;
  readonly name: string;
  readonly type: string;
}

export interface AssetModuleOptions {
  readonly projectRoot: string;
  readonly platform: string;
}

export function imageDimensions(buffer: Buffer): { width: number; height: number } | null;
export function metroAssetDescriptor(
  file: string,
  options: AssetModuleOptions,
): MetroAssetDescriptor | null;
export function assetRegistryPathFor(projectRoot: string): string | null;
export function nativeAssetModuleSource(
  file: string,
  options: AssetModuleOptions & { readonly format: "cjs" | "esm" },
): string;
export function mockAssetModuleSource(file: string, options: AssetModuleOptions): string;
