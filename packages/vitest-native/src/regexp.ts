/**
 * `text` as a RegExp source that matches exactly that text. Every value interpolated into
 * a RegExp goes through an escape helper (lint rule vitest-native/escaped-regexp): a
 * path, package name or identifier can hold `.`, `+`, `(` or `$`, which otherwise match
 * more, or less, than themselves.
 */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
