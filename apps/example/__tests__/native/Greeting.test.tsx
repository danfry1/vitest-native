import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { describe, it, expect, vi } from 'vitest';
import { Greeting } from '../../src/components/Greeting';

describe('Greeting', () => {
  it('renders the name', async () => {
    await render(<Greeting name="World" />);
    expect(screen.getByText('Hello, World!')).toBeTruthy();
  });

  it('displays the platform', async () => {
    await render(<Greeting name="World" />);
    expect(screen.getByText('Running on ios')).toBeTruthy();
  });

  it('calls onPress when button is pressed', async () => {
    const onPress = vi.fn();
    await render(<Greeting name="World" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Say Hello'));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('does not render button when onPress is not provided', async () => {
    await render(<Greeting name="World" />);
    expect(screen.queryByText('Say Hello')).toBeNull();
  });
});
