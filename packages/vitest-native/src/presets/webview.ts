import type { Preset } from "../types.js";
import React from "react";

// react-native-webview renders a native WebView; its source also has extensionless
// ESM imports that strict Node can't resolve. Shadow it with a host component
// (default + named export, matching `import WebView` and `import { WebView }`).
export function webview(): Preset {
  return {
    name: "webview",
    modules: {
      "react-native-webview": {
        exports: ["WebView"],
        factory: () => {
          const WebView = React.forwardRef((props: any, ref: any) => {
            React.useImperativeHandle(ref, () => ({
              reload: () => {},
              stopLoading: () => {},
              goBack: () => {},
              goForward: () => {},
              injectJavaScript: () => {},
              postMessage: () => {},
              clearCache: () => {},
            }));
            return React.createElement("WebView", props, props.children);
          });
          WebView.displayName = "WebView";
          return { __esModule: true, default: WebView, WebView };
        },
      },
    },
  };
}
