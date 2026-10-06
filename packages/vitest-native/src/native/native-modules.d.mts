export declare const REACT_NATIVE_SOURCE_DIRS: readonly string[];
export declare const BOUNDARY_NATIVE_MODULES: readonly string[];
export declare const KNOWN_NATIVE_MODULES_ENV: string;
export declare function scanReactNativeModuleRequests(reactNativeRoot: string): {
  files: number;
  get: string[];
  getEnforcing: string[];
  nativeModules: string[];
  unnamed: number;
};
export declare function reactNativeRootFor(projectRoot: string): string | null;
export declare function knownNativeModulesFor(projectRoot: string): string[];
export declare function installKnownNativeModules(projectRoot: string): void;
