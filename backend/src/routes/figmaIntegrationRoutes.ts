import express from "express";
import isAuth from "../middleware/isAuth";
import * as C from "../controllers/FigmaIntegrationController";

const r = express.Router();

r.get("/integrations/figma", isAuth, C.show);
r.post("/integrations/figma", isAuth, C.create);
r.put("/integrations/figma", isAuth, C.update);
r.post("/integrations/figma/test", isAuth, C.postTest);

export default r;
