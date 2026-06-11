import React, { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { describe, it, expect, vi } from 'vitest';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  FlatList,
  SectionList,
  Image,
  ImageBackground,
  Button,
  Pressable,
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
  TouchableNativeFeedback,
  Modal,
  Switch,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  KeyboardAvoidingView,
  SafeAreaView,
  InputAccessoryView,
  DrawerLayoutAndroid,
  VirtualizedList,
  Animated,
} from 'react-native';

// ---------------------------------------------------------------------------
// Basic component rendering
// ---------------------------------------------------------------------------

describe('View', () => {
  it('renders with testID', () => {
    render(<View testID="box" />);
    expect(screen.getByTestId('box')).toBeTruthy();
  });
  it('passes style prop', () => {
    render(<View testID="styled" style={{ flex: 1 }} />);
    expect(screen.getByTestId('styled').props.style).toEqual({ flex: 1 });
  });
});

// ---------------------------------------------------------------------------
// RNTL Built-in Matchers (auto-registered by vitest-native)
// ---------------------------------------------------------------------------

describe('RNTL Matchers', () => {
  it('toBeEmptyElement()', () => {
    render(<View testID="empty-box" />);
    expect(screen.getByTestId('empty-box')).toBeEmptyElement();
  });
  it('toHaveTextContent()', () => {
    render(<Text>Hello World</Text>);
    expect(screen.getByText('Hello World')).toHaveTextContent('Hello World');
  });
  it('toHaveProp()', () => {
    render(<View testID="prop-test" accessibilityLabel="test" />);
    expect(screen.getByTestId('prop-test')).toHaveProp('accessibilityLabel', 'test');
  });
  it('toHaveStyle()', () => {
    render(<View testID="style-test" style={{ backgroundColor: 'red', flex: 1 }} />);
    expect(screen.getByTestId('style-test')).toHaveStyle({ backgroundColor: 'red' });
  });
  it('toBeVisible()', () => {
    render(<View testID="visible-test" />);
    expect(screen.getByTestId('visible-test')).toBeVisible();
  });
});

describe('Text', () => {
  it('renders text content', () => {
    render(<Text>Hello</Text>);
    expect(screen.getByText('Hello')).toBeTruthy();
  });
  it('handles press events', () => {
    const onPress = vi.fn();
    render(<Text onPress={onPress}>Tap me</Text>);
    fireEvent.press(screen.getByText('Tap me'));
    expect(onPress).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// TextInput — including ref methods
// ---------------------------------------------------------------------------

describe('TextInput', () => {
  it('renders with placeholder', () => {
    render(<TextInput testID="input" placeholder="Type here" />);
    expect(screen.getByTestId('input').props.placeholder).toBe('Type here');
  });

  it('fires onChangeText', () => {
    const onChange = vi.fn();
    render(<TextInput testID="input" onChangeText={onChange} />);
    fireEvent.changeText(screen.getByTestId('input'), 'hello');
    expect(onChange).toHaveBeenCalledWith('hello');
  });

  it('ref.focus() is callable', () => {
    const ref = createRef<any>();
    render(<TextInput ref={ref} testID="input" />);
    expect(ref.current.focus).toBeDefined();
    ref.current.focus();
    expect(ref.current.focus).toHaveBeenCalled();
  });

  it('ref.blur() is callable', () => {
    const ref = createRef<any>();
    render(<TextInput ref={ref} testID="input" />);
    ref.current.blur();
    expect(ref.current.blur).toHaveBeenCalled();
  });

  it('ref.clear() is callable', () => {
    const ref = createRef<any>();
    render(<TextInput ref={ref} testID="input" />);
    ref.current.clear();
    expect(ref.current.clear).toHaveBeenCalled();
  });

  it('ref.isFocused() returns boolean', () => {
    const ref = createRef<any>();
    render(<TextInput ref={ref} testID="input" />);
    expect(ref.current.isFocused()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ScrollView — including ref methods
// ---------------------------------------------------------------------------

describe('ScrollView', () => {
  it('renders children', () => {
    render(<ScrollView testID="scroll"><Text>Content</Text></ScrollView>);
    expect(screen.getByTestId('scroll')).toBeTruthy();
    expect(screen.getByText('Content')).toBeTruthy();
  });

  it('fires onScroll', () => {
    const onScroll = vi.fn();
    render(<ScrollView testID="scroll" onScroll={onScroll} />);
    fireEvent.scroll(screen.getByTestId('scroll'), { nativeEvent: { contentOffset: { y: 100 } } });
    expect(onScroll).toHaveBeenCalled();
  });

  it('ref.scrollTo() is callable', () => {
    const ref = createRef<any>();
    render(<ScrollView ref={ref} testID="scroll" />);
    expect(ref.current.scrollTo).toBeDefined();
    ref.current.scrollTo({ y: 100 });
    expect(ref.current.scrollTo).toHaveBeenCalledWith({ y: 100 });
  });

  it('ref.scrollToEnd() is callable', () => {
    const ref = createRef<any>();
    render(<ScrollView ref={ref} testID="scroll" />);
    ref.current.scrollToEnd();
    expect(ref.current.scrollToEnd).toHaveBeenCalled();
  });

  it('ref.flashScrollIndicators() is callable', () => {
    const ref = createRef<any>();
    render(<ScrollView ref={ref} testID="scroll" />);
    ref.current.flashScrollIndicators();
    expect(ref.current.flashScrollIndicators).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// FlatList — including ref methods
// ---------------------------------------------------------------------------

describe('FlatList', () => {
  const data = [
    { id: '1', label: 'One' },
    { id: '2', label: 'Two' },
  ];

  it('renders items', () => {
    render(
      <FlatList
        testID="list"
        data={data}
        renderItem={({ item }) => <Text>{item.label}</Text>}
        keyExtractor={item => item.id}
      />,
    );
    expect(screen.getByText('One')).toBeTruthy();
    expect(screen.getByText('Two')).toBeTruthy();
  });

  it('renders ListEmptyComponent when data is empty', () => {
    render(
      <FlatList
        testID="list"
        data={[]}
        renderItem={() => null}
        ListEmptyComponent={<Text>Empty</Text>}
      />,
    );
    expect(screen.getByText('Empty')).toBeTruthy();
  });

  it('renders ListHeaderComponent and ListFooterComponent', () => {
    render(
      <FlatList
        data={data}
        renderItem={({ item }) => <Text>{item.label}</Text>}
        keyExtractor={item => item.id}
        ListHeaderComponent={<Text>Header</Text>}
        ListFooterComponent={<Text>Footer</Text>}
      />,
    );
    expect(screen.getByText('Header')).toBeTruthy();
    expect(screen.getByText('Footer')).toBeTruthy();
  });

  it('ref.scrollToIndex() is callable', () => {
    const ref = createRef<any>();
    render(
      <FlatList
        ref={ref}
        data={data}
        renderItem={({ item }) => <Text>{item.label}</Text>}
        keyExtractor={item => item.id}
      />,
    );
    ref.current.scrollToIndex({ index: 0 });
    expect(ref.current.scrollToIndex).toHaveBeenCalledWith({ index: 0 });
  });

  it('ref.scrollToOffset() is callable', () => {
    const ref = createRef<any>();
    render(
      <FlatList
        ref={ref}
        data={data}
        renderItem={({ item }) => <Text>{item.label}</Text>}
        keyExtractor={item => item.id}
      />,
    );
    ref.current.scrollToOffset({ offset: 200 });
    expect(ref.current.scrollToOffset).toHaveBeenCalledWith({ offset: 200 });
  });
});

// ---------------------------------------------------------------------------
// SectionList — including ref methods
// ---------------------------------------------------------------------------

describe('SectionList', () => {
  const sections = [
    { title: 'A', data: [{ id: '1', name: 'Alice' }] },
    { title: 'B', data: [{ id: '2', name: 'Bob' }] },
  ];

  it('renders sections with headers', () => {
    render(
      <SectionList
        testID="slist"
        sections={sections}
        renderItem={({ item }) => <Text>{item.name}</Text>}
        renderSectionHeader={({ section }) => <Text testID={`hdr-${section.title}`}>{section.title}</Text>}
        keyExtractor={item => item.id}
      />,
    );
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByTestId('hdr-A')).toBeTruthy();
    expect(screen.getByTestId('hdr-B')).toBeTruthy();
  });

  it('ref.scrollToLocation() is callable', () => {
    const ref = createRef<any>();
    render(
      <SectionList
        ref={ref}
        sections={sections}
        renderItem={({ item }) => <Text>{item.name}</Text>}
        keyExtractor={item => item.id}
      />,
    );
    ref.current.scrollToLocation({ sectionIndex: 0, itemIndex: 0 });
    expect(ref.current.scrollToLocation).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// VirtualizedList
// ---------------------------------------------------------------------------

describe('VirtualizedList', () => {
  const data = ['A', 'B', 'C'];

  it('renders items via getItem/getItemCount', () => {
    render(
      <VirtualizedList
        testID="vlist"
        data={data}
        getItem={(d: string[], i: number) => d[i]}
        getItemCount={(d: string[]) => d.length}
        renderItem={({ item }: { item: string }) => <Text>{item}</Text>}
        keyExtractor={(_: string, i: number) => String(i)}
      />,
    );
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('C')).toBeTruthy();
  });

  it('ref.scrollToIndex() is callable', () => {
    const ref = createRef<any>();
    render(
      <VirtualizedList
        ref={ref}
        data={data}
        getItem={(d: string[], i: number) => d[i]}
        getItemCount={(d: string[]) => d.length}
        renderItem={({ item }: { item: string }) => <Text>{item}</Text>}
        keyExtractor={(_: string, i: number) => String(i)}
      />,
    );
    ref.current.scrollToIndex({ index: 1 });
    expect(ref.current.scrollToIndex).toHaveBeenCalledWith({ index: 1 });
  });
});

// ---------------------------------------------------------------------------
// Image & ImageBackground
// ---------------------------------------------------------------------------

describe('Image', () => {
  it('renders with source', () => {
    render(<Image testID="img" source={{ uri: 'https://example.com/photo.jpg' }} />);
    expect(screen.getByTestId('img').props.source).toEqual({ uri: 'https://example.com/photo.jpg' });
  });

  it('Image.getSize() calls success asynchronously', async () => {
    const success = vi.fn();
    Image.getSize('https://example.com/photo.jpg', success);
    // getSize calls success via microtask (like real RN)
    await Promise.resolve();
    expect(success).toHaveBeenCalledWith(100, 100);
  });

  it('Image.prefetch() resolves', async () => {
    const result = await Image.prefetch('https://example.com/photo.jpg');
    expect(result).toBe(true);
  });

  it('Image.resolveAssetSource() returns source', () => {
    const source = Image.resolveAssetSource({ uri: 'test.png' });
    expect(source).toHaveProperty('uri', 'test.png');
  });
});

describe('ImageBackground', () => {
  it('renders children over image', () => {
    render(
      <ImageBackground testID="imgbg" source={{ uri: 'bg.jpg' }}>
        <Text>Overlay</Text>
      </ImageBackground>,
    );
    expect(screen.getByTestId('imgbg')).toBeTruthy();
    expect(screen.getByText('Overlay')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

describe('Button', () => {
  it('renders title text', () => {
    render(<Button title="Press Me" onPress={vi.fn()} />);
    expect(screen.getByText('Press Me')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = vi.fn();
    render(<Button title="Go" onPress={onPress} />);
    fireEvent.press(screen.getByText('Go'));
    expect(onPress).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Touchables
// ---------------------------------------------------------------------------

describe('Touchable components', () => {
  it('TouchableOpacity fires onPress', () => {
    const onPress = vi.fn();
    render(
      <TouchableOpacity testID="to" onPress={onPress}>
        <Text>Touch</Text>
      </TouchableOpacity>,
    );
    fireEvent.press(screen.getByTestId('to'));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('TouchableHighlight fires onPress', () => {
    const onPress = vi.fn();
    render(
      <TouchableHighlight testID="th" onPress={onPress}>
        <Text>Touch</Text>
      </TouchableHighlight>,
    );
    fireEvent.press(screen.getByTestId('th'));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('TouchableWithoutFeedback fires onPress', () => {
    const onPress = vi.fn();
    render(
      <TouchableWithoutFeedback testID="twf" onPress={onPress}>
        <Text>Touch</Text>
      </TouchableWithoutFeedback>,
    );
    fireEvent.press(screen.getByTestId('twf'));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('TouchableNativeFeedback fires onPress', () => {
    const onPress = vi.fn();
    render(
      <TouchableNativeFeedback testID="tnf" onPress={onPress}>
        <Text>Touch</Text>
      </TouchableNativeFeedback>,
    );
    fireEvent.press(screen.getByTestId('tnf'));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('Pressable fires onPress', () => {
    const onPress = vi.fn();
    render(
      <Pressable testID="press" onPress={onPress}>
        <Text>Press</Text>
      </Pressable>,
    );
    fireEvent.press(screen.getByTestId('press'));
    expect(onPress).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

describe('Modal', () => {
  it('renders children when visible', () => {
    render(
      <Modal visible={true}>
        <Text>Modal Content</Text>
      </Modal>,
    );
    expect(screen.getByText('Modal Content')).toBeTruthy();
  });

  it('hides children when not visible', () => {
    render(
      <Modal visible={false}>
        <Text>Hidden</Text>
      </Modal>,
    );
    expect(screen.queryByText('Hidden')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

describe('Switch', () => {
  it('renders with value', () => {
    render(<Switch testID="sw" value={true} />);
    expect(screen.getByTestId('sw').props.value).toBe(true);
  });

  it('fires onValueChange', () => {
    const onChange = vi.fn();
    render(<Switch testID="sw" value={false} onValueChange={onChange} />);
    fireEvent(screen.getByTestId('sw'), 'valueChange', true);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

// ---------------------------------------------------------------------------
// ActivityIndicator
// ---------------------------------------------------------------------------

describe('ActivityIndicator', () => {
  it('renders with size prop', () => {
    render(<ActivityIndicator testID="spinner" size="large" />);
    expect(screen.getByTestId('spinner').props.size).toBe('large');
  });
});

// ---------------------------------------------------------------------------
// StatusBar (component)
// ---------------------------------------------------------------------------

describe('StatusBar component', () => {
  it('renders with barStyle prop', () => {
    render(<StatusBar barStyle="dark-content" />);
    // StatusBar is a no-op in tests but should not throw
  });
});

// ---------------------------------------------------------------------------
// RefreshControl
// ---------------------------------------------------------------------------

describe('RefreshControl', () => {
  it('renders with refreshing prop', () => {
    render(<RefreshControl testID="rc" refreshing={false} />);
    expect(screen.getByTestId('rc').props.refreshing).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Layout wrappers
// ---------------------------------------------------------------------------

describe('Layout wrappers', () => {
  it('SafeAreaView renders children', () => {
    render(<SafeAreaView testID="sa"><Text>Safe</Text></SafeAreaView>);
    expect(screen.getByTestId('sa')).toBeTruthy();
    expect(screen.getByText('Safe')).toBeTruthy();
  });

  it('KeyboardAvoidingView renders children', () => {
    render(<KeyboardAvoidingView testID="kav"><Text>KAV</Text></KeyboardAvoidingView>);
    expect(screen.getByTestId('kav')).toBeTruthy();
    expect(screen.getByText('KAV')).toBeTruthy();
  });

  it('InputAccessoryView renders children', () => {
    render(<InputAccessoryView><Text>Accessory</Text></InputAccessoryView>);
    expect(screen.getByText('Accessory')).toBeTruthy();
  });

  it('DrawerLayoutAndroid renders children', () => {
    render(<DrawerLayoutAndroid><Text>Drawer</Text></DrawerLayoutAndroid>);
    expect(screen.getByText('Drawer')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Animated components
// ---------------------------------------------------------------------------

describe('Animated components', () => {
  it('Animated.View renders', () => {
    render(<Animated.View testID="aview"><Text>Animated</Text></Animated.View>);
    expect(screen.getByTestId('aview')).toBeTruthy();
  });

  it('Animated.Text renders', () => {
    render(<Animated.Text testID="atext">Animated Text</Animated.Text>);
    expect(screen.getByTestId('atext')).toBeTruthy();
  });

  it('Animated.Image renders', () => {
    render(<Animated.Image testID="aimg" source={{ uri: 'test.jpg' }} />);
    expect(screen.getByTestId('aimg')).toBeTruthy();
  });

  it('Animated.ScrollView renders', () => {
    render(<Animated.ScrollView testID="ascroll"><Text>Content</Text></Animated.ScrollView>);
    expect(screen.getByTestId('ascroll')).toBeTruthy();
  });

  it('Animated.FlatList is defined', () => {
    expect(Animated.FlatList).toBeDefined();
  });

  it('Animated.SectionList is defined', () => {
    expect(Animated.SectionList).toBeDefined();
  });
});
