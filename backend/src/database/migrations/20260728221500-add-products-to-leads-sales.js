"use strict";

/** Produtos do negócio (carrinho) persistidos no lead de venda. Idempotente. */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable("leads_sales").catch(() => ({}));
    if (table && table.products) return;
    try {
      await queryInterface.addColumn("leads_sales", "products", {
        type: Sequelize.JSON,
        allowNull: true,
        defaultValue: null
      });
    } catch (e) {
      const msg = String(e?.message || "");
      if (!/already exists|duplicate/i.test(msg)) throw e;
    }
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable("leads_sales").catch(() => ({}));
    if (!table || !table.products) return;
    await queryInterface.removeColumn("leads_sales", "products");
  }
};
