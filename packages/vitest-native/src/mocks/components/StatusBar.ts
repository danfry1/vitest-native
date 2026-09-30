import React from "react";
import { vi } from "vitest";
import { mockFn } from "../mock-fn.js";

export function createStatusBarMock() {
  function StatusBar(props: any) {
    return React.createElement("StatusBar", props);
  }
  StatusBar.displayName = "StatusBar";
  StatusBar.setBarStyle = mockFn();
  StatusBar.setBackgroundColor = mockFn();
  StatusBar.setHidden = mockFn();
  StatusBar.setNetworkActivityIndicatorVisible = mockFn();
  StatusBar.setTranslucent = mockFn();
  StatusBar.pushStackEntry = vi.fn(() => ({}));
  StatusBar.popStackEntry = mockFn();
  StatusBar.replaceStackEntry = vi.fn(() => ({}));
  StatusBar.currentHeight = 44;
  return StatusBar;
}
