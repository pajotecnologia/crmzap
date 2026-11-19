"use strict";

const { hash } = require("bcryptjs");

const ADMIN_EMAIL = "admin@local.dev";
const ADMIN_PASSWORD = "123456";

const DEFAULT_SETTINGS = [
  ["userCreation", "enabled"],
  ["hoursCloseTicketsAuto", "9999999999"],
  ["chatBotType", "text"],
  ["acceptCallWhatsapp", "enabled"],
  ["userRandom", "enabled"],
  ["sendGreetingMessageOneQueues", "enabled"],
  ["sendSignMessage", "enabled"],
  ["sendFarewellWaitingTicket", "disabled"],
  ["userRating", "disabled"],
  ["sendGreetingAccepted", "enabled"],
  ["CheckMsgIsGroup", "enabled"],
  ["sendQueuePosition", "enabled"],
  ["scheduleType", "disabled"],
  ["acceptAudioMessageContact", "enabled"],
  ["enableLGPD", "disabled"],
  ["requiredTag", "disabled"],
  ["wtV", "disabled"],
  ["enabledLanguages", '["pt-BR","en"]']
];

async function firstId(sequelize, table, where = "") {
  const [rows] = await sequelize.query(
    `SELECT id FROM "${table}" ${where} ORDER BY id ASC LIMIT 1`
  );
  return rows && rows[0] ? rows[0].id : null;
}

module.exports = {
  up: async queryInterface => {
    const { sequelize } = queryInterface;
    const now = new Date();

    let planId = await firstId(sequelize, "Plans");
    if (!planId) {
      await queryInterface.bulkInsert("Plans", [
        {
          name: "Plano Padrão",
          users: 10,
          connections: 10,
          queues: 10,
          amount: 0,
          useWhatsapp: true,
          useFacebook: true,
          useInstagram: true,
          useCampaigns: true,
          useSchedules: true,
          useInternalChat: true,
          useExternalApi: true,
          createdAt: now,
          updatedAt: now
        }
      ]);
      planId = await firstId(sequelize, "Plans");
    }

    let companyId = await firstId(sequelize, "Companies");
    if (!companyId) {
      await queryInterface.bulkInsert("Companies", [
        {
          name: "Empresa 1",
          planId,
          createdAt: now,
          updatedAt: now
        }
      ]);
      companyId = await firstId(sequelize, "Companies");
    }

    for (const [key, value] of DEFAULT_SETTINGS) {
      try {
        const [rows] = await sequelize.query(
          `SELECT id FROM "Settings" WHERE "key" = :key AND "companyId" = :companyId LIMIT 1`,
          { replacements: { key, companyId } }
        );
        if (!rows.length) {
          await queryInterface.bulkInsert("Settings", [
            { key, value, companyId, createdAt: now, updatedAt: now }
          ]);
        }
      } catch (err) {
        console.warn(`[ensure-default-admin] setting ${key} ignorado: ${err.message}`);
      }
    }

    try {
      const [rows] = await sequelize.query(
        `SELECT "companyId" FROM "CompaniesSettings" WHERE "companyId" = :companyId LIMIT 1`,
        { replacements: { companyId } }
      );
      if (!rows.length) {
        await queryInterface.bulkInsert("CompaniesSettings", [
          {
            companyId,
            hoursCloseTicketsAuto: "9999999999",
            chatBotType: "text",
            acceptCallWhatsapp: "enabled",
            userRandom: "enabled",
            sendGreetingMessageOneQueues: "enabled",
            sendSignMessage: "enabled",
            sendFarewellWaitingTicket: "disabled",
            userRating: "disabled",
            sendGreetingAccepted: "enabled",
            CheckMsgIsGroup: "enabled",
            sendQueuePosition: "enabled",
            scheduleType: "disabled",
            acceptAudioMessageContact: "enabled",
            sendMsgTransfTicket: "enabled",
            enableLGPD: "disabled",
            requiredTag: "disabled",
            lgpdDeleteMessage: "disabled",
            lgpdHideNumber: "disabled",
            lgpdConsent: "disabled",
            lgpdLink: "",
            lgpdMessage: "",
            DirectTicketsToWallets: false,
            closeTicketOnTransfer: false,
            createdAt: now,
            updatedAt: now
          }
        ]);
      }
    } catch (err) {
      console.warn(`[ensure-default-admin] CompaniesSettings ignorado: ${err.message}`);
    }

    const [users] = await sequelize.query(
      `SELECT id FROM "Users" WHERE lower(email) = :email LIMIT 1`,
      { replacements: { email: ADMIN_EMAIL } }
    );
    if (!users.length) {
      const passwordHash = await hash(ADMIN_PASSWORD, 8);
      await queryInterface.bulkInsert("Users", [
        {
          name: "Administrador",
          email: ADMIN_EMAIL,
          profile: "admin",
          passwordHash,
          companyId,
          super: true,
          createdAt: now,
          updatedAt: now
        }
      ]);
    }
  },

  down: async queryInterface => {
    await queryInterface.bulkDelete("Users", { email: ADMIN_EMAIL });
  }
};
