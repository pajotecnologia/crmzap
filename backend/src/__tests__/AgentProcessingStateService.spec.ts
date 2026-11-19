import {
  AGENT_PROCESSING_STALE_MS,
  clearStaleAgentProcessingLock,
  isAgentProcessingLockActive,
  markAgentProcessingFinished,
  markAgentProcessingStarted
} from "../services/PromptServices/AgentProcessingStateService";

describe("AgentProcessingStateService — lock / stale", () => {
  it("detects active fresh lock", () => {
    const startedAt = new Date().toISOString();
    expect(
      isAgentProcessingLockActive({
        agentState: {
          processing: { active: true, status: "processing", startedAt }
        }
      })
    ).toBe(true);
  });

  it("ignores stale lock ( > AGENT_PROCESSING_STALE_MS )", () => {
    const startedAt = new Date(
      Date.now() - AGENT_PROCESSING_STALE_MS - 5_000
    ).toISOString();
    expect(
      isAgentProcessingLockActive({
        agentState: {
          processing: { active: true, status: "processing", startedAt }
        }
      })
    ).toBe(false);
  });

  it("ignores active lock without startedAt (não trava eterno)", () => {
    expect(
      isAgentProcessingLockActive({
        agentState: {
          processing: { active: true, status: "processing" }
        }
      })
    ).toBe(false);
  });

  it("inactive lock is not active", () => {
    expect(
      isAgentProcessingLockActive({
        agentState: {
          processing: {
            active: false,
            status: "completed",
            startedAt: new Date().toISOString()
          }
        }
      })
    ).toBe(false);
  });

  it("clearStaleAgentProcessingLock limpa lock órfão", async () => {
    const startedAt = new Date(Date.now() - 200_000).toISOString();
    const ticket: any = {
      id: 99,
      dataWebhook: {
        agentState: {
          processing: { active: true, status: "processing", startedAt }
        }
      },
      update: jest.fn(async function (this: any, patch: any) {
        this.dataWebhook = patch.dataWebhook;
      }),
      setDataValue: jest.fn(function (this: any, key: string, val: any) {
        this[key] = val;
      })
    };

    const cleared = await clearStaleAgentProcessingLock({ ticket });
    expect(cleared).toBe(true);
    expect(ticket.update).toHaveBeenCalled();
    const dw = ticket.dataWebhook;
    expect(dw.agentState.processing.active).toBe(false);
    expect(dw.agentState.processing.error).toMatch(/stale/i);
  });

  it("mark started then finished clears active", async () => {
    const ticket: any = {
      id: 1,
      dataWebhook: {},
      update: jest.fn(async function (this: any, patch: any) {
        this.dataWebhook = patch.dataWebhook;
      }),
      setDataValue: jest.fn(function (this: any, key: string, val: any) {
        this[key] = val;
      })
    };
    await markAgentProcessingStarted({
      ticket,
      promptId: 3,
      wid: "w1",
      userText: "oi"
    });
    expect(isAgentProcessingLockActive(ticket.dataWebhook)).toBe(true);
    await markAgentProcessingFinished({
      ticket,
      promptId: 3,
      wid: "w1",
      ok: true
    });
    expect(isAgentProcessingLockActive(ticket.dataWebhook)).toBe(false);
  });
});
