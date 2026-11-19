export type MetaDeliveryPatch = {
  ack: number;
  dataJson?: string;
};

function safeObject(raw: unknown): Record<string, any> {
  if (raw == null || raw === "") return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, any>) };
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      /* mantém o texto anterior sem descartá-lo */
    }
    return { legacyDataJson: raw.slice(0, 4000) };
  }
  return {};
}

/**
 * Atualiza ack de entrega/leitura/falha sem apagar o snapshot do template.
 * Retorna null quando o evento não deve alterar o registro.
 */
export function mergeMetaDeliveryStatus(
  message: { ack?: number | null; dataJson?: string | null },
  status: {
    status?: string;
    errors?: Array<{
      code?: number;
      title?: string;
      message?: string;
      error_data?: { details?: string };
    }>;
  }
): MetaDeliveryPatch | null {
  const current = Number(message?.ack ?? 0);
  let ack = 0;
  const name = String(status?.status || "").toLowerCase();
  if (name === "sent") ack = 1;
  if (name === "delivered") ack = 2;
  if (name === "read") ack = 3;
  if (name === "failed") ack = -1;
  if (ack === 0) return null;
  if (!(ack > current || ack === -1)) return null;

  if (ack !== -1) {
    return { ack };
  }

  const parsed = safeObject(message?.dataJson);
  const err0 = Array.isArray(status?.errors) ? status.errors[0] : null;
  const sendError = {
    code: err0?.code ?? null,
    title: err0?.title || null,
    message: err0?.message || err0?.title || "A Meta recusou a mensagem.",
    details: err0?.error_data?.details || null
  };

  if (parsed.metaTemplate && typeof parsed.metaTemplate === "object") {
    parsed.metaTemplate = { ...parsed.metaTemplate, sendError };
  } else {
    parsed.sendError = sendError;
  }

  return { ack, dataJson: JSON.stringify(parsed) };
}
