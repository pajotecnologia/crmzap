"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    const names = tables.map(t => (typeof t === "string" ? t : t.tableName || t));
    if (names.includes("FreeTrialIpSignups")) return;

    await queryInterface.createTable("FreeTrialIpSignups", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      ipHash: {
        type: Sequelize.STRING,
        allowNull: false
      },
      companyId: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "reserved"
      },
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex("FreeTrialIpSignups", ["ipHash", "status"], {
      name: "free_trial_ip_signups_ip_status_idx"
    });
    await queryInterface.addIndex("FreeTrialIpSignups", ["companyId"], {
      name: "free_trial_ip_signups_company_idx"
    });
  },

  down: async queryInterface => {
    const tables = await queryInterface.showAllTables();
    const names = tables.map(t => (typeof t === "string" ? t : t.tableName || t));
    if (!names.includes("FreeTrialIpSignups")) return;
    await queryInterface.dropTable("FreeTrialIpSignups");
  }
};
