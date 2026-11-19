"use strict";

/**
 * Remove flags de agente IA em tickets que nunca receberam mensagem fromAgent=true.
 */
module.exports = {
  async up(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "postgres") return;

    await queryInterface.sequelize.query(`
      UPDATE "Tickets" t
      SET
        "isBot" = false,
        "useIntegration" = false,
        "integrationId" = NULL
      WHERE (t."isBot" = true OR t."useIntegration" = true)
        AND NOT EXISTS (
          SELECT 1
          FROM "Messages" m
          WHERE m."ticketId" = t.id
            AND m."fromAgent" = true
        );
    `);
  },

  async down() {
    /* não reverte correção de flags */
  }
};
