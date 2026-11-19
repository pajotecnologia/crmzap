import Queue from "../../models/Queue";
import User from "../../models/User";

const SYSTEM_QUEUE_NAME = "Geral";
const SYSTEM_QUEUE_COLOR = "#6366f1";

const associateAllCompanyUsers = async (systemQueue: Queue, companyId: number) => {
  const users = await User.findAll({
    where: { companyId },
    attributes: ["id"]
  });

  if (users.length > 0) {
    await systemQueue.$set(
      "users",
      users.map(u => u.id)
    );
  }
};

/**
 * Garante uma fila interna para conexões no modo Simples (sem filas).
 * Reaproveita "Geral" existente / qualquer fila da empresa se o create falhar
 * (unique name/color), para o Avançar não quebrar a criação da conexão.
 */
const EnsureSystemQueueService = async (companyId: number): Promise<Queue> => {
  let systemQueue = await Queue.findOne({
    where: { companyId, isSystem: true }
  });

  if (!systemQueue) {
    const namedGeral = await Queue.findOne({
      where: { companyId, name: SYSTEM_QUEUE_NAME }
    });
    if (namedGeral) {
      if (!namedGeral.isSystem) {
        await namedGeral.update({ isSystem: true });
      }
      systemQueue = namedGeral;
    }
  }

  if (!systemQueue) {
    try {
      systemQueue = await Queue.create({
        name: SYSTEM_QUEUE_NAME,
        color: SYSTEM_QUEUE_COLOR,
        companyId,
        isSystem: true,
        ativarRoteador: false,
        tempoRoteador: 0,
        orderQueue: 0,
        closeTicket: false,
        typeRandomMode: "RANDOM",
        randomizeImmediate: false,
        greetingMessage: "",
        outOfHoursMessage: "",
        sendQueueEntryMessage: false,
        queueEntryMessage: ""
      } as any);
    } catch (err) {
      systemQueue =
        (await Queue.findOne({
          where: { companyId, name: SYSTEM_QUEUE_NAME }
        })) ||
        (await Queue.findOne({
          where: { companyId },
          order: [["id", "ASC"]]
        }));

      if (!systemQueue) {
        throw err;
      }

      if (!systemQueue.isSystem) {
        await systemQueue.update({ isSystem: true });
      }
    }
  }

  await associateAllCompanyUsers(systemQueue, companyId);

  return systemQueue;
};

export default EnsureSystemQueueService;
