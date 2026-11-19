import TicketList from "../models/TicketList";
import TicketListContact from "../models/TicketListContact";
import Contact from "../models/Contact";
import logger from "../utils/logger";

/** Funciona com Model Sequelize e com plain object. */
function assignField(target: any, key: string, value: unknown): void {
  if (!target || typeof target !== "object") return;
  if (typeof target.setDataValue === "function") {
    try {
      target.setDataValue(key, value);
    } catch {
      /* plain / virtual */
    }
  }
  target[key] = value;
}

/**
 * Anexa ticketLists a contatos (sem JOIN destrutivo).
 * Usado em leads, página de contatos e tickets.
 */
export async function attachTicketListsToContacts(
  contacts: Array<Contact | Record<string, unknown> | null | undefined>,
  companyId: number
): Promise<void> {
  const list = (contacts || []).filter(Boolean) as any[];
  if (!list.length) return;

  const contactIds = Array.from(
    new Set(
      list
        .map((c) => Number(c.id || 0))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );
  if (!contactIds.length) return;

  try {
    const rows = await TicketListContact.findAll({
      where: { companyId, contactId: contactIds },
      include: [
        {
          model: TicketList,
          as: "ticketList",
          required: true,
          where: { companyId },
          attributes: ["id", "name", "color", "order", "isDefault", "companyId"]
        }
      ]
    });

    const byContact = new Map<number, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const tl = row.ticketList;
      if (!tl) continue;
      const cid = Number(row.contactId);
      const plain =
        typeof (tl as any).get === "function"
          ? (tl as any).get({ plain: true })
          : tl;
      const bucket = byContact.get(cid) || [];
      bucket.push(plain);
      byContact.set(cid, bucket);
    }

    for (const [, lists] of byContact) {
      lists.sort((a, b) => {
        const orderDiff = Number(a.order || 0) - Number(b.order || 0);
        if (orderDiff !== 0) return orderDiff;
        return Number(a.id) - Number(b.id);
      });
    }

    for (const contact of list) {
      const cid = Number(contact.id);
      assignField(contact, "ticketLists", byContact.get(cid) || []);
    }
  } catch (err) {
    logger.warn(
      `[TicketLists] attachTicketListsToContacts ignorado: ${
        (err as Error)?.message || err
      }`
    );
    for (const contact of list) {
      if (contact && contact.ticketLists == null) {
        assignField(contact, "ticketLists", []);
      }
    }
  }
}
