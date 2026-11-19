import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import ListService from "../services/TicketListServices/ListService";
import CreateService from "../services/TicketListServices/CreateService";
import UpdateService from "../services/TicketListServices/UpdateService";
import DeleteService from "../services/TicketListServices/DeleteService";
import SyncContactListsService from "../services/TicketListServices/SyncContactListsService";
import ListByContactService from "../services/TicketListServices/ListByContactService";
import AddContactService from "../services/TicketListServices/AddContactService";
import RemoveContactService from "../services/TicketListServices/RemoveContactService";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const lists = await ListService(companyId);
  return res.status(200).json(lists);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { name, color } = req.body;

  const list = await CreateService({
    name,
    color,
    companyId
  });

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-ticketList`, {
    action: "create",
    list
  });

  return res.status(200).json(list);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { listId } = req.params;
  const { name, color, order } = req.body;

  const list = await UpdateService({
    id: listId,
    companyId,
    name,
    color,
    order
  });

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-ticketList`, {
    action: "update",
    list
  });

  return res.status(200).json(list);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { listId } = req.params;

  await DeleteService(listId, companyId);

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-ticketList`, {
    action: "delete",
    listId: Number(listId)
  });

  return res.status(200).json({ message: "Ticket list deleted" });
};

export const listByContact = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { contactId } = req.params;
  const lists = await ListByContactService(Number(contactId), companyId);
  return res.status(200).json(lists);
};

export const syncContact = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { contactId } = req.params;
  const { listIds } = req.body;

  const lists = await SyncContactListsService({
    contactId: Number(contactId),
    companyId,
    listIds: Array.isArray(listIds) ? listIds : []
  });

  const io = getIO();
  const cid = Number(contactId);
  io.of(String(companyId)).emit(`company-${companyId}-ticketList`, {
    action: "sync",
    contactId: cid,
    lists
  });
  // Atualiza badges nos tickets abertos (F5 não precisa; realtime para outras abas)
  io.of(String(companyId)).emit(`company-${companyId}-contact`, {
    action: "update",
    contact: { id: cid, ticketLists: lists }
  });

  return res.status(200).json(lists);
};

export const addContact = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { listId } = req.params;
  const { contactId } = req.body;

  const list = await AddContactService({
    contactId: Number(contactId),
    ticketListId: Number(listId),
    companyId
  });

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-ticketList`, {
    action: "addContact",
    contactId: Number(contactId),
    list
  });

  return res.status(200).json(list);
};

export const removeContact = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { listId, contactId } = req.params;

  await RemoveContactService({
    contactId: Number(contactId),
    ticketListId: Number(listId),
    companyId
  });

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-ticketList`, {
    action: "removeContact",
    contactId: Number(contactId),
    listId: Number(listId)
  });

  return res.status(200).json({ message: "Contact removed from list" });
};
