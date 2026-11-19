import { Request, Response } from "express";
import { Op } from "sequelize";
import Inventory from "../models/Inventory";
import XLSX from "xlsx";

type IndexQuery = {
  searchParam?: string;
  pageNumber?: string;
};

const MAX_GALLERY_IMAGES = 12;

function normalizeGalleryImages(input: unknown, fallbackCover?: unknown): {
  images: string[] | null;
  image: string | null;
} {
  const list: string[] = [];
  if (Array.isArray(input)) {
    for (const item of input) {
      const s = String(item || "").trim();
      if (s && (s.startsWith("data:image") || s.startsWith("http://") || s.startsWith("https://"))) {
        list.push(s);
      }
      if (list.length >= MAX_GALLERY_IMAGES) break;
    }
  }
  const cover = String(fallbackCover || list[0] || "").trim() || null;
  if (cover && !list.includes(cover)) {
    list.unshift(cover);
  }
  return {
    images: list.length ? list.slice(0, MAX_GALLERY_IMAGES) : null,
    image: cover
  };
}

function normalizeReplySettings(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { searchParam, pageNumber } = req.query as IndexQuery;

  const where: any = { companyId };
  if (searchParam) {
    where.name = { [Op.iLike]: `%${searchParam}%` };
  }

  const limit = 20;
  const page = +(pageNumber || 1);
  const offset = limit * (page - 1);

  const { rows, count } = await Inventory.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]]
  });

  const hasMore = count > offset + rows.length;
  return res.json({ inventory: rows, count, hasMore });
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const record = await Inventory.findOne({ where: { id, companyId } });
  if (!record) {
    return res.status(404).json({ error: "Not found" });
  }
  return res.json(record);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    name,
    price,
    quantity,
    status,
    currency,
    image,
    images,
    sku,
    category,
    brand,
    description,
    buyLink,
    replySettings
  } = req.body;

  const qty = Math.max(0, Number(quantity ?? 0) || 0);
  let computedStatus = status;
  if (!computedStatus) {
    if (qty <= 0) computedStatus = "out_of_stock";
    else if (qty > 0 && qty <= 5) computedStatus = "low_stock";
    else computedStatus = "in_stock";
  }

  const gallery = normalizeGalleryImages(images, image);

  const record = await Inventory.create({
    name,
    price,
    quantity: qty,
    currency: currency || "BRL",
    image: gallery.image,
    images: gallery.images,
    sku: sku || null,
    category: category || null,
    brand: brand || null,
    description: description || null,
    buyLink: buyLink ? String(buyLink).trim() : null,
    replySettings: normalizeReplySettings(replySettings),
    status: computedStatus,
    companyId
  });

  return res.status(201).json(record);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const data = { ...req.body };
  const record = await Inventory.findOne({ where: { id, companyId } });
  if (!record) {
    return res.status(404).json({ error: "Not found" });
  }
  if (data.quantity != null) {
    const qty = Math.max(0, Number(data.quantity) || 0);
    data.quantity = qty;
    if (!data.status) {
      if (qty <= 0) data.status = "out_of_stock";
      else if (qty <= 5) data.status = "low_stock";
      else data.status = "in_stock";
    }
  }
  if (data.buyLink !== undefined) {
    data.buyLink = data.buyLink ? String(data.buyLink).trim() : null;
  }
  if (data.images !== undefined || data.image !== undefined) {
    const gallery = normalizeGalleryImages(data.images, data.image);
    data.images = gallery.images;
    data.image = gallery.image;
  }
  if (data.replySettings !== undefined) {
    data.replySettings = normalizeReplySettings(data.replySettings);
  }
  await record.update(data);
  return res.json(record);
};

/** Aplica a mesma personalização de resposta a vários produtos (em massa). */
export const bulkUpdateReplySettings = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0)
    : [];
  const replySettings = normalizeReplySettings(req.body?.replySettings);
  if (!ids.length) {
    return res.status(400).json({ error: "Informe ids dos produtos" });
  }
  if (!replySettings) {
    return res.status(400).json({ error: "Informe replySettings" });
  }

  const [updated] = await Inventory.update(
    { replySettings },
    { where: { companyId, id: { [Op.in]: ids } } }
  );

  const rows = await Inventory.findAll({
    where: { companyId, id: { [Op.in]: ids } },
    order: [["name", "ASC"]]
  });

  return res.json({ updated, inventory: rows });
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const record = await Inventory.findOne({ where: { id, companyId } });
  if (!record) {
    return res.status(404).json({ error: "Not found" });
  }
  await record.destroy();
  return res.status(200).json({ message: "Inventory deleted" });
};

/** Exclui vários produtos em massa (hard delete). */
export const bulkRemove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const ids: number[] = Array.from(
    new Set(
      rawIds
        .map((n: unknown) => Number(n))
        .filter((n: number) => Number.isFinite(n) && n > 0)
    )
  );

  if (!ids.length) {
    return res.status(400).json({ error: "Informe ids dos produtos" });
  }
  if (ids.length > 500) {
    return res.status(400).json({ error: "Máximo de 500 produtos por exclusão" });
  }

  const records = await Inventory.findAll({
    where: { companyId, id: { [Op.in]: ids } },
    attributes: ["id"]
  });

  if (!records.length) {
    return res.status(404).json({ error: "Nenhum produto encontrado" });
  }

  const deletedIds: number[] = [];
  for (const record of records) {
    await record.destroy();
    deletedIds.push(record.id);
  }

  return res.status(200).json({
    message: `${deletedIds.length} produto(s) excluído(s)`,
    deletedCount: deletedIds.length,
    ids: deletedIds
  });
};

export const importFile = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const file = (req as any).file;
  if (!file) {
    return res.status(400).json({ error: "File is required" });
  }
  try {
    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const items = rows.map((r) => {
      const name = String(r.name || r.Nome || r.Item || "").trim();
      const price = Number(r.price ?? r.Preco ?? r.Valor ?? 0) || 0;
      const quantity = Number(r.quantity ?? r.Quantidade ?? r.Qtd ?? 0) || 0;
      const currency = String(r.currency || r.Moeda || "BRL").toUpperCase();
      const status = String(r.status || r.Status || "") || undefined;
      const sku = r.sku || r.SKU || r.Codigo || null;
      const category = r.category || r.Categoria || null;
      const brand = r.brand || r.Marca || null;
      const description = r.description || r.Descricao || null;
      const image = r.image || r.Imagem || null;
      const buyLink = r.buyLink || r.buy_link || r.Link || r.link || null;
      const safeQty = Math.max(0, quantity);

      let computedStatus = status;
      if (!computedStatus) {
        if (safeQty <= 0) computedStatus = "out_of_stock";
        else if (safeQty > 0 && safeQty <= 5) computedStatus = "low_stock";
        else computedStatus = "in_stock";
      }
      return {
        name,
        price,
        quantity: safeQty,
        currency,
        status: computedStatus,
        sku,
        category,
        brand,
        description,
        image,
        buyLink: buyLink ? String(buyLink).trim() : null,
        companyId
      };
    }).filter(i => i.name);

    if (!items.length) {
      return res.status(400).json({ error: "No valid rows" });
    }

    const created = await Inventory.bulkCreate(items, { returning: true });
    return res.status(201).json({ created: created.length, items: created });
  } catch (err) {
    return res.status(500).json({ error: "Failed to import file" });
  }
};
