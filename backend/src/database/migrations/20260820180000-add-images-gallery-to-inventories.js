"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable("Inventories");
    if (!table.images) {
      await queryInterface.addColumn("Inventories", "images", {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: null
      });
    }
  },

  down: async queryInterface => {
    const table = await queryInterface.describeTable("Inventories");
    if (table.images) {
      await queryInterface.removeColumn("Inventories", "images");
    }
  }
};
