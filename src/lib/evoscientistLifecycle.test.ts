import { describe, expect, it } from "vitest";
import { processGroupTarget } from "./server/evoscientist/lifecycle";

describe("EvoScientist process lifecycle", () => {
  it("targets the complete process group on POSIX", () => {
    expect(processGroupTarget(1234, "linux")).toBe(-1234);
  });

  it("targets the child directly on Windows", () => {
    expect(processGroupTarget(1234, "win32")).toBe(1234);
  });
});
