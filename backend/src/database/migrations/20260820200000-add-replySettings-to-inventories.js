"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable("Inventories");
    if (!table.replySettings) {
      await queryInterface.addColumn("Inventories", "replySettings", {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: null
      });
    }
  },

  down: async queryInterface => {
    const table = await queryInterface.describeTable("Inventories");
    if (table.replySettings) {
      await queryInterface.removeColumn("Inventories", "replySettings");
    }
  }
};
