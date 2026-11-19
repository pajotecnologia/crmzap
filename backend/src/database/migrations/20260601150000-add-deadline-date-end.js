"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("Activities", "dateEnd", {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn("leads_sales", "dateEnd", {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn("Projects", "date", {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn("Projects", "dateEnd", {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  down: async queryInterface => {
    await queryInterface.removeColumn("Activities", "dateEnd");
    await queryInterface.removeColumn("leads_sales", "dateEnd");
    await queryInterface.removeColumn("Projects", "dateEnd");
    await queryInterface.removeColumn("Projects", "date");
  }
};
