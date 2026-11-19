import { v4 as uuidv4 } from "uuid";
import DemoDataRecord from "../../models/DemoDataRecord";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import Whatsapp from "../../models/Whatsapp";
import Prompt from "../../models/Prompt";
import PromptFaqItem from "../../models/PromptFaqItem";
import PromptSmartAction from "../../models/PromptSmartAction";
import LeadSale from "../../models/LeadSale";
import Activity from "../../models/Activity";
import Project from "../../models/Project";
import Inventory from "../../models/Inventory";
import Schedule from "../../models/Schedule";
import Tag from "../../models/Tag";
import TicketTag from "../../models/TicketTag";

type SeedParams = {
  companyId: number;
  userId: number;
};

async function markDemo(
  companyId: number,
  entityType: string,
  entityId: number,
  meta?: Record<string, unknown>
) {
  await DemoDataRecord.create({
    companyId,
    entityType,
    entityId,
    isDemoData: true,
    meta: meta || null
  } as any);
}

const DEMO_AVATAR = (seed: string) =>
  `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}`;

const SALES_AGENT_PROMPT = `Você é o Agente de Vendas do VBSolution CRM (demonstração).
Objetivo: Atender clientes, identificar necessidades, apresentar produtos e serviços, responder dúvidas, qualificar leads e conduzir o cliente para uma oportunidade de venda.
Use apenas informações disponíveis no inventário, FAQ e roteiro. Não invente preços ou condições.`;

const GENERAL_RULES = `Regras gerais do Agente de Vendas (demo):
Seja educado e objetivo.
Entenda a necessidade antes de oferecer.
Não invente informações.
Utilize apenas informações disponíveis (FAQ, inventário, roteiro).
Identifique intenção de compra.
Qualifique o lead (necessidade, orçamento, prazo, autoridade).
Registre informações relevantes.
Encaminhe para humano quando necessário.
Não prometa condições que não estejam cadastradas.`;

const ATTENDANCE_SCRIPT = `Roteiro de vendas (demo):
1. Saudação: cumprimente e apresente-se.
2. Identificação do cliente: confirme nome e contexto.
3. Descoberta da necessidade: faça perguntas abertas.
4. Qualificação: entenda fit e urgência.
5. Apresentação da solução: use inventário e benefícios.
6. Tratamento de objeções: responda com fatos.
7. Oferta: proponha o próximo passo comercial.
8. Próximo passo: agende follow-up ou envie proposta.
9. Encerramento: agradeça e confirme o combinado.`;

const SeedFreeTrialDemoDataService = async ({
  companyId,
  userId
}: SeedParams): Promise<{ promptId: number; seeded: string[] }> => {
  const seeded: string[] = [];
  let promptId = 0;

  const existingTickets = await DemoDataRecord.findOne({
    where: { companyId, entityType: "ticket" }
  });
  if (existingTickets) {
    const existingPrompt = await DemoDataRecord.findOne({
      where: { companyId, entityType: "prompt" }
    });
    return {
      promptId: existingPrompt?.entityId || 0,
      seeded: ["already_seeded"]
    };
  }

  const wa = await Whatsapp.create({
    name: `Demo WhatsApp Web ${companyId}`,
    status: "DISCONNECTED",
    isDefault: true,
    companyId,
    channel: "whatsapp",
    token: uuidv4()
  } as any);
  await markDemo(companyId, "whatsapp", wa.id, { channel: "whatsapp" });
  seeded.push("whatsapp");

  const tagInterest = await Tag.create({
    name: "Demo Interesse",
    color: "#0D9488",
    companyId
  } as any);
  const tagPrice = await Tag.create({
    name: "Demo Preco",
    color: "#F59E0B",
    companyId
  } as any);
  const tagReady = await Tag.create({
    name: "Demo Pronto",
    color: "#22C55E",
    companyId
  } as any);
  await markDemo(companyId, "tag", tagInterest.id);
  await markDemo(companyId, "tag", tagPrice.id);
  await markDemo(companyId, "tag", tagReady.id);
  seeded.push("tags");

  // 2 tickets em Atendendo (open) + 1 em Aguardando (pending)
  const clients = [
    {
      name: "Ana Demo",
      number: `55000000001${companyId}`.slice(0, 15),
      email: `ana.demo.${companyId}@example.invalid`,
      seed: "ana-demo",
      status: "open" as const,
      tag: tagInterest,
      msgs: [
        { fromMe: false, body: "Olá! Quero saber mais sobre o Produto A." },
        {
          fromMe: true,
          body: "Olá Ana! Claro, o Produto A é ideal para começar. Posso te explicar?"
        },
        { fromMe: false, body: "Sim, por favor." }
      ]
    },
    {
      name: "Bruno Demo",
      number: `55000000002${companyId}`.slice(0, 15),
      email: `bruno.demo.${companyId}@example.invalid`,
      seed: "bruno-demo",
      status: "pending" as const,
      tag: tagPrice,
      msgs: [
        { fromMe: false, body: "Quanto custa o plano Growth?" },
        {
          fromMe: true,
          body: "O Produto B, Growth, está em R$ 597 nesta demonstração."
        }
      ]
    },
    {
      name: "Carla Demo",
      number: `55000000003${companyId}`.slice(0, 15),
      email: `carla.demo.${companyId}@example.invalid`,
      seed: "carla-demo",
      status: "open" as const,
      tag: tagReady,
      msgs: [
        { fromMe: false, body: "Quero fechar o Enterprise ainda hoje." },
        {
          fromMe: true,
          body: "Perfeito! Vou preparar a proposta de demonstração."
        }
      ]
    }
  ];

  for (const c of clients) {
    const contact = await Contact.create({
      name: c.name,
      number: c.number,
      email: c.email,
      profilePicUrl: DEMO_AVATAR(c.seed),
      companyId,
      channel: "whatsapp",
      whatsappId: wa.id,
      active: true
    } as any);
    await markDemo(companyId, "contact", contact.id, { demoLabel: true });

    const last = c.msgs[c.msgs.length - 1]?.body || "";
    const ticket = await Ticket.create({
      status: c.status,
      unreadMessages: c.msgs.filter(m => !m.fromMe).length,
      lastMessage: last,
      contactId: contact.id,
      whatsappId: wa.id,
      companyId,
      userId: c.status === "open" ? userId : null,
      isBot: false,
      channel: "whatsapp",
      queueId: null
    } as any);
    await markDemo(companyId, "ticket", ticket.id);

    try {
      await TicketTag.create({
        ticketId: ticket.id,
        tagId: c.tag.id
      } as any);
    } catch {
      /* optional */
    }

    let t = Date.now() - 3600000;
    for (const m of c.msgs) {
      t += 120000;
      try {
        const msg = await Message.create({
          wid: uuidv4(),
          ticketId: ticket.id,
          contactId: contact.id,
          companyId,
          body: m.body,
          fromMe: m.fromMe,
          read: true,
          ack: 3,
          mediaType: "chat",
          remoteJid: `${c.number}@s.whatsapp.net`,
          createdAt: new Date(t),
          updatedAt: new Date(t)
        } as any);
        await markDemo(companyId, "message", msg.id);
      } catch (msgErr) {
        console.warn("free_trial seed message:", msgErr);
      }
    }
  }
  seeded.push("tickets");

  try {
    const prompt = await Prompt.create({
      name: "Agente de Vendas",
      prompt: SALES_AGENT_PROMPT,
      apiKey: "demo-not-used",
      maxMessages: 10,
      maxTokens: 2200,
      temperature: 1,
      model: "gpt-4o-mini",
      voice: "texto",
      companyId,
      description:
        "Agente de demonstração pré configurado para atendimento e vendas.",
      role: "Vendas",
      language: "pt-BR",
      emojisEnabled: true,
      generalRules: GENERAL_RULES,
      attendanceScript: ATTENDANCE_SCRIPT,
      faqEnabled: true,
      knowledgeEnabled: true,
      agentColor: "#0D9488",
      cargo: {
        objective:
          "Atender clientes, identificar necessidades, apresentar produtos e serviços, responder dúvidas, qualificar leads e conduzir o cliente para uma oportunidade de venda.",
        isDemo: true
      },
      cerebro: { isDemo: true, providers: ["gpt", "claude", "gemini", "grok"] },
      produtividade: { isDemo: true }
    } as any);
    promptId = prompt.id;
    await markDemo(companyId, "prompt", prompt.id, { name: "Agente de Vendas" });
    seeded.push("prompt");

    const faqs = [
      [
        "O que é o sistema?",
        "O VBSolution CRM é uma plataforma completa de atendimento, vendas e automação com IA."
      ],
      [
        "Como funciona?",
        "Você conecta canais (WhatsApp, Instagram etc.), configura agentes e atende leads em um só lugar."
      ],
      [
        "Quais canais posso integrar?",
        "WhatsApp Web, WhatsApp API Oficial, Telegram, Facebook e Instagram (no teste grátis)."
      ],
      [
        "Como funciona o atendimento?",
        "Conversas chegam no Multiatendimento; a equipe ou a IA responde com histórico e tags."
      ],
      [
        "O que é um lead?",
        "É um contato potencial de compra, acompanhado no funil de Leads/Vendas."
      ]
    ];
    for (let i = 0; i < faqs.length; i++) {
      const [question, answer] = faqs[i];
      const faq = await PromptFaqItem.create({
        companyId,
        promptId: prompt.id,
        question,
        answer,
        category: "demo",
        priority: i
      } as any);
      await markDemo(companyId, "faq", faq.id);
    }
    seeded.push("faq");

    const actions = [
      {
        name: "Consultar lead",
        type: "crm_lookup_lead",
        description: "Consulta dados do lead no CRM."
      },
      {
        name: "Criar atividade",
        type: "crm_create_activity",
        description: "Cria atividade de follow-up."
      },
      {
        name: "Encaminhar atendimento",
        type: "transfer_human",
        description: "Encaminha para atendimento humano."
      }
    ];
    for (const a of actions) {
      const row = await PromptSmartAction.create({
        companyId,
        promptId: prompt.id,
        name: a.name,
        type: a.type,
        description: a.description,
        triggerType: "intent",
        enabled: true,
        confirm: false,
        autoExecute: false
      } as any);
      await markDemo(companyId, "smart_action", row.id);
    }
    seeded.push("actions");
  } catch (agentErr) {
    console.warn("free_trial seed agent:", agentErr);
  }

  try {
    const products = [
      {
        name: "Produto A Starter",
        price: 297,
        quantity: 50,
        sku: "DEMO-A-001",
        category: "Planos",
        description: "Plano inicial para pequenas equipes."
      },
      {
        name: "Produto B Growth",
        price: 597,
        quantity: 30,
        sku: "DEMO-B-002",
        category: "Planos",
        description: "Plano intermediário com automações."
      },
      {
        name: "Produto C Enterprise",
        price: 1297,
        quantity: 15,
        sku: "DEMO-C-003",
        category: "Planos",
        description: "Plano completo com IA e multi canais."
      }
    ];
    for (const p of products) {
      const inv = await Inventory.create({
        ...p,
        currency: "BRL",
        status: "active",
        brand: "VBSolution Demo",
        companyId,
        source: "demo"
      } as any);
      await markDemo(companyId, "inventory", inv.id);
    }
    seeded.push("inventory");
  } catch (invErr) {
    console.warn("free_trial seed inventory:", invErr);
  }

  try {
    const leads = [
      {
        name: "Lead Demo Alpha",
        status: "new",
        value: 297,
        origin: "WhatsApp",
        phone: "11999990001",
        email: `lead.a.${companyId}@example.invalid`,
        tags: ["demo", "quente"]
      },
      {
        name: "Lead Demo Beta",
        status: "qualified",
        value: 597,
        origin: "Instagram",
        phone: "11999990002",
        email: `lead.b.${companyId}@example.invalid`,
        tags: ["demo"]
      },
      {
        name: "Lead Demo Gama",
        status: "proposal",
        value: 1297,
        origin: "Indicação",
        phone: "11999990003",
        email: `lead.c.${companyId}@example.invalid`,
        tags: ["demo", "enterprise"]
      }
    ];
    for (const l of leads) {
      const lead = await LeadSale.create({
        ...l,
        description: "Lead fictício de demonstração do teste grátis.",
        companyName: "Empresa Demo",
        companyId,
        responsibleId: userId
      } as any);
      await markDemo(companyId, "lead", lead.id);
    }
    seeded.push("leads");

    const project = await Project.create({
      name: "Projeto Demo Implantacao CRM",
      description: "Projeto fictício para demonstrar gestão operacional.",
      status: "in_progress",
      progress: 45,
      date: new Date(),
      dateEnd: new Date(Date.now() + 14 * 86400000),
      companyId,
      userId
    } as any);
    await markDemo(companyId, "project", project.id);
    seeded.push("projects");

    const activities = [
      { title: "Ligar para cliente (demo)", type: "call", status: "pending" },
      { title: "Enviar proposta (demo)", type: "task", status: "pending" },
      {
        title: "Follow-up comercial (demo)",
        type: "follow_up",
        status: "in_progress"
      },
      { title: "Reunião de demonstração", type: "meeting", status: "pending" }
    ];
    for (const a of activities) {
      const act = await Activity.create({
        ...a,
        description: "Atividade fictícia de demonstração.",
        date: new Date(Date.now() + 86400000),
        dateEnd: new Date(Date.now() + 2 * 86400000),
        owner: "Demo",
        companyId,
        userId,
        projectId: project.id,
        eventColor: "#0D9488"
      } as any);
      await markDemo(companyId, "activity", act.id);
    }
    seeded.push("activities");

    const events = [
      "Reunião comercial (demo)",
      "Follow-up (demo)",
      "Demonstração do produto (demo)"
    ];
    for (let i = 0; i < events.length; i++) {
      const sch = await Schedule.create({
        body: events[i],
        sendAt: new Date(Date.now() + (i + 1) * 86400000),
        companyId,
        userId,
        status: "PENDENTE"
      } as any);
      await markDemo(companyId, "schedule", sch.id);
    }
    seeded.push("schedules");
  } catch (extraErr) {
    console.warn("free_trial seed extras:", extraErr);
  }

  return { promptId, seeded };
};

export default SeedFreeTrialDemoDataService;
