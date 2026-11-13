export declare const REACT_DEDUPE: readonly string[];
export declare function isDeduped(request: string): boolean;
export declare function anchoredFile(request: string, root: string): string | null;
export declare function installReactDedupe(projectRoot: string, dispatch?: unknown): void;
export declare function resetReactDedupe(): void;
