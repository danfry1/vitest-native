// Projects laid out with copies of React in different places, for the tests of which copy
// a test uses (src/preset-react.mjs). Each package exports `{ copy }`, naming where it sits.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface NestedReactLayout {
  /** react-native installed (default true). */
  rn?: boolean;
  /** react-native nests its own React (`copy: "rn"`). */
  rnReact?: boolean;
  /** React Native Testing Library nests its own React (`copy: "rntl"`). */
  rntlReact?: boolean;
}

function pkg(dir: string, name: string, copy?: string) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, main: "index.js" }));
  fs.writeFileSync(
    path.join(dir, "index.js"),
    `module.exports = ${JSON.stringify(copy ? { copy } : {})};`,
  );
}

/**
 * A project root with React at its top (`copy: "project"`) and `shadowed-lib`, a package
 * that nests its own React (`copy: "nested"`), plus what `layout` asks for. `dispose`
 * removes every root it made.
 */
export function nestedReactProjects() {
  const roots: string[] = [];
  return {
    project(layout: NestedReactLayout = {}): string {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-nested-react-"));
      roots.push(root);
      const modules = path.join(root, "node_modules");
      fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app" }));
      pkg(path.join(modules, "react"), "react", "project");
      if (layout.rn !== false) pkg(path.join(modules, "react-native"), "react-native");
      if (layout.rnReact) {
        pkg(path.join(modules, "react-native/node_modules/react"), "react", "rn");
      }
      pkg(path.join(modules, "shadowed-lib"), "shadowed-lib");
      pkg(path.join(modules, "shadowed-lib/node_modules/react"), "react", "nested");
      if (layout.rntlReact) {
        const rntl = path.join(modules, "@testing-library/react-native");
        pkg(rntl, "@testing-library/react-native");
        pkg(path.join(rntl, "node_modules/react"), "react", "rntl");
      }
      return root;
    },
    dispose() {
      for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
