import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import User from "../models/User";

const isAdminEmailOnly = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const { id } = req.user || {};
  if (!id) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const user = await User.findByPk(id, { attributes: ["id", "email"] });
  if (!user || String(user.email || "").trim().toLowerCase() !== "admin@admin.com") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  return next();
};

export default isAdminEmailOnly;
