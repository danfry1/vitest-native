import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { describe, it, expect, vi } from 'vitest';
import { Animated } from 'react-native';
import { FeedList } from '../src/components/FeedList';

const mockItems = [
  { id: '1', title: 'First Post', author: 'Alice', imageUrl: 'https://img/1.jpg', likes: 42 },
  { id: '2', title: 'Second Post', author: 'Bob', imageUrl: 'https://img/2.jpg', likes: 17 },
  { id: '3', title: 'Third Post', author: 'Charlie', imageUrl: 'https://img/3.jpg', likes: 99 },
];

const mockSections = [
  { title: 'Featured', data: [mockItems[0]] },
  { title: 'Recent', data: [mockItems[1], mockItems[2]] },
];

describe('FeedList', () => {
  // --- FlatList rendering ---

  it('renders FlatList with items', () => {
    render(<FeedList items={mockItems} />);
    expect(screen.getByTestId('flat-feed')).toBeTruthy();
    expect(screen.getByText('First Post')).toBeTruthy();
    expect(screen.getByText('Second Post')).toBeTruthy();
    expect(screen.getByText('Third Post')).toBeTruthy();
  });

  it('renders item authors', () => {
    render(<FeedList items={mockItems} />);
    expect(screen.getByText('by Alice')).toBeTruthy();
    expect(screen.getByText('by Bob')).toBeTruthy();
  });

  it('renders like counts', () => {
    render(<FeedList items={mockItems} />);
    expect(screen.getByTestId('likes-1')).toBeTruthy();
    expect(screen.getByText('42 likes')).toBeTruthy();
    expect(screen.getByText('99 likes')).toBeTruthy();
  });

  it('renders images for each item', () => {
    render(<FeedList items={mockItems} />);
    expect(screen.getByTestId('feed-image-1')).toBeTruthy();
    expect(screen.getByTestId('feed-image-2')).toBeTruthy();
  });

  // --- Empty state ---

  it('renders empty state when no items', () => {
    render(<FeedList items={[]} />);
    expect(screen.getByTestId('empty-feed')).toBeTruthy();
    expect(screen.getByText('No posts yet')).toBeTruthy();
  });

  // --- Header ---

  it('renders list header', () => {
    render(<FeedList items={mockItems} />);
    expect(screen.getByTestId('feed-header')).toBeTruthy();
    expect(screen.getByText('Your Feed')).toBeTruthy();
  });

  // --- Item press ---

  it('calls onItemPress when item is tapped', () => {
    const onItemPress = vi.fn();
    render(<FeedList items={mockItems} onItemPress={onItemPress} />);
    fireEvent.press(screen.getByTestId('feed-item-1'));
    expect(onItemPress).toHaveBeenCalledWith(mockItems[0]);
  });

  it('calls onItemPress with correct item', () => {
    const onItemPress = vi.fn();
    render(<FeedList items={mockItems} onItemPress={onItemPress} />);
    fireEvent.press(screen.getByTestId('feed-item-3'));
    expect(onItemPress).toHaveBeenCalledWith(mockItems[2]);
  });

  // --- Pull to refresh ---

  it('calls onRefresh when pull to refresh is triggered', async () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(<FeedList items={mockItems} onRefresh={onRefresh} />);
    const refreshControl = screen.getByTestId('refresh');
    expect(refreshControl).toBeTruthy();
    await act(async () => {
      fireEvent(refreshControl, 'refresh');
    });
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  // --- SectionList ---

  it('renders SectionList when useSections is true', () => {
    render(<FeedList items={[]} sections={mockSections} useSections />);
    expect(screen.getByTestId('section-feed')).toBeTruthy();
  });

  it('renders section headers', () => {
    render(<FeedList items={[]} sections={mockSections} useSections />);
    expect(screen.getByTestId('section-Featured')).toBeTruthy();
    expect(screen.getByTestId('section-Recent')).toBeTruthy();
    expect(screen.getByText('Featured')).toBeTruthy();
    expect(screen.getByText('Recent')).toBeTruthy();
  });

  it('renders items within sections', () => {
    render(<FeedList items={[]} sections={mockSections} useSections />);
    expect(screen.getByText('First Post')).toBeTruthy();
    expect(screen.getByText('Second Post')).toBeTruthy();
  });

  // --- Animated ---

  it('Animated.Value works in card animations', () => {
    const val = new Animated.Value(1);
    expect(val.getValue()).toBe(1);
  });

  it('Animated.spring creates animation', () => {
    const val = new Animated.Value(1);
    const anim = Animated.spring(val, { toValue: 0.95, useNativeDriver: true });
    expect(anim.start).toBeDefined();
    expect(anim.stop).toBeDefined();
    const cb = vi.fn();
    anim.start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });
});
