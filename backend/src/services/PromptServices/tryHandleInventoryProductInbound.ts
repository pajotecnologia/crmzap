import Contact from "../../models/Contact";
import Prompt from "../../models/Prompt";
import Ticket from "../../models/Ticket";
import PromptSmartAction from "../../models/PromptSmartAction";
import { smartActionWhereForRuntime } from "../../providers/anthropic/utils/smartActionScope";
import logger from "../../utils/logger";
import {
  buildInventoryNotFoundReply,
  classifyInventoryInboundKind,
  extractProductSearchTermFromUserText,
  inventoryActionFallbackSlugs,
  preferredInventoryActionSlug,
  userMessageLooksLikeInventoryQuery
} from "../../helpers/inventoryInboundIntent";
import {
  formatInventoryCatalogReply,
  formatInventoryProductReply,
  getAgentInventoryReplyConfig,
  resolveEffectiveInventoryReplyConfig,
  resolveInventoryMediaUrls
} from "../../helpers/formatInventoryAgentReply";
import { getAgentInventoryConfig } from "../InventoryServices/inventoryAgentHelpers";
import { executeSmartAction } from "./PromptSmartActionExecutorService";
import { normalizeTicketDataWebhook } from "../AgentProactiveServices/agentProactiveTicketState";
import { normalizeAttendanceFlowMemory } from "../../helpers/agentAttendanceFlowMemory";

export type InventoryInboundHandleResult = {
  handled: boolean;
  reply: string;
  reason?: string;
  actionSlug?: string;
  media?: {
    images: string[];
    documentUrl: string;
    documentName: string;
  };
};

/**
 * Interrompe o roteiro e consulta o inventário quando o cliente pergunta
 * preço/estoque/catálogo/link. Sempre responde (nunca silencia).
 * Respeita o template/tom/mídia configurados na aba Inventário do agente.
 */
export async function tryHandleInventoryProductInbound(params: {
  prompt: Prompt;
  ticket: Ticket;
  contact: Contact;
  userText: string;
}): Promise<InventoryInboundHandleResult> {
  const userText = String(params.userText || "").trim();
  if (!userText || !userMessageLooksLikeInventoryQuery(userText)) {
    return { handled: false, reply: "", reason: "not_inventory_query" };
  }

  const cfg = getAgentInventoryConfig(params.prompt);
  const agentReplyCfg = getAgentInventoryReplyConfig(params.prompt);

  if (cfg.enabled === false) {
    return {
      handled: true,
      reply: agentReplyCfg.resumeHint
        ? `O inventário deste agente está desativado no momento. Posso seguir com o atendimento ou transferir para um humano.\n\n${agentReplyCfg.resumeHintText}`
        : "O inventário deste agente está desativado no momento. Posso seguir com o atendimento ou transferir para um humano.",
      reason: "inventory_disabled"
    };
  }

  const kind = classifyInventoryInboundKind(userText);
  const productName = extractProductSearchTermFromUserText(userText);

  const replyFromDirectInventory = async (): Promise<InventoryInboundHandleResult | null> => {
    try {
      const {
        findOneInventoryProductForAgent,
        findInventoryProductsForAgent,
        toInventoryPublicView
      } = await import("../InventoryServices/inventoryAgentHelpers");
      const variables = {
        lastUserMessage: userText,
        productName,
        searchParam: productName,
        name: productName
      };
      if (kind === "catalog" && !productName) {
        const rows = await findInventoryProductsForAgent({
          companyId: params.ticket.companyId,
          prompt: params.prompt,
          variables,
          limit: 12
        });
        const views = rows.map(toInventoryPublicView);
        if (!views.length) return null;
        const replyCfg = resolveEffectiveInventoryReplyConfig({
          prompt: params.prompt,
          product: views[0]
        });
        return {
          handled: true,
          reply: formatInventoryCatalogReply(views, replyCfg),
          reason: "inventory_direct_catalog",
          actionSlug: "consultarprodutos",
          media: resolveInventoryMediaUrls(views[0] || null, replyCfg)
        };
      }
      const row = await findOneInventoryProductForAgent({
        companyId: params.ticket.companyId,
        prompt: params.prompt,
        variables
      });
      if (!row) return null;
      const view = toInventoryPublicView(row);
      const replyCfg = resolveEffectiveInventoryReplyConfig({
        prompt: params.prompt,
        product: view
      });
      const message = formatInventoryProductReply(view, replyCfg);
      return {
        handled: true,
        reply: message,
        reason: "inventory_direct_product",
        actionSlug: preferredInventoryActionSlug(kind),
        media: resolveInventoryMediaUrls(view, replyCfg)
      };
    } catch (e) {
      logger.warn(`[INVENTORY-INBOUND] fallback direto falhou ticket ${params.ticket.id}`, e as any);
      return null;
    }
  };

  const directFirst = await replyFromDirectInventory();
  if (directFirst?.handled && directFirst.reply) {
    await pauseRoteiroForInventorySideQuest(params.ticket, params.prompt.id);
    (params.ticket as any).__outboundForceSingleBubble = true;
    logger.info(
      JSON.stringify({
        evt: "inventory_inbound_handled",
        ticketId: params.ticket.id,
        slug: directFirst.actionSlug,
        kind,
        productName: productName || null,
        via: "direct",
        mediaImages: directFirst.media?.images?.length || 0
      })
    );
    return directFirst;
  }

  try {
    const actions = await PromptSmartAction.findAll({
      where: smartActionWhereForRuntime(params.prompt, params.ticket.companyId) as any,
      order: [["id", "ASC"]]
    });
    const enabled = actions.filter(a => a.enabled !== false);
    const slugCandidates = inventoryActionFallbackSlugs(kind);
    const resolveAction = (slugWanted: string) => {
      if (!enabled.length) return null;
      const norm = slugWanted.toLowerCase().replace(/[_-]/g, "");
      return (
        enabled.find(a => String(a.slug || "").toLowerCase().replace(/[_-]/g, "") === norm) ||
        enabled.find(a => {
          const t = String(a.type || "").toLowerCase();
          if (norm.includes("passarpreco") && (t === "preco" || t === "inventario")) return true;
          if (norm.includes("consultarproduto") && t === "consultar_produtos") return true;
          if (norm.includes("consultarestoque") && t === "consultar_estoque") return true;
          if (norm.includes("enviarlinkproduto") && t === "enviar_link_produto") return true;
          if (norm.includes("registrarintencaocompra") && t === "registrar_intencao_compra") return true;
          return false;
        }) ||
        null
      );
    };

    let action: PromptSmartAction | null = null;
    let usedSlug = "";
    for (const slug of slugCandidates) {
      action = resolveAction(slug);
      if (action) {
        usedSlug = String(action.slug || slug);
        break;
      }
    }

    if (action) {
      const variables: Record<string, unknown> = {
        lastUserMessage: userText,
        customerReply: userText,
        lastUserAnswer: userText,
        searchParam: productName || undefined,
        productName: productName || undefined,
        name: productName || undefined,
        includeLink: agentReplyCfg.includeLink
      };
      const result = await executeSmartAction(
        usedSlug,
        params.prompt,
        params.ticket,
        params.contact,
        variables,
        { smartActionId: action.id, scriptSlug: usedSlug }
      );

      // Prefer template configurado quando a ação devolveu produto no data.
      const productData = (result.data as any)?.product;
      if (productData && typeof productData === "object") {
        const {
          toInventoryPublicView
        } = await import("../InventoryServices/inventoryAgentHelpers");
        const view =
          productData.name != null
            ? (productData as any)
            : toInventoryPublicView(productData as any);
        const replyCfg = resolveEffectiveInventoryReplyConfig({
          prompt: params.prompt,
          product: view
        });
        await pauseRoteiroForInventorySideQuest(params.ticket, params.prompt.id);
        return {
          handled: true,
          reply: formatInventoryProductReply(view, replyCfg),
          reason: "inventory_grounded_template",
          actionSlug: usedSlug,
          media: resolveInventoryMediaUrls(view, replyCfg)
        };
      }

      const msg = String(result.message || "").trim();
      if (msg) {
        await pauseRoteiroForInventorySideQuest(params.ticket, params.prompt.id);
        let reply = msg;
        if (agentReplyCfg.resumeHint && !reply.includes(agentReplyCfg.resumeHintText)) {
          reply = `${reply}\n\n${agentReplyCfg.resumeHintText}`;
        }
        return {
          handled: true,
          reply,
          reason: result.success ? "inventory_grounded" : "inventory_action_message",
          actionSlug: usedSlug,
          media: {
            images: [],
            documentUrl: agentReplyCfg.sendDocument ? agentReplyCfg.documentUrl : "",
            documentName: agentReplyCfg.documentName
          }
        };
      }
    }
  } catch (e) {
    logger.warn(`[INVENTORY-INBOUND] smart action falhou ticket ${params.ticket.id}`, e as any);
  }

  await pauseRoteiroForInventorySideQuest(params.ticket, params.prompt.id);
  let notFound = buildInventoryNotFoundReply(productName);
  if (agentReplyCfg.resumeHint) {
    notFound = `${notFound}\n\n${agentReplyCfg.resumeHintText}`;
  }
  return {
    handled: true,
    reply: notFound,
    reason: "inventory_not_found_answered",
    actionSlug: preferredInventoryActionSlug(kind)
  };
}

async function pauseRoteiroForInventorySideQuest(ticket: Ticket, promptId: number): Promise<void> {
  try {
    const dw = normalizeTicketDataWebhook((ticket as any).dataWebhook) as Record<string, unknown>;
    const af = normalizeAttendanceFlowMemory(dw.attendanceFlow, promptId);
    if (!(Number(af.lastPresentedStep || 0) > 0)) return;
    const nextAf = normalizeAttendanceFlowMemory(
      {
        ...af,
        promptId,
        awaitingUserReply: true,
        flowPhase: af.flowPhase === "completed" ? "active" : af.flowPhase || "active"
      },
      promptId
    );
    const nextDw = {
      ...dw,
      attendanceFlow: nextAf,
      agentState: {
        ...((dw.agentState && typeof dw.agentState === "object" ? dw.agentState : {}) as object),
        inventorySideQuestAt: new Date().toISOString()
      }
    };
    await (ticket as any).update({ dataWebhook: nextDw } as any);
    (ticket as any).setDataValue("dataWebhook", nextDw);
  } catch (e) {
    logger.warn(`[INVENTORY-INBOUND] falha ao pausar roteiro ticket=${ticket.id}`, e as any);
  }
}

export default tryHandleInventoryProductInbound;
