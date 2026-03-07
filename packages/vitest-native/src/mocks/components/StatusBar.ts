import React from "react";
import { vi } from "vitest";

export function createStatusBarMock() {
  function StatusBar(props: any) {
    return React.createElement("StatusBar", props);
  }
  StatusBar.displayName = "StatusBar";
  StatusBar.setBarStyle = vi.fn();
  StatusBar.setBackgroundColor = vi.fn();
  StatusBar.setHidden = vi.fn();
  StatusBar.setNetworkActivityIndicatorVisible = vi.fn();
  StatusBar.setTranslucent = vi.fn();
  StatusBar.pushStackEntry = vi.fn(() => ({}));
  StatusBar.popStackEntry = vi.fn();
  StatusBar.replaceStackEntry = vi.fn(() => ({}));
  StatusBar.currentHeight = 44;
  return StatusBar;
}
