"use strict";

/**
 * Repara conexões WhatsApp sem nome e tickets órfãos (whatsappId null)
 * quando existe conexão CONNECTED do mesmo canal/empresa.
 */
module.exports = {
  up: async (queryInterface) => {
    const sequelize = queryInterface.sequelize;

    // Nomes vazios quebram formulários/Yup ("name is a required field")
    await sequelize.query(`
      UPDATE "Whatsapps"
      SET "name" = CONCAT('Conexão ', id::text)
      WHERE "name" IS NULL OR btrim("name") = '';
    `);

    // Reata tickets abertos/pendentes órfãos à conexão CONNECTED padrão (ou mais recente) do canal
    await sequelize.query(`
      WITH ranked AS (
        SELECT
          w.id AS "whatsappId",
          w."companyId",
          COALESCE(NULLIF(btrim(w.channel), ''), 'whatsapp') AS channel,
          ROW_NUMBER() OVER (
            PARTITION BY w."companyId", COALESCE(NULLIF(btrim(w.channel), ''), 'whatsapp')
            ORDER BY w."isDefault" DESC NULLS LAST, w."updatedAt" DESC NULLS LAST, w.id DESC
          ) AS rn
        FROM "Whatsapps" w
        WHERE w.status = 'CONNECTED'
      ),
      pick AS (
        SELECT "whatsappId", "companyId", channel
        FROM ranked
        WHERE rn = 1
      )
      UPDATE "Tickets" t
      SET "whatsappId" = p."whatsappId",
          "updatedAt" = NOW()
      FROM pick p
      WHERE t."companyId" = p."companyId"
        AND COALESCE(NULLIF(btrim(t.channel), ''), 'whatsapp') = p.channel
        AND t."whatsappId" IS NULL
        AND t.status IN ('open', 'pending', 'group');
    `);
  },

  down: async () => {
    // Irreversível de forma segura (nomes gerados / rebinds)
  }
};
