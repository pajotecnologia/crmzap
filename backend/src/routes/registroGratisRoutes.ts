import { Router } from "express";
import isAuth from "../middleware/isAuth";
import isAdminEmailOnly from "../middleware/isAdminEmailOnly";
import * as RegistroGratisController from "../controllers/RegistroGratisController";

const registroGratisRoutes = Router();

registroGratisRoutes.get("/registro-gratis", isAuth, isAdminEmailOnly, RegistroGratisController.index);
registroGratisRoutes.get("/registro-gratis/:id", isAuth, isAdminEmailOnly, RegistroGratisController.show);
registroGratisRoutes.put("/registro-gratis/:id", isAuth, isAdminEmailOnly, RegistroGratisController.update);
registroGratisRoutes.delete("/registro-gratis/:id", isAuth, isAdminEmailOnly, RegistroGratisController.remove);
registroGratisRoutes.post("/registro-gratis/trigger", isAuth, isAdminEmailOnly, RegistroGratisController.trigger);

export default registroGratisRoutes;
