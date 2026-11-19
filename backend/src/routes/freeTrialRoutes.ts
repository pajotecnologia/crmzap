import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as FreeTrialController from "../controllers/FreeTrialController";

const freeTrialRoutes = Router();

/** Cadastro público do teste grátis */
freeTrialRoutes.post("/auth/signup/teste-gratis", FreeTrialController.register);
freeTrialRoutes.post("/register/teste-gratis", FreeTrialController.register);

freeTrialRoutes.get("/free-trial/status", isAuth, FreeTrialController.status);
freeTrialRoutes.get(
  "/free-trial/integrations",
  isAuth,
  FreeTrialController.integrations
);
freeTrialRoutes.get(
  "/free-trial/onboarding",
  isAuth,
  FreeTrialController.onboardingGet
);
freeTrialRoutes.post(
  "/free-trial/onboarding",
  isAuth,
  FreeTrialController.onboardingPost
);
freeTrialRoutes.post(
  "/free-trial/seed-demo-data",
  isAuth,
  FreeTrialController.seedDemo
);
freeTrialRoutes.get(
  "/free-trial/demo-records",
  isAuth,
  FreeTrialController.listDemoRecords
);

export default freeTrialRoutes;
