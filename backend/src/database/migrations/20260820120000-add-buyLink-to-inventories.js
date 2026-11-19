"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable("Inventories");
    if (!table.buyLink) {
      await queryInterface.addColumn("Inventories", "buyLink", {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }
  },

  down: async queryInterface => {
    const table = await queryInterface.describeTable("Inventories");
    if (table.buyLink) {
      await queryInterface.removeColumn("Inventories", "buyLink");
    }
  }
};
