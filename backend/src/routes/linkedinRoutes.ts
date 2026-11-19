import express from "express";
import isAuth from "../middleware/isAuth";
import { enforceConnectionQuota } from "../middleware/planQuota";
import * as LinkedInController from "../controllers/LinkedInController";
import * as LinkedInWebhookController from "../controllers/LinkedInWebhookController";

const linkedinRoutes = express.Router();

linkedinRoutes.post(
  "/linkedin/connection",
  isAuth,
  enforceConnectionQuota,
  LinkedInController.store
);
linkedinRoutes.put("/linkedin/connection", isAuth, LinkedInController.store);
linkedinRoutes.post("/linkedin/test", isAuth, LinkedInController.test);
linkedinRoutes.get(
  "/linkedin/connection/:id",
  isAuth,
  LinkedInController.show
);
linkedinRoutes.delete(
  "/linkedin/:whatsappId",
  isAuth,
  LinkedInController.remove
);

export const linkedinWebhookRoutes = express.Router();
linkedinWebhookRoutes.post(
  "/linkedin/webhook/:companyId/:connectionId",
  LinkedInWebhookController.webhook
);

export default linkedinRoutes;
