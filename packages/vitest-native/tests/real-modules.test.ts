import { describe, it, expect, vi } from "vitest";
import { Easing } from "react-native";

describe("real RN modules (hybrid architecture)", () => {
  describe("Easing (real RN code, Flow-stripped)", () => {
    it("is NOT a vi.fn() mock — it's real RN code", () => {
      // Our hand-written mock wraps every function in vi.fn().
      // Real RN Easing functions are plain functions, not mocks.
      expect(vi.isMockFunction(Easing.linear)).toBe(false);
      expect(vi.isMockFunction(Easing.quad)).toBe(false);
      expect(vi.isMockFunction(Easing.cubic)).toBe(false);
      expect(vi.isMockFunction(Easing.bounce)).toBe(false);
    });

    it("produces mathematically correct results", () => {
      expect(Easing.linear(0.5)).toBe(0.5);
      expect(Easing.quad(0.5)).toBe(0.25);
      expect(Easing.cubic(0.5)).toBe(0.125);
      expect(Easing.step0(0)).toBe(0);
      expect(Easing.step0(0.5)).toBe(1);
      expect(Easing.step1(1)).toBe(1);
      expect(Easing.step1(0.5)).toBe(0);
    });

    it("bounce matches real RN implementation", () => {
      // Real RN bounce values (not approximations)
      expect(Easing.bounce(0.5)).toBeCloseTo(0.765625, 10);
      expect(Easing.bounce(0)).toBe(0);
      expect(Easing.bounce(1)).toBeCloseTo(1, 10);
    });

    it("bezier uses real cubic bezier implementation", () => {
      const ease = Easing.bezier(0.42, 0, 1, 1);
      expect(typeof ease).toBe("function");
      // Known value from RN's real bezier implementation
      expect(ease(0.5)).toBeCloseTo(0.31535681257253934, 10);
      // Boundary conditions
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
    });

    it("ease() uses bezier internally (real implementation)", () => {
      // In real RN, ease = bezier(0.42, 0, 1, 1)
      const easeVal = Easing.ease(0.5);
      const bezierVal = Easing.bezier(0.42, 0, 1, 1)(0.5);
      expect(easeVal).toBe(bezierVal);
    });

    it("in/out/inOut compose correctly", () => {
      expect(Easing.in(Easing.quad)(0.5)).toBe(0.25);
      expect(Easing.out(Easing.quad)(0.5)).toBe(0.75);
      expect(Easing.inOut(Easing.quad)(0.5)).toBe(0.5);
    });

    it("elastic and back return functions", () => {
      const elastic = Easing.elastic(1);
      expect(typeof elastic).toBe("function");
      expect(typeof elastic(0.5)).toBe("number");

      const back = Easing.back(1.70158);
      expect(typeof back).toBe("function");
      expect(back(0.5)).toBeCloseTo(-0.0876975, 5);
    });

    it("poly returns a function", () => {
      const quartic = Easing.poly(4);
      expect(typeof quartic).toBe("function");
      expect(quartic(0.5)).toBe(0.0625); // 0.5^4
    });

    it("sin, circle, exp produce correct values", () => {
      expect(Easing.sin(0.5)).toBeCloseTo(1 - Math.cos(Math.PI / 4), 10);
      expect(Easing.circle(0.5)).toBeCloseTo(1 - Math.sqrt(0.75), 10);
      expect(Easing.exp(0.5)).toBeCloseTo(Math.pow(2, -5), 10);
    });
  });
});
