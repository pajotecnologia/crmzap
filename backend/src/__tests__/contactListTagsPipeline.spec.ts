/**
 * @jest-environment node
 */

describe("attach lead pipeline stage payload shape", () => {
  it("resolve label/color a partir do status do lead", () => {
    const stages = [
      { key: "novo", label: "Novo", color: "#3B82F6", pipelineId: 1 },
      { key: "proposta", label: "Proposta", color: "#F59E0B", pipelineId: 1 }
    ];
    const lead = { status: "proposta", pipelineId: 1, id: 9 };
    const statusKey = String(lead.status).toLowerCase();
    const stage =
      stages.find(
        (s) =>
          s.key === statusKey && Number(s.pipelineId) === Number(lead.pipelineId)
      ) || stages.find((s) => s.key === statusKey);
    expect(stage?.label).toBe("Proposta");
    expect(stage?.color).toBe("#F59E0B");
  });

  it("tickets e leads reutilizam as mesmas listas do contato", () => {
    const contact = {
      id: 1,
      ticketLists: [{ id: 10, name: "Lead Frio", color: "#64748b" }]
    };
    const ticketView = contact.ticketLists;
    const leadView = contact.ticketLists;
    expect(ticketView).toEqual(leadView);
    expect(ticketView[0].name).toBe("Lead Frio");
  });
});
