import { QueryInterface } from "sequelize";
import { hash } from "bcryptjs";

const ADMIN_EMAIL = "admin@local.dev";
const ADMIN_PASSWORD = "123456";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    return queryInterface.sequelize.transaction(async t => {
      const userExists = await queryInterface.rawSelect(
        "Users",
        { where: { email: ADMIN_EMAIL }, transaction: t },
        ["id"]
      );

      if (!userExists) {
        const passwordHash = await hash(ADMIN_PASSWORD, 8);
        return queryInterface.bulkInsert(
          "Users",
          [
            {
              name: "Administrador",
              email: ADMIN_EMAIL,
              profile: "admin",
              passwordHash,
              companyId: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
              super: true
            }
          ],
          { transaction: t }
        );
      }
      return undefined;
    });
  },

  down: async (queryInterface: QueryInterface) => {
    return queryInterface.bulkDelete("Users", { email: ADMIN_EMAIL });
  }
};
