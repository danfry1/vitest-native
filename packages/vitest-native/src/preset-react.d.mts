/**
 * Types for preset-react.mjs. Self-contained, since it ships beside the built files;
 * callers pass the result to a preset module's factory (PresetFactoryContext).
 */
export function presetFactoryContext(
  pkg: string,
  root: string,
  options?: { check?: boolean },
): { React: any };
export function rendererRequire(root: string): NodeJS.Require;
export function assertOneReact(root: string, user?: string): void;
