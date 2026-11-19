"use strict";

/**
 * Campos de template Meta em campanhas (API Oficial).
 * Idempotente: seguro se já existir.
 * (Migrations .ts não são descobertas pelo sequelize-cli deste projeto — usar .js.)
 */
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE "Campaigns"
      ADD COLUMN IF NOT EXISTS "metaTemplateQuickMessageId" INTEGER DEFAULT NULL;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "Campaigns"
      ADD COLUMN IF NOT EXISTS "metaTemplateVariables" TEXT DEFAULT NULL;
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE "Campaigns"
      DROP COLUMN IF EXISTS "metaTemplateQuickMessageId";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "Campaigns"
      DROP COLUMN IF EXISTS "metaTemplateVariables";
    `);
  }
};
