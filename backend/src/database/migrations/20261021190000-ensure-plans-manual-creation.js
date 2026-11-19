"use strict";

/**
 * Garante a estrutura da tabela "Plans" usada pela criação manual de planos
 * (Configurações → Planos → Novo Plano, conta admin@local.dev).
 * Idempotente: só cria o que estiver faltando no banco configurado no .env.
 */

const BOOLEAN_COLUMNS = {
  useWhatsapp: true,
  useFacebook: true,
  useInstagram: true,
  useCampaigns: true,
  useSchedules: true,
  useInternalChat: true,
  useExternalApi: true,
  useKanban: true,
  useOpenAi: true,
  useIntegrations: true,
  isPublic: true,
  useWhatsappOfficial: false,
  wavoip: false,
  trial: false
};

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { sequelize } = queryInterface;

    let columns;
    try {
      columns = await queryInterface.describeTable("Plans");
    } catch {
      await queryInterface.createTable("Plans", {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        name: { type: Sequelize.STRING, allowNull: false, unique: true },
        users: { type: Sequelize.INTEGER, defaultValue: 0 },
        connections: { type: Sequelize.INTEGER, defaultValue: 0 },
        queues: { type: Sequelize.INTEGER, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false }
      });
      columns = await queryInterface.describeTable("Plans");
    }

    const addIfMissing = async (name, definition) => {
      if (!columns[name]) {
        await queryInterface.addColumn("Plans", name, definition);
        columns[name] = definition;
      }
    };

    await addIfMissing("users", { type: Sequelize.INTEGER, defaultValue: 0 });
    await addIfMissing("connections", { type: Sequelize.INTEGER, defaultValue: 0 });
    await addIfMissing("queues", { type: Sequelize.INTEGER, defaultValue: 0 });
    await addIfMissing("amount", { type: Sequelize.STRING, defaultValue: "0" });
    await addIfMissing("recurrence", { type: Sequelize.STRING, allowNull: true, defaultValue: "monthly" });
    await addIfMissing("trialDays", { type: Sequelize.INTEGER, defaultValue: 0 });

    for (const [name, defaultValue] of Object.entries(BOOLEAN_COLUMNS)) {
      await addIfMissing(name, { type: Sequelize.BOOLEAN, defaultValue });
    }

    for (const [name, defaultValue] of Object.entries(BOOLEAN_COLUMNS)) {
      await sequelize.query(`UPDATE "Plans" SET "${name}" = :value WHERE "${name}" IS NULL`, {
        replacements: { value: defaultValue }
      });
    }
    await sequelize.query(`UPDATE "Plans" SET "amount" = '0' WHERE "amount" IS NULL OR "amount" = ''`);
    await sequelize.query(`UPDATE "Plans" SET "users" = 0 WHERE "users" IS NULL`);
    await sequelize.query(`UPDATE "Plans" SET "connections" = 0 WHERE "connections" IS NULL`);
    await sequelize.query(`UPDATE "Plans" SET "queues" = 0 WHERE "queues" IS NULL`);

    if (sequelize.getDialect() === "postgres") {
      // Sequência pode ficar atrás do MAX(id) quando planos foram inseridos com id fixo.
      await sequelize.query(
        `SELECT setval(pg_get_serial_sequence('"Plans"', 'id'), (SELECT COALESCE(MAX(id), 0) + 1 FROM "Plans"), false)`
      );
    }
  },

  down: async () => {
    // Apenas garante estrutura existente; nada a desfazer.
  }
};
