"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable("Whatsapps");
    if (!table.anthropicMultiAgentId) {
      await queryInterface.addColumn("Whatsapps", "anthropicMultiAgentId", {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null
      });
    }
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable("Whatsapps");
    if (table.anthropicMultiAgentId) {
      await queryInterface.removeColumn("Whatsapps", "anthropicMultiAgentId");
    }
  }
};
