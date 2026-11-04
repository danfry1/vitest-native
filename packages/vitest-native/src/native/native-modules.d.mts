export declare const REACT_NATIVE_SOURCE_DIRS: readonly string[];
export declare const BOUNDARY_NATIVE_MODULES: readonly string[];
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
export declare function runtimeModule(
  name: string,
  core?: boolean,
): { present: boolean; members?: string[] } | undefined;
export declare function modulePresent(
  name: string,
  layers?: { mocked?: boolean; core?: boolean; seeded?: boolean; scanned?: boolean },
): boolean;
export declare const EXPO_RUNTIMES: readonly ["expo-go", "development-build"];
export declare const DEV_LAUNCHER_PACKAGE: "expo-dev-launcher";
export declare const DEV_CLIENT_PACKAGE: "expo-dev-client";
export interface ExpoRuntimeFacts {
  modules: Record<string, { present: boolean; members?: string[] }>;
  constants: Record<string, Record<string, unknown>>;
}
export declare function expoRuntimeFacts(
  runtime: string | undefined,
  installed: { devLauncher: boolean },
): ExpoRuntimeFacts;
export declare function devLauncherInstalled(projectRoot: string): boolean;
export declare const DEV_LAUNCHER_MODULE: "EXDevLauncher";
export declare const EXPO_GO_ABSENT_MODULES: readonly string[];
