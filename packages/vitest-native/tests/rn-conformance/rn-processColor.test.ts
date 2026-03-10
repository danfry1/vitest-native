import { describe, it, expect } from "vitest";
import { processColor } from "react-native";

describe("processColor", () => {
  describe("predefined color names", () => {
    it("should convert red", () => {
      const colorFromString = processColor("red");
      const expectedInt = 0xffff0000;
      expect(colorFromString).toEqual(expectedInt);
    });

    it("should convert white", () => {
      const colorFromString = processColor("white");
      const expectedInt = 0xffffffff;
      expect(colorFromString).toEqual(expectedInt);
    });

    it("should convert black", () => {
      const colorFromString = processColor("black");
      const expectedInt = 0xff000000;
      expect(colorFromString).toEqual(expectedInt);
    });

    it("should convert transparent", () => {
      const colorFromString = processColor("transparent");
      const expectedInt = 0x00000000;
      expect(colorFromString).toEqual(expectedInt);
    });
  });

  describe("RGB strings", () => {
    it("should convert rgb(x, y, z)", () => {
      const colorFromString = processColor("rgb(10, 20, 30)");
      const expectedInt = 0xff0a141e;
      expect(colorFromString).toEqual(expectedInt);
    });
  });

  describe("RGBA strings", () => {
    it("should convert rgba(x, y, z, a)", () => {
      const colorFromString = processColor("rgba(10, 20, 30, 0.4)");
      const expectedInt = 0x660a141e;
      expect(colorFromString).toEqual(expectedInt);
    });
  });

  describe("HSL strings", () => {
    it("should convert hsl(x, y%, z%)", () => {
      const colorFromString = processColor("hsl(318, 69%, 55%)");
      const expectedInt = 0xffdb3dac;
      expect(colorFromString).toEqual(expectedInt);
    });
  });

  describe("HSLA strings", () => {
    it("should convert hsla(x, y%, z%, a)", () => {
      const colorFromString = processColor("hsla(318, 69%, 55%, 0.25)");
      const expectedInt = 0x40db3dac;
      expect(colorFromString).toEqual(expectedInt);
    });
  });

  describe("hex strings", () => {
    it("should convert #xxxxxx", () => {
      const colorFromString = processColor("#1e83c9");
      const expectedInt = 0xff1e83c9;
      expect(colorFromString).toEqual(expectedInt);
    });
  });
});
