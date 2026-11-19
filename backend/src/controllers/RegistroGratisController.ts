import { Request, Response } from "express";
import RegistroGratis from "../models/RegistroGratis";
import executeFreeTrialAutomation from "../services/FreeTrialServices/FreeTrialAutomationService";
import AppError from "../errors/AppError";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber } = req.query as {
    searchParam?: string;
    pageNumber?: string;
  };

  const limit = 20;
  const offset = limit * (Math.max(1, Number(pageNumber || 1)) - 1);

  const where: any = {};
  if (searchParam) {
    const term = `%${searchParam.trim().toLowerCase()}%`;
    const { Op } = require("sequelize");
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { email: { [Op.iLike]: term } },
      { phone: { [Op.iLike]: term } },
      { statusAutomation: { [Op.iLike]: term } }
    ];
  }

  const { count, rows } = await RegistroGratis.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]]
  });

  const hasMore = count > offset + rows.length;

  return res.json({
    records: rows,
    count,
    hasMore
  });
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const record = await RegistroGratis.findByPk(id);

  if (!record) {
    throw new AppError("Registro não encontrado", 404);
  }

  return res.json(record);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const record = await RegistroGratis.findByPk(id);

  if (!record) {
    throw new AppError("Registro não encontrado", 404);
  }

  const { name, email, phone, statusWhatsapp, statusEmail, statusAutomation, logs } = req.body;

  await record.update({
    name: name !== undefined ? name : record.name,
    email: email !== undefined ? email : record.email,
    phone: phone !== undefined ? phone : record.phone,
    statusWhatsapp: statusWhatsapp !== undefined ? statusWhatsapp : record.statusWhatsapp,
    statusEmail: statusEmail !== undefined ? statusEmail : record.statusEmail,
    statusAutomation: statusAutomation !== undefined ? statusAutomation : record.statusAutomation,
    logs: logs !== undefined ? logs : record.logs
  });

  return res.json(record);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const record = await RegistroGratis.findByPk(id);

  if (!record) {
    throw new AppError("Registro não encontrado", 404);
  }

  await record.destroy();

  return res.json({ message: "Registro excluído com sucesso" });
};

export const trigger = async (req: Request, res: Response): Promise<Response> => {
  const { name, email, phone } = req.body;

  if (!name || !email || !phone) {
    throw new AppError("Nome, e-mail e telefone são obrigatórios para a automação.", 400);
  }

  const result = await executeFreeTrialAutomation({ name, email, phone });

  return res.json({
    message: "Automação executada com sucesso",
    record: result
  });
};
