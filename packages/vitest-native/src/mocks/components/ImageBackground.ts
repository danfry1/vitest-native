import React from "react";

export function createImageBackgroundMock() {
  const ImageBackground = React.forwardRef((props: any, ref: any) => {
    const { children, style, imageStyle, source, ...rest } = props;
    return React.createElement(
      "ImageBackground",
      { ...rest, ref, style },
      React.createElement("Image", { source, style: imageStyle }),
      children,
    );
  });
  ImageBackground.displayName = "ImageBackground";
  return ImageBackground;
}
