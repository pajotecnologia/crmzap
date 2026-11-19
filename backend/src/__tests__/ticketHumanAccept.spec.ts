import {
  humanAcceptTicketFlags,
  isHumanAttendantTicket,
  isManualTicketAccept,
  ticketAiAgentIsResponding,
  buildAssumeHumanTicketData
} from "../helpers/ticketHumanAccept";

describe("ticketHumanAccept", () => {
  it("isManualTicketAccept: pending → open com atendente", () => {
    expect(
      isManualTicketAccept({
        status: "open",
        userId: 5,
        oldStatus: "pending",
        oldUserId: null
      })
    ).toBe(true);
  });

  it("isManualTicketAccept: pending → group (WhatsApp)", () => {
    expect(
      isManualTicketAccept({
        status: "group",
        userId: 3,
        oldStatus: "pending",
        oldUserId: undefined
      })
    ).toBe(true);
  });

  it("isManualTicketAccept: não aceita sem userId", () => {
    expect(
      isManualTicketAccept({
        status: "open",
        userId: null,
        oldStatus: "pending",
        oldUserId: null
      })
    ).toBe(false);
  });

  it("isManualTicketAccept: payload explícito isBot=false", () => {
    expect(
      isManualTicketAccept({
        status: "open",
        userId: 2,
        oldStatus: "open",
        oldUserId: 2,
        explicitIsBot: false
      })
    ).toBe(true);
  });

  it("isHumanAttendantTicket: humano assumiu", () => {
    expect(isHumanAttendantTicket({ userId: 10, isBot: false })).toBe(true);
    expect(isHumanAttendantTicket({ userId: 10, isBot: true })).toBe(false);
    expect(isHumanAttendantTicket({ userId: null, isBot: false })).toBe(false);
  });

  it("humanAcceptTicketFlags desliga agente e integração", () => {
    expect(humanAcceptTicketFlags()).toEqual({
      isBot: false,
      useIntegration: false,
      integrationId: null
    });
  });

  it("ticketAiAgentIsResponding: isBot ou useIntegration", () => {
    expect(ticketAiAgentIsResponding({ isBot: true, useIntegration: false })).toBe(
      true
    );
    expect(ticketAiAgentIsResponding({ isBot: false, useIntegration: true })).toBe(
      true
    );
    expect(ticketAiAgentIsResponding({ isBot: false, useIntegration: false })).toBe(
      false
    );
  });

  it("buildAssumeHumanTicketData: open e group", () => {
    expect(buildAssumeHumanTicketData({ userId: 7 })).toEqual({
      status: "open",
      userId: 7,
      isBot: false,
      useIntegration: false,
      integrationId: null
    });
    expect(
      buildAssumeHumanTicketData({ userId: 7, status: "group", isGroup: true })
    ).toEqual({
      status: "group",
      userId: 7,
      isBot: false,
      useIntegration: false,
      integrationId: null
    });
  });
});
