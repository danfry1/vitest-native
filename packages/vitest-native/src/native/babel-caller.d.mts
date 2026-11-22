export declare function projectBabelCaller(options: {
  hasExpo: boolean;
  platform: string;
  esm: boolean;
}): {
  name: string;
  bundler?: string;
  platform?: string;
  supportsDynamicImport: boolean;
  supportsExportNamespaceFrom: boolean;
  supportsStaticESM: boolean;
  supportsTopLevelAwait: boolean;
};
