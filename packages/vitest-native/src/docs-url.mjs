// The documentation site's address. Every link vitest-native prints, and the site's own
// config, read it from here, so the site can move by changing one line; the old address
// keeps redirecting, because released versions print it.
export const SITE_URL = "https://vitest-native.danfry.dev";

/** An absolute link to a page of the site, from its path: `docsUrl("/guide/errors#INVALID_OPTION")`. */
export function docsUrl(path) {
  return `${SITE_URL}${path}`;
}
