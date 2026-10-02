import { describe, expect, it } from "vitest";
import { SWITCH_EVIDENCE, enabledStrategies, improvement, improvementLabel } from "./inferenceSwitch";

describe("inference switch evidence", () => {
  it("derives the displayed acceleration from the measured runs", () => {
    const [throughput, ttft, tpot] = SWITCH_EVIDENCE.metrics;
    expect(improvement(throughput)).toBeCloseTo(1.9957, 3);
    expect(improvementLabel(throughput)).toBe("2.00×");
    expect(improvement(ttft)).toBeCloseTo(0.7064, 3);
    expect(improvementLabel(ttft)).toBe("-70.6%");
    expect(improvement(tpot)).toBeCloseTo(0.5303, 3);
    expect(improvementLabel(tpot)).toBe("-53.0%");
  });

  it("only auto-enables strategies measured in the selected cell", () => {
    expect(enabledStrategies(true).map(strategy => strategy.id)).toEqual([
      "betterscale",
      "prefix-cache",
      "balanced-decode-attention",
    ]);
    expect(enabledStrategies(false)).toEqual([]);
  });
});
