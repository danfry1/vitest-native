import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Alert,
  Keyboard,
  Share,
  Linking,
  Platform,
  Appearance,
  StyleSheet,
} from 'react-native';
import { setPlatform, setDimensions, setColorScheme, resetAllMocks } from 'vitest-native/helpers';
import { ProfileScreen } from '../src/components/ProfileScreen';

beforeEach(() => {
  vi.useFakeTimers();
  resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderLoaded(props: React.ComponentProps<typeof ProfileScreen>) {
  render(<ProfileScreen {...props} />);
  await act(() => {
    vi.advanceTimersByTime(150);
  });
}

describe('ProfileScreen', () => {
  // --- Loading state ---

  it('shows loading indicator initially', () => {
    render(<ProfileScreen userId="123" />);
    expect(screen.getByTestId('loading')).toBeTruthy();
    expect(screen.getByText('Loading profile...')).toBeTruthy();
  });

  it('shows profile after loading', async () => {
    await renderLoaded({ userId: '123' });
    expect(screen.getByTestId('name-input')).toBeTruthy();
  });

  // --- TextInput ---

  it('updates name on text change', async () => {
    await renderLoaded({ userId: '123' });
    const nameInput = screen.getByTestId('name-input');
    fireEvent.changeText(nameInput, 'Jane Doe');
    expect(nameInput.props.value).toBe('Jane Doe');
  });

  it('updates bio on text change', async () => {
    await renderLoaded({ userId: '123' });
    const bioInput = screen.getByTestId('bio-input');
    fireEvent.changeText(bioInput, 'New bio text');
    expect(bioInput.props.value).toBe('New bio text');
  });

  // --- Switch ---

  it('toggles notifications switch', async () => {
    await renderLoaded({ userId: '123' });
    const toggle = screen.getByTestId('notifications-switch');
    expect(toggle.props.value).toBe(true);
    fireEvent(toggle, 'valueChange', false);
    expect(screen.getByTestId('notifications-switch').props.value).toBe(false);
  });

  // --- Save with Alert + Keyboard ---

  it('calls onSave and dismisses keyboard on save', async () => {
    const onSave = vi.fn();
    await renderLoaded({ userId: '123', onSave });
    fireEvent.press(screen.getByTestId('save-button'));
    expect(Keyboard.dismiss).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith('John Doe');
  });

  it('shows Alert when saving with empty name', async () => {
    await renderLoaded({ userId: '123' });
    fireEvent.changeText(screen.getByTestId('name-input'), '');
    fireEvent.press(screen.getByTestId('save-button'));
    expect(Alert.alert).toHaveBeenCalledWith('Error', 'Name cannot be empty');
  });

  // --- Share API ---

  it('calls Share.share on share button press', async () => {
    const onShare = vi.fn();
    await renderLoaded({ userId: '123', onShare });
    await act(async () => {
      fireEvent.press(screen.getByTestId('share-button'));
    });
    expect(Share.share).toHaveBeenCalledWith({
      message: "Check out John Doe's profile!",
      title: 'Share Profile',
    });
  });

  // --- Linking API ---

  it('opens URL via Linking when website button pressed', async () => {
    await renderLoaded({ userId: '123' });
    await act(async () => {
      fireEvent.press(screen.getByTestId('website-button'));
    });
    expect(Linking.canOpenURL).toHaveBeenCalledWith('https://example.com');
    expect(Linking.openURL).toHaveBeenCalledWith('https://example.com');
  });

  // --- Alert with buttons ---

  it('shows confirmation alert on delete', async () => {
    await renderLoaded({ userId: '123' });
    fireEvent.press(screen.getByTestId('delete-button'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete Account',
      'Are you sure?',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Delete' }),
      ]),
    );
  });

  // --- Modal ---

  it('opens modal when delete is confirmed', async () => {
    await renderLoaded({ userId: '123' });

    fireEvent.press(screen.getByTestId('delete-button'));

    // Simulate pressing "Delete" in the alert
    const alertCall = (Alert.alert as any).mock.calls[0];
    const deleteButton = alertCall[2].find((b: any) => b.text === 'Delete');
    act(() => deleteButton.onPress());

    expect(screen.getByTestId('delete-modal').props.visible).toBe(true);
  });

  // --- Platform ---

  it('shows iOS badge by default', async () => {
    await renderLoaded({ userId: '123' });
    expect(screen.getByTestId('platform-badge')).toBeTruthy();
    expect(screen.getByText('iOS v17.0')).toBeTruthy();
  });

  it('shows Android badge when platform changed', async () => {
    setPlatform('android');
    await renderLoaded({ userId: '123' });
    expect(screen.getByText('Android v34')).toBeTruthy();
  });

  // --- useColorScheme / Appearance ---

  it('applies dark mode styles', async () => {
    setColorScheme('dark');
    await renderLoaded({ userId: '123' });
    // Walk up from ScrollView to find the SafeAreaView with the dark background
    let node = screen.getByTestId('profile-scroll').parent;
    while (node && !StyleSheet.flatten(node.props?.style)?.backgroundColor) {
      node = node.parent;
    }
    const flatStyle = StyleSheet.flatten(node?.props?.style);
    expect(flatStyle?.backgroundColor).toBe('#1a1a1a');
  });

  // --- useWindowDimensions ---

  it('renders tablet layout with larger avatar on wide screen', async () => {
    setDimensions({ width: 1024, height: 768 });
    await renderLoaded({ userId: '123' });
    const avatar = screen.getByTestId('avatar');
    const flatStyle = StyleSheet.flatten(avatar.props.style);
    expect(flatStyle?.width).toBe(150);
    expect(flatStyle?.height).toBe(150);
  });

  // --- StyleSheet ---

  it('StyleSheet.create returns valid styles', () => {
    const styles = StyleSheet.create({
      test: { flex: 1, backgroundColor: 'red' },
    });
    expect(styles.test).toBeDefined();
    expect(styles.test.flex).toBe(1);
  });

  it('StyleSheet.flatten merges styles', () => {
    const merged = StyleSheet.flatten([
      { flex: 1 },
      { backgroundColor: 'blue' },
    ]);
    expect(merged).toEqual({ flex: 1, backgroundColor: 'blue' });
  });

  // --- Image ---

  it('renders avatar image with correct source', async () => {
    await renderLoaded({ userId: 'user-42' });
    const avatar = screen.getByTestId('avatar');
    expect(avatar.props.source).toEqual({ uri: 'https://example.com/avatar/user-42' });
  });
});
