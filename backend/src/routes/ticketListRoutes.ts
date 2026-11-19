import express from "express";
import isAuth from "../middleware/isAuth";
import * as TicketListController from "../controllers/TicketListController";

const routes = express.Router();

routes.get("/ticket-lists", isAuth, TicketListController.index);
routes.post("/ticket-lists", isAuth, TicketListController.store);
routes.put("/ticket-lists/:listId", isAuth, TicketListController.update);
routes.delete("/ticket-lists/:listId", isAuth, TicketListController.remove);

routes.get(
  "/ticket-lists/contact/:contactId",
  isAuth,
  TicketListController.listByContact
);
routes.post(
  "/ticket-lists/contact/:contactId/sync",
  isAuth,
  TicketListController.syncContact
);
routes.post(
  "/ticket-lists/:listId/contacts",
  isAuth,
  TicketListController.addContact
);
routes.delete(
  "/ticket-lists/:listId/contacts/:contactId",
  isAuth,
  TicketListController.removeContact
);

export default routes;
