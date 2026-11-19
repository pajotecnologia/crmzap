/**
 * @jest-environment node
 */
import {
  computeTypingDurationMs,
  resolveAgentResponseDelayMs
} from "../helpers/agentOutboundHumanDelay";

describe("agentOutboundHumanDelay", () => {
  it("resolveAgentResponseDelayMs converts seconds and clamps", () => {
    expect(resolveAgentResponseDelayMs({ responseDelay: 0 })).toBe(0);
    expect(resolveAgentResponseDelayMs({ responseDelay: null })).toBe(0);
    expect(resolveAgentResponseDelayMs({ responseDelay: 10 })).toBe(10_000);
    expect(resolveAgentResponseDelayMs({ responseDelay: 9999 })).toBe(120_000);
  });

  it("computeTypingDurationMs scales with text length within bounds", () => {
    const short = computeTypingDurationMs("Oi");
    const long = computeTypingDurationMs("a".repeat(500));
    expect(short).toBeGreaterThanOrEqual(1200);
    expect(long).toBeLessThanOrEqual(8000);
    expect(long).toBeGreaterThan(short);
  });
});
