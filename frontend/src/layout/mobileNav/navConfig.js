import {
  MessageSquare,
  CircleDollarSign,
  CalendarDays,
  Plug,
  Contact,
  GitBranch,
  Zap,
  Mail,
  Workflow,
  Megaphone,
  Building2,
  Package,
  CheckSquare,
  FolderKanban,
  Home,
  LayoutDashboard,
  Bot,
  Sparkles,
  Settings,
  Webhook,
  Code,
  HelpCircle,
  ShieldCheck,
  Wallet,
  Tag,
} from "lucide-react";

export const MOBILE_NAV_ROUTES = {
  tickets: "/tickets",
  contacts: "/contacts",
  sales: "/leads-sales",
  integrations: "/connections",
};

/** Rotas que contam como "ativas" para cada item da barra inferior. */
const ACTIVE_PREFIXES = {
  tickets: ["/tickets"],
  contacts: ["/contacts"],
  sales: ["/leads-sales", "/leads-convertidos", "/inventory"],
  integrations: ["/connections", "/allConnections", "/integrations", "/queue-integration"],
};

export function isPathActive(pathname, prefixes) {
  const path = String(pathname || "");
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function buildBottomItems(perms, t) {
  const items = [
    {
      key: "tickets",
      label: t("Atendimento"),
      to: MOBILE_NAV_ROUTES.tickets,
      icon: MessageSquare,
      active: ACTIVE_PREFIXES.tickets,
      badgeKey: "tickets",
    },
    {
      key: "sales",
      label: t("Vendas"),
      to: MOBILE_NAV_ROUTES.sales,
      icon: CircleDollarSign,
      active: ACTIVE_PREFIXES.sales,
    },
  ];
  if (perms.showContacts) {
    items.splice(1, 0, {
      key: "contacts",
      label: t("Contatos"),
      to: MOBILE_NAV_ROUTES.contacts,
      icon: Contact,
      active: ACTIVE_PREFIXES.contacts,
    });
  }
  items.push({
    key: "integrations",
    label: t("Integrações"),
    to: MOBILE_NAV_ROUTES.integrations,
    icon: Plug,
    active: ACTIVE_PREFIXES.integrations,
  });
  return items;
}

/** Prefixos cobertos pela barra inferior — o restante acende o botão "Mais". */
export function isCoveredByBottomItems(pathname, items) {
  return items.some((item) => isPathActive(pathname, item.active));
}

export function buildMoreSections(perms, t) {
  const sections = [
    {
      key: "attendance",
      title: t("Atendimento"),
      items: [
        { to: "/tickets", label: t("Atendimentos"), icon: MessageSquare },
        perms.showContacts && { to: "/contacts", label: t("Contatos"), icon: Contact },
        { to: "/tags", label: t("Tags"), icon: Tag },
        { to: "/quick-messages", label: t("Respostas Rápidas"), icon: Zap },
        { to: "/queues", label: t("Filas & Chatbot"), icon: GitBranch },
        { to: "/email", label: t("Email"), icon: Mail },
      ],
    },
    {
      key: "automation",
      title: t("Automação"),
      items: [
        perms.showFlow && { to: "/flowbuilders", label: t("Automações"), icon: Workflow },
        perms.showCampaigns && { to: "/campaigns", label: t("Campanhas"), icon: Megaphone },
      ],
    },
    {
      key: "sales",
      title: t("Vendas"),
      items: [
        { to: "/leads-sales", label: t("Leads e Vendas"), icon: CircleDollarSign },
        { to: "/leads-convertidos", label: t("Empresas"), icon: Building2 },
        { to: "/inventory", label: t("Inventário"), icon: Package },
      ],
    },
    {
      key: "work",
      title: t("Projetos e atividades"),
      items: [
        { to: "/activities", label: t("Atividades"), icon: CheckSquare },
        { to: "/projects", label: t("Projetos"), icon: FolderKanban },
        perms.showSchedules && { to: "/schedules", label: t("Agenda"), icon: CalendarDays },
      ],
    },
    {
      key: "analytics",
      title: t("Dashboards e análises"),
      items: [
        { to: "/", label: t("Início"), icon: Home, exact: true },
        { to: "/whatsapp-dashboard", label: t("Dashboard WhatsApp"), icon: LayoutDashboard },
      ],
    },
    {
      key: "ai",
      title: t("Inteligência artificial"),
      items: [
        perms.showAgents && { to: "/prompts", label: t("Agentes de IA"), icon: Bot },
        { to: "/brain-ai", label: "Brain.AI", icon: Sparkles },
      ],
    },
    {
      key: "settings",
      title: t("Configurações"),
      items: [
        { to: "/connections", label: t("Integrações"), icon: Plug },
        { to: "/settings", label: t("Configurações"), icon: Settings },
        perms.showPlatformApi && { to: "/platform-api", label: t("API & MCP"), icon: Webhook },
        perms.showMessagesApi && { to: "/api", label: t("API de mensagens"), icon: Code },
        perms.hasHelps && { to: "/helps", label: t("Ajuda"), icon: HelpCircle },
      ],
    },
    {
      key: "internal",
      title: t("Administração"),
      items: [
        perms.isInternalAutomationAdmin && {
          to: "/automacao-interna",
          label: t("Automação Interna"),
          icon: ShieldCheck,
        },
        perms.isInternalAutomationAdmin && {
          to: "/financeiro",
          label: t("Financeiro"),
          icon: Wallet,
        },
      ],
    },
  ];

  return sections
    .map((section) => ({ ...section, items: section.items.filter(Boolean) }))
    .filter((section) => section.items.length > 0);
}
