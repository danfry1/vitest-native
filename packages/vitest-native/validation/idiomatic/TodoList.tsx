import * as React from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";

type Todo = { id: number; label: string; done: boolean };

export function TodoList() {
  const [todos, setTodos] = React.useState<Todo[]>([
    { id: 1, label: "Write tests", done: false },
  ]);
  const [draft, setDraft] = React.useState("");
  const nextId = React.useRef(2);

  const add = () => {
    if (!draft.trim()) return;
    setTodos((t) => [...t, { id: nextId.current++, label: draft, done: false }]);
    setDraft("");
  };
  const toggle = (id: number) =>
    setTodos((t) => t.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo)));

  return (
    <View>
      <TextInput testID="draft" placeholder="New todo" value={draft} onChangeText={setDraft} />
      <Pressable accessibilityRole="button" onPress={add}>
        <Text>Add</Text>
      </Pressable>
      <FlatList
        data={todos}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => toggle(item.id)}>
            <Text testID={`todo-${item.id}`}>{item.done ? `✓ ${item.label}` : item.label}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
