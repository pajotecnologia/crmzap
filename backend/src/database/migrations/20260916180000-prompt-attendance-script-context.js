"use strict";

/** Garante coluna TEXT para Contexto do roteiro (scriptContext) no Prompt. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = "Prompts";
    const desc = await queryInterface.describeTable(table).catch(() => null);
    if (!desc) return;
    if (!desc.attendanceScriptContext) {
      await queryInterface.addColumn(table, "attendanceScriptContext", {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }
  },

  async down(queryInterface) {
    const table = "Prompts";
    const desc = await queryInterface.describeTable(table).catch(() => null);
    if (!desc) return;
    if (desc.attendanceScriptContext) {
      await queryInterface.removeColumn(table, "attendanceScriptContext");
    }
  }
};
