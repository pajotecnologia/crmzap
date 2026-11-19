"use strict";

/**
 * Atribuição Meta/Google Ads em Contatos, Tickets e Leads de vendas.
 * Idempotente (ADD COLUMN IF NOT EXISTS).
 */

async function columnExists(queryInterface, table, column) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = :table
        AND column_name = :column
      LIMIT 1`,
    { replacements: { table, column } }
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function safeAddJson(queryInterface, table, column) {
  if (await columnExists(queryInterface, table, column)) return;
  await queryInterface.sequelize.query(
    `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" JSONB NULL`
  );
}

module.exports = {
  up: async (queryInterface) => {
    await safeAddJson(queryInterface, "Contacts", "attribution");
    await safeAddJson(queryInterface, "Tickets", "attribution");
    await safeAddJson(queryInterface, "leads_sales", "attribution");
  },

  down: async (queryInterface) => {
    const drop = async (table, column) => {
      if (!(await columnExists(queryInterface, table, column))) return;
      await queryInterface.removeColumn(table, column);
    };
    await drop("Contacts", "attribution");
    await drop("Tickets", "attribution");
    await drop("leads_sales", "attribution");
  }
};
