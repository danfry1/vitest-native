import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  ScrollView,
  Pressable,
  Switch,
  ActivityIndicator,
  Modal,
  StyleSheet,
  Platform,
  Alert,
  Keyboard,
  Linking,
  Share,
  StatusBar,
  SafeAreaView,
  KeyboardAvoidingView,
  useColorScheme,
  useWindowDimensions,
  Appearance,
} from 'react-native';

interface ProfileScreenProps {
  userId: string;
  onSave?: (name: string) => void;
  onShare?: () => void;
}

export function ProfileScreen({ userId, onSave, onShare }: ProfileScreenProps) {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [notifications, setNotifications] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const colorScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    // Simulate async data fetch
    const timer = setTimeout(() => {
      setName('John Doe');
      setBio('React Native developer');
      setLoading(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [userId]);

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }
    Keyboard.dismiss();
    onSave?.(name);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${name}'s profile!`,
        title: 'Share Profile',
      });
      onShare?.();
    } catch {
      Alert.alert('Error', 'Failed to share');
    }
  };

  const handleOpenWebsite = async () => {
    const url = 'https://example.com';
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => setShowModal(true) },
      ],
    );
  };

  if (loading) {
    return (
      <View testID="loading">
        <ActivityIndicator size="large" />
        <Text>Loading profile...</Text>
      </View>
    );
  }

  const isTablet = width >= 768;

  return (
    <SafeAreaView style={[styles.container, isDark && styles.darkContainer]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: 'height' })}
        style={styles.flex}
      >
        <ScrollView testID="profile-scroll">
          <Image
            testID="avatar"
            source={{ uri: `https://example.com/avatar/${userId}` }}
            style={[styles.avatar, isTablet && styles.tabletAvatar]}
          />

          <Text testID="platform-badge" style={styles.badge}>
            {Platform.OS === 'ios' ? 'iOS' : 'Android'} v{Platform.Version}
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              testID="name-input"
              value={name}
              onChangeText={setName}
              style={styles.input}
              placeholder="Enter your name"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Bio</Text>
            <TextInput
              testID="bio-input"
              value={bio}
              onChangeText={setBio}
              multiline
              style={[styles.input, styles.bioInput]}
            />
          </View>

          <View style={styles.row}>
            <Text>Push Notifications</Text>
            <Switch
              testID="notifications-switch"
              value={notifications}
              onValueChange={setNotifications}
            />
          </View>

          <Pressable testID="save-button" onPress={handleSave} style={styles.button}>
            <Text style={styles.buttonText}>Save Profile</Text>
          </Pressable>

          <Pressable testID="share-button" onPress={handleShare} style={styles.button}>
            <Text style={styles.buttonText}>Share Profile</Text>
          </Pressable>

          <Pressable testID="website-button" onPress={handleOpenWebsite} style={styles.button}>
            <Text style={styles.buttonText}>Visit Website</Text>
          </Pressable>

          <Pressable testID="delete-button" onPress={handleDeleteAccount} style={styles.dangerButton}>
            <Text style={styles.dangerText}>Delete Account</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal testID="delete-modal" visible={showModal} animationType="slide">
        <View style={styles.modal}>
          <Text>Account deletion in progress...</Text>
          <Pressable testID="close-modal" onPress={() => setShowModal(false)}>
            <Text>Close</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  darkContainer: { backgroundColor: '#1a1a1a' },
  flex: { flex: 1 },
  avatar: { width: 100, height: 100, borderRadius: 50, alignSelf: 'center', marginTop: 20 },
  tabletAvatar: { width: 150, height: 150, borderRadius: 75 },
  badge: { textAlign: 'center', marginTop: 8, color: '#666', fontSize: 12 },
  field: { marginHorizontal: 16, marginTop: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
  bioInput: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginTop: 16 },
  button: { backgroundColor: '#007AFF', padding: 16, borderRadius: 8, marginHorizontal: 16, marginTop: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  dangerButton: { padding: 16, marginHorizontal: 16, marginTop: 24, alignItems: 'center' },
  dangerText: { color: '#FF3B30', fontSize: 16 },
  modal: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
