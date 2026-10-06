// Fixture for jest-compat-semantics.test.tsx: app code constructing the mocked class.
import { FeedApi } from "./feed";

export const loadFeed = () => new FeedApi().fetch();
