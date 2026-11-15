// An app setup file that imports React Native at its top level.
import { Platform } from "react-native";

(globalThis as { setupSawOS?: string }).setupSawOS = Platform.OS;
