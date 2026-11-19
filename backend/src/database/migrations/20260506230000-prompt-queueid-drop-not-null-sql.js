"use strict";

module.exports = {
  up: async queryInterface => {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === "postgres") {
      await queryInterface.sequelize.query(
        'ALTER TABLE "Prompts" ALTER COLUMN "queueId" DROP NOT NULL;'
      );
    }
  },

  down: async queryInterface => {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === "postgres") {
      await queryInterface.sequelize.query(
        'ALTER TABLE "Prompts" ALTER COLUMN "queueId" SET NOT NULL;'
      );
    }
  }
};
