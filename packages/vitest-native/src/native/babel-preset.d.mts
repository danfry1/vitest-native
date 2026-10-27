/** The Babel preset the native engine compiles React Native and node_modules with. */
export interface TransformPreset {
  /** `@react-native/babel-preset`, or `babel-preset-expo` (through `expo/internal/babel-preset`). */
  name: string;
  /** What Babel is given as the preset: a package directory or a module file. */
  file: string;
  /** The preset package's version. */
  version: string;
  /** The preset package's directory, which its own plugins resolve from. */
  packageDir: string;
}

/** Resolved from the project; null when neither preset resolves. */
export declare function resolveTransformPreset(projectRoot: string): TransformPreset | null;
