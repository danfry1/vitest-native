jest.mock("react-native-gesture-handler/src/RNGestureHandlerModule", () =>
  require("react-native-gesture-handler/src/mocks/module"),
);
jest.mock("react-native-gesture-handler/src/v3/components/Touchable/Touchable", () => ({
  Touchable: require("react-native").Pressable,
}));
jest.mock("react-native-gesture-handler/src/v3/components/GestureComponents", () => {
  const { FlatList, RefreshControl, ScrollView, Switch, TextInput } = require("react-native");
  return { FlatList, RefreshControl, ScrollView, Switch, TextInput };
});
