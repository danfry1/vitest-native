import { RECOMMENDED_FLOORS } from "../../src/peer-requirements.js";

/** The row a requirements table gives each peer, by package name. */
export const PEER_LABELS: Readonly<Record<string, string>> = {
  vitest: "Vitest",
  vite: "Vite",
  react: "React",
  "react-native": "React Native",
  "@testing-library/react-native": "React Native Testing Library",
};

/** Each recommended floor, with its table label and the URL path of its upstream issue. */
export function recommendedFloors() {
  return Object.entries(RECOMMENDED_FLOORS).map(([name, floor]) => {
    const label = PEER_LABELS[name];
    if (!label) throw new Error(`no requirements-table label for ${name}; add one to PEER_LABELS`);
    // `owner/repo#123` is github.com/owner/repo/issues/123.
    const issuePath = floor.issue.replace(/^([^#]+)#(\d+)$/, "$1/issues/$2");
    return { name, label, ...floor, issuePath };
  });
}

export const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
