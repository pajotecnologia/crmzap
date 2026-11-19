import { QueryInterface, DataTypes } from "sequelize";

/**
 * Cache de foto de perfil: timestamp da última atualização (opcional).
 * Idempotente: não quebra se a coluna já existir.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table = (await queryInterface.describeTable("Contacts")) as Record<
      string,
      unknown
    >;
    if (!table.profilePictureUpdatedAt) {
      await queryInterface.addColumn("Contacts", "profilePictureUpdatedAt", {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const table = (await queryInterface.describeTable("Contacts")) as Record<
      string,
      unknown
    >;
    if (table.profilePictureUpdatedAt) {
      await queryInterface.removeColumn("Contacts", "profilePictureUpdatedAt");
    }
  }
};
