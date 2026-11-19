"use strict";

/**
 * Fluxos de automação Instagram: resposta pública e private reply (comentário → DM).
 * Idempotente.
 */
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE "Whatsapps"
      ADD COLUMN IF NOT EXISTS "flowIdIgCommentReply" INTEGER
      REFERENCES "FlowBuilders" ("id")
      ON UPDATE CASCADE
      ON DELETE SET NULL;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "Whatsapps"
      ADD COLUMN IF NOT EXISTS "flowIdIgCommentDm" INTEGER
      REFERENCES "FlowBuilders" ("id")
      ON UPDATE CASCADE
      ON DELETE SET NULL;
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE "Whatsapps" DROP COLUMN IF EXISTS "flowIdIgCommentDm";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "Whatsapps" DROP COLUMN IF EXISTS "flowIdIgCommentReply";
    `);
  }
};
