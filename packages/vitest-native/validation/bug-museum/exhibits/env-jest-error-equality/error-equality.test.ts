// Jest's Error equality under jest-compat.
import { expect, test } from "vitest";

class IssueError extends Error {
  issues: string[];
  addIssue: (issue: string) => void;
  constructor(message: string) {
    super(message);
    this.issues = [];
    this.addIssue = (issue) => {
      this.issues.push(issue);
    };
  }
}

test("errors differing only in per-instance methods are equal", () => {
  expect(new IssueError("bad input")).toEqual(new IssueError("bad input"));
  expect(() => {
    throw new IssueError("bad input");
  }).toThrow(new IssueError("bad input"));
});
