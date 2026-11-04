// The react-native field: JSX, which Node can load only compiled. This package does not
// depend on React Native, so the require hooks do not compile it.
const element = <div />;
export const entry = "react-native";
export default element;
