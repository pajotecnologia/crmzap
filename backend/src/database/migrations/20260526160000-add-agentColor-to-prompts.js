"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable("Prompts").catch(() => null);
    if (table && !table.agentColor) {
      await queryInterface.addColumn("Prompts", "agentColor", {
        type: Sequelize.STRING(32),
        allowNull: true,
        defaultValue: null
      });
    }
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable("Prompts").catch(() => null);
    if (table && table.agentColor) {
      await queryInterface.removeColumn("Prompts", "agentColor");
    }
  }
};
