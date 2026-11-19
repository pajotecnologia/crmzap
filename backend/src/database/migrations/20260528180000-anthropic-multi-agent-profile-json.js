"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable("AnthropicMultiAgents").catch(() => null);
    if (!table) return;
    if (!table.profileJson) {
      await queryInterface.addColumn("AnthropicMultiAgents", "profileJson", {
        type: Sequelize.JSONB,
        allowNull: true
      });
    }
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable("AnthropicMultiAgents").catch(() => null);
    if (table?.profileJson) {
      await queryInterface.removeColumn("AnthropicMultiAgents", "profileJson");
    }
  }
};
