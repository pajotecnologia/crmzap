import express from "express";
import isAuth from "../middleware/isAuth";
import isPlansAdmin from "../middleware/isPlansAdmin";

import * as PlanController from "../controllers/PlanController";

const planRoutes = express.Router();

planRoutes.get("/plans", isAuth, isPlansAdmin, PlanController.index);
planRoutes.get("/plans/list", isAuth, isPlansAdmin, PlanController.list);
planRoutes.get("/plans/all", isAuth, isPlansAdmin, PlanController.list);
planRoutes.get("/plans/:id", isAuth, isPlansAdmin, PlanController.show);
planRoutes.post("/plans", isAuth, isPlansAdmin, PlanController.store);
planRoutes.put("/plans/:id", isAuth, isPlansAdmin, PlanController.update);
planRoutes.delete("/plans/:id", isAuth, isPlansAdmin, PlanController.remove);

// Public endpoint for registration (no auth). Returns public plans when listPublic === "false"
planRoutes.get("/public/plans", PlanController.list);

export default planRoutes;
