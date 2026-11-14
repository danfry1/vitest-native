import { createNavigationContainerRef, StackActions } from "@react-navigation/native";
import { expect, test } from "vitest";

// A navigation service, as apps keep one beside their NavigationContainer.
const navigationRef = createNavigationContainerRef();

function signOut() {
  navigationRef.resetRoot({ index: 0, routes: [{ name: "SignIn" }] });
}

function backToCart() {
  navigationRef.dispatch(StackActions.popTo("Cart"));
}

test("signing out resets the root and going back pops to the cart", () => {
  signOut();
  expect(navigationRef.resetRoot).toHaveBeenCalledWith({
    index: 0,
    routes: [{ name: "SignIn" }],
  });
  backToCart();
  expect(navigationRef.dispatch).toHaveBeenCalledWith({
    type: "POP_TO",
    payload: { name: "Cart", params: undefined, merge: undefined },
  });
});
