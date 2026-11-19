module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE "Companies"
      ADD COLUMN IF NOT EXISTS "signupMetadata" JSONB DEFAULT NULL;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "Companies"
      ADD COLUMN IF NOT EXISTS "whiteLabelHostDomain" VARCHAR(255) DEFAULT NULL;
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE "Companies"
      DROP COLUMN IF EXISTS "whiteLabelHostDomain";
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "Companies"
      DROP COLUMN IF EXISTS "signupMetadata";
    `);
  }
};
