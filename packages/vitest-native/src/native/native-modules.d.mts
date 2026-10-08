export declare const REACT_NATIVE_SOURCE_DIRS: readonly string[];
export declare const BOUNDARY_NATIVE_MODULES: readonly string[];
export declare const KNOWN_NATIVE_MODULES_ENV: string;
export declare const NATIVE_MODULE_SPECS_ENV: string;
export declare const PERMISSIVE_NATIVE_MODULES_ENV: string;
export declare function specMembers(source: string): Set<string>;
export declare function scanReactNativeModuleRequests(reactNativeRoot: string): {
  files: number;
  get: string[];
  getEnforcing: string[];
  nativeModules: string[];
  specs: Record<string, string[]>;
  unnamed: number;
};
export declare function reactNativeRootFor(projectRoot: string): string | null;
export declare function knownNativeModulesFor(projectRoot: string): string[];
export declare function nativeModuleSpecsFor(projectRoot: string): Record<string, string[]>;
export declare function installKnownNativeModules(projectRoot: string): void;
