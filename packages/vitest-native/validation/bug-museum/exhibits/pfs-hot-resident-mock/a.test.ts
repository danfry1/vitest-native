// A unit test that replaces react-native with the one thing its code reads, and uses an
// RNTL helper (Rocket.Chat's MediaSessionInstance.test.ts). If RNTL first loads here, its
// own require of react-native is answered while this file's mock is in place.
import { waitFor } from "@testing-library/react-native";

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

test("the file's own code sees the partial mock", async () => {
  await waitFor(() => expect(require("react-native").Platform.OS).toBe("android"));
});
