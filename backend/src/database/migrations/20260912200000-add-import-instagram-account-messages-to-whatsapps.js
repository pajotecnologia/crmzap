"use strict";

/**
 * Toggle: importar DMs existentes da conta Instagram (Conversations API).
 * Default false — só mensagens após a conexão (webhook).
 */
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE "Whatsapps"
      ADD COLUMN IF NOT EXISTS "importInstagramAccountMessages" BOOLEAN
      DEFAULT false NOT NULL;
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE "Whatsapps"
      DROP COLUMN IF EXISTS "importInstagramAccountMessages";
    `);
  }
};
