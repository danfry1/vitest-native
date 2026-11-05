// expo-linking's shape: an installed package that imports the configuration itself.
import { expoConfig } from "museum-constants";

export const createURL = (path) => `${expoConfig.scheme}://${path}`;
