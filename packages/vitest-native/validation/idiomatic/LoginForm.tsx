import * as React from "react";
import { Pressable, Text, TextInput, View } from "react-native";

export function LoginForm({ onSubmit }: { onSubmit?: (email: string) => void }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const valid = email.includes("@") && password.length >= 6;
  return (
    <View>
      <TextInput
        testID="email"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        testID="password"
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {!valid && email.length > 0 ? <Text testID="error">Enter a valid email and a 6+ char password</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={!valid}
        onPress={() => onSubmit?.(email)}
      >
        <Text>Sign in</Text>
      </Pressable>
    </View>
  );
}
