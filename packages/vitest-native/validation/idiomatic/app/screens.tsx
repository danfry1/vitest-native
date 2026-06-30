import * as React from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { fetchItems, type Item } from "./api.js";
import { useNav } from "./Navigator.js";
import { useAuth, useTheme } from "./providers.js";

export function LoginScreen() {
  const { login } = useAuth();
  const { navigate } = useNav();
  const [name, setName] = React.useState("");
  return (
    <View>
      <Text testID="screen">Login</Text>
      <TextInput testID="name" value={name} onChangeText={setName} placeholder="Name" />
      <Pressable
        accessibilityRole="button"
        disabled={!name}
        onPress={() => {
          login(name);
          navigate("List");
        }}
      >
        <Text>Continue</Text>
      </Pressable>
    </View>
  );
}

export function ListScreen({ fail = false }: { fail?: boolean }) {
  const { navigate } = useNav();
  const { user } = useAuth();
  const [state, setState] = React.useState<{ status: "loading" | "ok" | "error"; items: Item[] }>({
    status: "loading",
    items: [],
  });
  React.useEffect(() => {
    let active = true;
    fetchItems({ fail })
      .then((items) => active && setState({ status: "ok", items }))
      .catch(() => active && setState({ status: "error", items: [] }));
    return () => {
      active = false;
    };
  }, [fail]);

  if (state.status === "loading") return <ActivityIndicator testID="loading" />;
  if (state.status === "error") return <Text testID="error">Failed to load</Text>;
  return (
    <View>
      <Text testID="screen">Welcome {user}</Text>
      <FlatList
        data={state.items}
        keyExtractor={(i) => String(i.id)}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => navigate("Detail", { name: item.name })}>
            <Text>{item.name}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

export function DetailScreen() {
  const { route, goBack } = useNav();
  const { theme } = useTheme();
  return (
    <View>
      <Text testID="screen">Detail: {String(route.params?.name)}</Text>
      <Text testID="theme">{theme}</Text>
      <Pressable accessibilityRole="button" onPress={goBack}>
        <Text>Back</Text>
      </Pressable>
    </View>
  );
}
