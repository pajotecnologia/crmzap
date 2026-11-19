import sequelize from "../../database";
import Inventory from "../../models/Inventory";
import LeadSale from "../../models/LeadSale";
import logger from "../../utils/logger";
import { computeInventoryStatus } from "./inventoryAgentHelpers";

type SaleProductLine = {
  id?: number | string;
  inventoryId?: number | string;
  productId?: number | string;
  qty?: number | string;
  quantity?: number | string;
  name?: string;
};

export type StockDecrementResult = {
  decremented: Array<{ inventoryId: number; name: string; qty: number; remaining: number }>;
  skipped: Array<{ reason: string; product?: SaleProductLine }>;
  warnings: string[];
};

function normalizeLines(products: unknown): SaleProductLine[] {
  if (!Array.isArray(products)) return [];
  return products.filter(p => p && typeof p === "object") as SaleProductLine[];
}

function resolveProductId(line: SaleProductLine): number | null {
  const raw = line.id ?? line.inventoryId ?? line.productId;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveQty(line: SaleProductLine): number {
  const raw = line.qty ?? line.quantity ?? 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.floor(n);
}

/**
 * Baixa estoque ao fechar uma venda (LeadSale won).
 * Nunca permite quantidade negativa — reduz no máximo até zero e registra warning.
 */
export async function decrementInventoryOnSaleWon(
  sale: LeadSale
): Promise<StockDecrementResult> {
  const result: StockDecrementResult = { decremented: [], skipped: [], warnings: [] };
  const lines = normalizeLines((sale as any).products);
  if (!lines.length) {
    return result;
  }

  const companyId = Number(sale.companyId);
  await sequelize.transaction(async transaction => {
    for (const line of lines) {
      const inventoryId = resolveProductId(line);
      if (!inventoryId) {
        result.skipped.push({ reason: "produto_sem_id", product: line });
        continue;
      }
      const qtyWanted = resolveQty(line);
      const row = await Inventory.findOne({
        where: { id: inventoryId, companyId },
        transaction,
        lock: (transaction as any).LOCK?.UPDATE
      });
      if (!row) {
        result.skipped.push({ reason: "produto_nao_encontrado", product: line });
        continue;
      }

      const current = Math.max(0, Number(row.quantity) || 0);
      if (current <= 0) {
        result.warnings.push(
          `Produto "${row.name}" já estava esgotado; venda ${sale.id} não reduziu estoque.`
        );
        await row.update(
          { quantity: 0, status: "out_of_stock" },
          { transaction }
        );
        continue;
      }

      const qtyApplied = Math.min(current, qtyWanted);
      if (qtyApplied < qtyWanted) {
        result.warnings.push(
          `Produto "${row.name}": solicitados ${qtyWanted}, disponíveis ${current}. Estoque zerado (sem negativo).`
        );
      }

      const remaining = current - qtyApplied;
      await row.update(
        {
          quantity: remaining,
          status: computeInventoryStatus(remaining)
        },
        { transaction }
      );

      result.decremented.push({
        inventoryId: row.id,
        name: String(row.name || ""),
        qty: qtyApplied,
        remaining
      });
    }
  });

  if (result.decremented.length || result.warnings.length) {
    logger.info(
      JSON.stringify({
        evt: "inventory_stock_decrement_on_sale_won",
        leadSaleId: sale.id,
        companyId,
        decremented: result.decremented,
        skipped: result.skipped,
        warnings: result.warnings
      })
    );
  }

  return result;
}

export default decrementInventoryOnSaleWon;
