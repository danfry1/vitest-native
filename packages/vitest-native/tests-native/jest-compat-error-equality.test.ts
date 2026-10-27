/**
 * Errors whose class assigns methods as instance fields, under the jest-compat setup.
 *
 * zod 3's ZodError assigns `addIssue` and `addIssues` as arrow functions in its
 * constructor (zod 3.25 v3/ZodError.js:31-36), so every instance has its own closures.
 * Vitest compares an error's own enumerable properties, so two identical ZodErrors were
 * never equal, and `toEqual`, `rejects.toEqual` and `toThrow(instance)` failed with
 * "Compared values have no visual difference". Jest 30 passes them.
 *
 * The cases marked "Jest fails this too" are where a message-only rule, Jest's own for
 * `equals`, would have been more lenient than Jest: each one passed under such a tester
 * and fails under Jest 30.2. The cases marked "stricter than Jest" pass under Jest, which
 * compares errors by message alone, and fail here, as they do in Vitest.
 */
import { describe, expect, it, vi } from "vitest";

/** ZodError's shape: data in `issues`, methods as per-instance closures, a derived message. */
class ZodError extends Error {
  issues: unknown[];
  addIssue: (sub: unknown) => void;
  addIssues: (subs?: unknown[]) => void;
  constructor(issues: unknown[]) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    this.name = "ZodError";
    this.issues = issues;
  }
  override get message(): string {
    return JSON.stringify(this.issues);
  }
}
const zodError = (path = "name") =>
  new ZodError([{ code: "invalid_type", expected: "string", path: [path] }]);

/** An error with one method field, any other own properties, and Error's own options. */
class WithMethod extends Error {
  retry = (): void => {};
  constructor(message: string, extra: Record<string, unknown> = {}, options?: ErrorOptions) {
    super(message, options);
    Object.assign(this, extra);
  }
}

const throwing = (error: unknown) => () => {
  throw error;
};

describe("two errors that differ only in their methods' closures are equal", () => {
  it("toEqual and toStrictEqual", () => {
    expect(zodError()).toEqual(zodError());
    expect(zodError()).toStrictEqual(zodError());
  });

  it("toThrow(instance) and rejects.toEqual", async () => {
    expect(throwing(zodError())).toThrow(zodError());
    await expect(Promise.reject(zodError())).rejects.toEqual(zodError());
  });

  it("nested in objects, arrays, a cause and mock calls", () => {
    expect({ error: zodError(), n: 1 }).toEqual({ error: zodError(), n: 1 });
    expect([zodError("a"), zodError("b")]).toEqual([zodError("a"), zodError("b")]);
    expect(new Error("wrapped", { cause: zodError() })).toEqual(
      new Error("wrapped", { cause: zodError() }),
    );
    const onError = vi.fn();
    onError(zodError());
    expect(onError).toHaveBeenCalledWith(zodError());
  });

  it("an AggregateError with methods, and a cause that cycles back to its error", () => {
    const aggregate = () => Object.assign(new AggregateError([zodError()], "all"), { f() {} });
    expect(aggregate()).toEqual(aggregate());
    const cyclic = () => {
      const error = new WithMethod("x");
      error.cause = error;
      return error;
    };
    expect(cyclic()).toEqual(cyclic());
  });
});

describe("everything else about the errors is still compared", () => {
  it("data: a ZodError's issues, alone or nested", () => {
    expect(zodError("a")).not.toEqual(zodError("b"));
    expect([zodError("a")]).not.toEqual([zodError("b")]);
  });

  it("type under toStrictEqual (Jest fails this too)", () => {
    expect(new TypeError("x")).not.toStrictEqual(new Error("x"));
    class A extends WithMethod {}
    class B extends WithMethod {}
    expect(new A("x")).toEqual(new B("x"));
    expect(new A("x")).not.toStrictEqual(new B("x"));
  });

  it("cause, in toThrow (Jest fails this too) and toEqual (stricter than Jest)", () => {
    expect(throwing(new Error("x", { cause: 1 }))).not.toThrow(new Error("x", { cause: 2 }));
    // A cause given to the constructor is an own property that is not enumerable, so it
    // is compared as the cause, not with the rest of the error's data.
    expect(throwing(new WithMethod("x", {}, { cause: 1 }))).not.toThrow(
      new WithMethod("x", {}, { cause: 2 }),
    );
    expect(new WithMethod("x", {}, { cause: 1 })).not.toEqual(
      new WithMethod("x", {}, { cause: 2 }),
    );
    expect(new WithMethod("x", {}, { cause: zodError() })).toEqual(
      new WithMethod("x", {}, { cause: zodError() }),
    );
  });

  it("name, own data, and AggregateError errors (stricter than Jest)", () => {
    const renamed = new WithMethod("x");
    renamed.name = "Other";
    expect(new WithMethod("x")).not.toEqual(renamed);
    expect(new WithMethod("x", { code: 1 })).not.toEqual(new WithMethod("x", { code: 2 }));
    const aggregate = (m: string) =>
      Object.assign(new AggregateError([new Error(m)], "all"), { f() {} });
    expect(aggregate("a")).not.toEqual(aggregate("b"));
  });

  it("an undefined property against a missing one, as each matcher treats it", () => {
    expect(new WithMethod("x", { code: undefined })).toEqual(new WithMethod("x"));
    expect(new WithMethod("x", { code: undefined })).not.toStrictEqual(new WithMethod("x"));
  });

  it("a method on one side only (stricter than Jest)", () => {
    const valued = Object.assign(new WithMethod("x"), { retry: 1 });
    expect(new WithMethod("x")).not.toEqual(valued);
    const missing = new WithMethod("x") as Partial<WithMethod>;
    delete missing.retry;
    expect(new WithMethod("x")).not.toEqual(missing);
    expect(new WithMethod("x")).toEqual(
      Object.assign(new WithMethod("x"), { retry: expect.any(Function) }),
    );
  });
});

it("a tester registered after the setup still decides its own errors", () => {
  class Coded extends WithMethod {}
  // Vitest runs testers in order and stops at the first answer, so one registered
  // later would never see a pair the setup's tester answers first.
  expect.addEqualityTesters([
    (a: unknown, b: unknown) =>
      a instanceof Coded && b instanceof Coded ? a.message.length === b.message.length : undefined,
  ]);
  expect(new Coded("abc")).toEqual(new Coded("xyz"));
});
