export type MatcherSnapshot = {
  objects: { target: object; baseline: Map<PropertyKey, PropertyDescriptor | undefined> }[];
  testers: { list: unknown[]; baseline: unknown[] } | null;
};
export declare function captureMatchers(expect: (value: unknown) => unknown): MatcherSnapshot;
export declare function restoreMatchers(snapshot: MatcherSnapshot): void;
export declare function matcherDifference(snapshot: MatcherSnapshot): string | null;
