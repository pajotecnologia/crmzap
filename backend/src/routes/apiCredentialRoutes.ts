import { Router } from "express";
import isAuth from "../middleware/isAuth";
import blockFreeTrialForbiddenIntegrations from "../middleware/blockFreeTrialForbiddenIntegrations";
import * as ApiCredentialController from "../controllers/ApiCredentialController";

const apiCredentialRoutes = Router();

apiCredentialRoutes.get(
  "/platform-api-credentials",
  isAuth,
  blockFreeTrialForbiddenIntegrations,
  ApiCredentialController.index
);

apiCredentialRoutes.get(
  "/platform-api-credentials/config",
  isAuth,
  blockFreeTrialForbiddenIntegrations,
  ApiCredentialController.config
);

apiCredentialRoutes.post(
  "/platform-api-credentials",
  isAuth,
  blockFreeTrialForbiddenIntegrations,
  ApiCredentialController.store
);

apiCredentialRoutes.delete(
  "/platform-api-credentials/:id",
  isAuth,
  blockFreeTrialForbiddenIntegrations,
  ApiCredentialController.remove
);

apiCredentialRoutes.get(
  "/platform-api-credentials/:id/reveal",
  isAuth,
  blockFreeTrialForbiddenIntegrations,
  ApiCredentialController.reveal
);

export default apiCredentialRoutes;
