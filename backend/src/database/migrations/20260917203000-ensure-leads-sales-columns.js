"use strict";

/**
 * Garante colunas de leads_sales usadas pelo create/update do frontend.
 * Idempotente — corrige ambientes onde migrations antigas falharam ou não rodaram.
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

async function tableExists(queryInterface, table) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = :table
      LIMIT 1`,
    { replacements: { table } }
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function safeAdd(queryInterface, table, column, sqlType) {
  if (await columnExists(queryInterface, table, column)) return;
  await queryInterface.sequelize.query(
    `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${sqlType}`
  );
}

module.exports = {
  up: async (queryInterface) => {
    if (!(await tableExists(queryInterface, "leads_sales"))) {
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS "leads_sales" (
          "id" SERIAL PRIMARY KEY,
          "name" VARCHAR(255) NOT NULL,
          "description" TEXT NULL,
          "status" VARCHAR(255) NULL,
          "value" INTEGER NULL DEFAULT 0,
          "contactId" INTEGER NULL REFERENCES "Contacts"("id") ON UPDATE CASCADE ON DELETE SET NULL,
          "responsibleId" INTEGER NULL REFERENCES "Users"("id") ON UPDATE SET NULL ON DELETE SET NULL,
          "date" TIMESTAMP WITH TIME ZONE NULL,
          "companyId" INTEGER NOT NULL REFERENCES "Companies"("id") ON UPDATE CASCADE ON DELETE CASCADE,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
        )
      `);
    }

    await safeAdd(queryInterface, "leads_sales", "companyName", "VARCHAR(255) NULL");
    await safeAdd(queryInterface, "leads_sales", "phone", "VARCHAR(255) NULL");
    await safeAdd(queryInterface, "leads_sales", "email", "VARCHAR(255) NULL");
    await safeAdd(queryInterface, "leads_sales", "site", "VARCHAR(255) NULL");
    await safeAdd(queryInterface, "leads_sales", "origin", "VARCHAR(255) NULL");
    await safeAdd(queryInterface, "leads_sales", "document", "VARCHAR(255) NULL");
    await safeAdd(queryInterface, "leads_sales", "birthDate", "TIMESTAMP WITH TIME ZONE NULL");
    await safeAdd(queryInterface, "leads_sales", "address", "JSONB NULL");
    await safeAdd(queryInterface, "leads_sales", "tags", "JSONB NULL");
    await safeAdd(queryInterface, "leads_sales", "products", "JSONB NULL");
    await safeAdd(queryInterface, "leads_sales", "attribution", "JSONB NULL");
    await safeAdd(queryInterface, "leads_sales", "dateEnd", "TIMESTAMP WITH TIME ZONE NULL");
    await safeAdd(queryInterface, "leads_sales", "pipelineId", "INTEGER NULL");

    // FK pipelineId (ignora se já existir)
    try {
      await queryInterface.sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'leads_sales_pipelineId_fkey'
          ) THEN
            ALTER TABLE "leads_sales"
              ADD CONSTRAINT "leads_sales_pipelineId_fkey"
              FOREIGN KEY ("pipelineId") REFERENCES "LeadPipelines"("id")
              ON UPDATE CASCADE ON DELETE SET NULL;
          END IF;
        EXCEPTION WHEN undefined_table THEN
          NULL;
        END $$;
      `);
    } catch (_) {
      /* LeadPipelines pode não existir ainda em ambientes legados */
    }
  },

  down: async () => {
    // no-op: ensure migration
  }
};
