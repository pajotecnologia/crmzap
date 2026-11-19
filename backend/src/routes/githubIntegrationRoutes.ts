import express from "express";
import isAuth from "../middleware/isAuth";
import * as C from "../controllers/GithubIntegrationController";

const r = express.Router();

r.get("/integrations/github", isAuth, C.show);
r.post("/integrations/github", isAuth, C.create);
r.put("/integrations/github", isAuth, C.update);
r.delete("/integrations/github", isAuth, C.destroy);
r.post("/integrations/github/test", isAuth, C.postTest);
r.get("/integrations/github/repos", isAuth, C.listRepos);
r.get("/integrations/github/oauth/meta", isAuth, C.oauthMeta);
r.get("/integrations/github/oauth/authorize", isAuth, C.orgAuthorize);

export default r;
