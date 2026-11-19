"use strict";

/**
 * Garante TicketLists + TicketListContacts (idempotente).
 * Tags de lista no ticket persistem via TicketListContacts após F5.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const normalized = (tables || []).map((t) =>
      String(typeof t === "object" && t !== null ? t.tableName || t : t).toLowerCase()
    );

    if (!normalized.includes("ticketlists")) {
      await queryInterface.createTable("TicketLists", {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        name: {
          type: Sequelize.STRING,
          allowNull: false
        },
        color: {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: "#6366F1"
        },
        companyId: {
          type: Sequelize.INTEGER,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
          allowNull: false
        },
        isDefault: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      });

      await queryInterface.addIndex("TicketLists", ["companyId"], {
        name: "TicketLists_companyId_idx"
      });

      await queryInterface.addIndex("TicketLists", ["companyId", "name"], {
        name: "TicketLists_companyId_name_unique",
        unique: true
      });
    }

    if (!normalized.includes("ticketlistcontacts")) {
      await queryInterface.createTable("TicketListContacts", {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        ticketListId: {
          type: Sequelize.INTEGER,
          references: { model: "TicketLists", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
          allowNull: false
        },
        contactId: {
          type: Sequelize.INTEGER,
          references: { model: "Contacts", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
          allowNull: false
        },
        companyId: {
          type: Sequelize.INTEGER,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
          allowNull: false
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      });

      await queryInterface.addIndex(
        "TicketListContacts",
        ["ticketListId", "contactId"],
        {
          name: "TicketListContacts_list_contact_unique",
          unique: true
        }
      );

      await queryInterface.addIndex("TicketListContacts", ["contactId"], {
        name: "TicketListContacts_contactId_idx"
      });

      await queryInterface.addIndex("TicketListContacts", ["companyId"], {
        name: "TicketListContacts_companyId_idx"
      });
    }
  },

  async down() {
    // Não remove tabelas: dados de listas dos contatos.
  }
};
