/**
 * Inbox não pode depender de JOIN em TicketLists (migration/feature nova).
 * Listas são anexadas AFTER fetch via attachTicketListsToTickets (sem JOIN no include).
 * FindOrCreate com lock anti-duplicata.
 */
import * as fs from "fs";
import * as path from "path";

describe("tickets inbox not blocked by TicketLists", () => {
  it("ListTicketsService does not JOIN TicketLists on contact include", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../services/TicketServices/ListTicketsService.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/as:\s*["']ticketLists["']/);
    expect(src).toMatch(/attachTicketListsToTickets/);
  });

  it("ShowTicketService attaches ticketLists without Contact JOIN", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../services/TicketServices/ShowTicketService.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/as:\s*["']ticketLists["']/);
    expect(src).toMatch(/attachTicketListsToTicket/);
  });

  it("FindOrCreateTicketService locks and closes race-duplicate open tickets", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../services/TicketServices/FindOrCreateTicketService.ts"
      ),
      "utf8"
    );
    expect(src).toMatch(/runWithTicketLock/);
    expect(src).toMatch(/closing race-duplicate ticket/);
    expect(src).not.toMatch(/getIO indisponível/);
    expect(src).toMatch(/const io = getIO\(\)/);
  });

  it("ListTicketsService applies ticketListIds via TicketListContact lookup, not Contact JOIN", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../services/TicketServices/ListTicketsService.ts"),
      "utf8"
    );
    expect(src).toMatch(/TicketListContact\.findAll/);
    expect(src).toMatch(/filtro ticketListIds ignorado/);
  });

  it("ListTicketsService Oficial OR respects active ticketListIds contact filter", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../services/TicketServices/ListTicketsService.ts"),
      "utf8"
    );
    expect(src).toMatch(/listContactIdsForOficial/);
    expect(src).toMatch(/oficialBranch\.contactId/);
  });

  it("attachTicketListsToTickets helper loads TicketListContacts for badge persist", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../helpers/attachTicketListsToTickets.ts"),
      "utf8"
    );
    expect(src).toMatch(/TicketListContact\.findAll/);
    expect(src).toMatch(/setDataValue\(["']ticketLists["']/);
  });
});
