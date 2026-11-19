import express from "express";
import isAuth from "../middleware/isAuth";
import blockFreeTrialForbiddenIntegrations from "../middleware/blockFreeTrialForbiddenIntegrations";
import * as GoogleWorkspaceController from "../controllers/GoogleWorkspaceController";

const googleWorkspaceRoutes = express.Router();

googleWorkspaceRoutes.get(
  "/google/oauth/status",
  isAuth,
  blockFreeTrialForbiddenIntegrations,
  GoogleWorkspaceController.oauthStatus
);
googleWorkspaceRoutes.get(
  "/google/oauth/authorize",
  isAuth,
  blockFreeTrialForbiddenIntegrations,
  GoogleWorkspaceController.authorize
);
googleWorkspaceRoutes.get(
  "/google/connections",
  isAuth,
  blockFreeTrialForbiddenIntegrations,
  GoogleWorkspaceController.list
);
googleWorkspaceRoutes.get(
  "/google/connections/counts",
  isAuth,
  blockFreeTrialForbiddenIntegrations,
  GoogleWorkspaceController.counts
);
googleWorkspaceRoutes.delete(
  "/google/connections/:id",
  isAuth,
  blockFreeTrialForbiddenIntegrations,
  GoogleWorkspaceController.remove
);
googleWorkspaceRoutes.get(
  "/google/connections/:connectionId/calendar/events",
  isAuth,
  blockFreeTrialForbiddenIntegrations,
  GoogleWorkspaceController.calendarEvents
);

export const googleOAuthCallbackRoutes = express.Router();
googleOAuthCallbackRoutes.get(
  "/google/oauth/callback",
  GoogleWorkspaceController.callback
);

export default googleWorkspaceRoutes;
