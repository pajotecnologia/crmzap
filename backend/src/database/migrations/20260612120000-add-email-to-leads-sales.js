"use strict";

/** E-mail do lead de venda — campo já enviado pelo frontend. Idempotente. */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable("leads_sales").catch(() => ({}));
    if (table && table.email) return;
    try {
      await queryInterface.addColumn("leads_sales", "email", {
        type: Sequelize.STRING,
        allowNull: true
      });
    } catch (e) {
      const msg = String(e?.message || "");
      if (!/already exists|duplicate/i.test(msg)) throw e;
    }
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable("leads_sales").catch(() => ({}));
    if (!table || !table.email) return;
    await queryInterface.removeColumn("leads_sales", "email");
  }
};
