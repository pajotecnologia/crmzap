"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable("Prompts");

    if (!table.cargo) {
      await queryInterface.addColumn("Prompts", "cargo", {
        type: Sequelize.JSON,
        allowNull: true
      });
    }

    if (!table.cerebro) {
      await queryInterface.addColumn("Prompts", "cerebro", {
        type: Sequelize.JSON,
        allowNull: true
      });
    }

    if (!table.produtividade) {
      await queryInterface.addColumn("Prompts", "produtividade", {
        type: Sequelize.JSON,
        allowNull: true
      });
    }

    if (!table.midias) {
      await queryInterface.addColumn("Prompts", "midias", {
        type: Sequelize.JSON,
        allowNull: true
      });
    }
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable("Prompts");

    if (table.midias) {
      await queryInterface.removeColumn("Prompts", "midias");
    }
    if (table.produtividade) {
      await queryInterface.removeColumn("Prompts", "produtividade");
    }
    if (table.cerebro) {
      await queryInterface.removeColumn("Prompts", "cerebro");
    }
    if (table.cargo) {
      await queryInterface.removeColumn("Prompts", "cargo");
    }
  }
};
