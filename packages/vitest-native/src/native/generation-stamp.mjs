// The hot runtime's generation stamp, in both its spellings (loader.mjs): `x.js?vnhot=N`
// for a CommonJS module served to an import (behind a facade) or a file the hooks compile,
// and the sibling name `x.vnhot-N.js` for an ES module as published, the one spelling its
// import and its require share (docs: hot-default-0.16.md, "one spelling per generation";
// #722). Everything that reads a stamped URL (the loader's resolution cache, coverage, the
// ownership ledger) reads it through these, so neither spelling reaches a user.

export const SIBLING = /\.vnhot-(\d+)(\.[cm]?js)$/;
const QUERY = /[?&]vnhot=(\d+)/;
const withoutSearch = (url) => String(url).replace(/[?#].*$/, "");

/** Whether `url` carries a generation, in either spelling. */
export function isStamped(url) {
  return QUERY.test(String(url)) || SIBLING.test(withoutSearch(url));
}

/** The generation `url` is stamped with, in either spelling, or null. */
export function stampOf(url) {
  const sibling = SIBLING.exec(withoutSearch(url));
  if (sibling) return Number(sibling[1]);
  const query = QUERY.exec(String(url));
  return query ? Number(query[1]) : null;
}

/** `url` (or a path) without its generation, in either spelling. */
export function unstamped(url) {
  return String(url)
    .replace(/[?&]vnhot=\d+/, "")
    .replace(/\?(?=#|$)/, "")
    .replace(/\.vnhot-\d+(\.[cm]?js)(?=[?#]|$)/, "$1");
}

/**
 * What the loader puts before a sibling's source, on its first line (so line numbers
 * hold): import.meta naming the real file. Its length is what a frame on line 1 is off by.
 */
export function siblingPrologue(realUrl, file, dirname) {
  return (
    `import.meta.url = ${JSON.stringify(realUrl)}; ` +
    `import.meta.filename = ${JSON.stringify(file)}; ` +
    `import.meta.dirname = ${JSON.stringify(dirname)}; `
  );
}

/** `url`, an unstamped ES module's URL, as generation `gen`'s sibling name. */
export function siblingOf(url, gen) {
  return url.replace(/(\.[cm]?js)$/, `.vnhot-${gen}$1`);
}
