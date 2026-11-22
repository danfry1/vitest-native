/** The distinct spellings of `root`: as resolved, its JS real path, its native real path. */
export declare function rootSpellings(root: string): string[];
/** The spelling of `root` that `file` is under (or is), or null when it is outside it. */
export declare function rootSpellingOf(root: string, file: string): string | null;
/** `file` relative to `root`, in whichever spelling of the root it is under. */
export declare function relativeToRoot(root: string, file: string): string;
/** Whether `file` is `dir` or under it, as strings (without case on Windows); no file-system call. */
export declare function under(file: string, dir: string): boolean;
