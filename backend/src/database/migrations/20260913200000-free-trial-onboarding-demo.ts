import { QueryInterface, DataTypes } from "sequelize";

/**
 * FREE_TRIAL + onboarding + demo data registry.
 * Non-destructive: only adds columns/tables.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableNames = ["Companies", "companies"];
    let companiesTable: string | null = null;
    for (const name of tableNames) {
      try {
        await queryInterface.describeTable(name);
        companiesTable = name;
        break;
      } catch {
        /* try next */
      }
    }
    if (!companiesTable) {
      throw new Error("Companies table not found");
    }

    const desc = await queryInterface.describeTable(companiesTable);

    if (!(desc as any).accountType) {
      await queryInterface.addColumn(companiesTable, "accountType", {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null
      });
    }
    if (!(desc as any).trialStartedAt) {
      await queryInterface.addColumn(companiesTable, "trialStartedAt", {
        type: DataTypes.DATE,
        allowNull: true
      });
    }
    if (!(desc as any).trialExpiresAt) {
      await queryInterface.addColumn(companiesTable, "trialExpiresAt", {
        type: DataTypes.DATE,
        allowNull: true
      });
    }
    if (!(desc as any).trialStatus) {
      await queryInterface.addColumn(companiesTable, "trialStatus", {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null
      });
    }
    if (!(desc as any).onboardingProgress) {
      await queryInterface.addColumn(companiesTable, "onboardingProgress", {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: null
      });
    }

    // Plano Free Trial 24h com todas as features
    await queryInterface.sequelize.query(`
      INSERT INTO "Plans" (
        "name", "users", "connections", "queues", "amount",
        "useWhatsapp", "useFacebook", "useInstagram", "useCampaigns", "useSchedules",
        "useInternalChat", "useExternalApi", "useKanban",
        "trial", "trialDays", "recurrence", "useOpenAi", "useIntegrations",
        "isPublic", "useWhatsappOfficial", "wavoip", "createdAt", "updatedAt"
      ) VALUES (
        'Free Trial 24h', 50, 20, 20, '0',
        true, true, true, true, true,
        true, false, true,
        true, 1, 'free_trial', true, true,
        true, true, false, NOW(), NOW()
      )
      ON CONFLICT ("name") DO UPDATE SET
        "useWhatsapp" = true,
        "useFacebook" = true,
        "useInstagram" = true,
        "useCampaigns" = true,
        "useSchedules" = true,
        "useInternalChat" = true,
        "useExternalApi" = false,
        "useKanban" = true,
        "useOpenAi" = true,
        "useIntegrations" = true,
        "useWhatsappOfficial" = true,
        "trial" = true,
        "isPublic" = true,
        "updatedAt" = NOW();
    `);

    await queryInterface.createTable("DemoDataRecords", {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: companiesTable, key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      entityType: {
        type: DataTypes.STRING,
        allowNull: false
      },
      entityId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      isDemoData: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      meta: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex("DemoDataRecords", ["companyId"]);
    await queryInterface.addIndex("DemoDataRecords", ["entityType", "entityId"]);
    await queryInterface.addIndex("DemoDataRecords", ["companyId", "entityType"]);
  },

  down: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.dropTable("DemoDataRecords");
    } catch {
      /* ignore */
    }

    const tableNames = ["Companies", "companies"];
    for (const name of tableNames) {
      try {
        const desc = await queryInterface.describeTable(name);
        for (const col of [
          "accountType",
          "trialStartedAt",
          "trialExpiresAt",
          "trialStatus",
          "onboardingProgress"
        ]) {
          if ((desc as any)[col]) {
            await queryInterface.removeColumn(name, col);
          }
        }
        break;
      } catch {
        /* try next */
      }
    }

    await queryInterface.sequelize.query(
      `DELETE FROM "Plans" WHERE name = :name`,
      { replacements: { name: "Free Trial 24h" } }
    );
  }
};
