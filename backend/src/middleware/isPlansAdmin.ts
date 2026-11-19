import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import User from "../models/User";
import { isPlansAdminEmail } from "../helpers/isPlansAdmin";

const isPlansAdmin = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const { id } = req.user || {};
  if (!id) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const user = await User.findByPk(id, { attributes: ["id", "email"] });
  if (!user || !isPlansAdminEmail(user.email)) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  return next();
};

export default isPlansAdmin;
