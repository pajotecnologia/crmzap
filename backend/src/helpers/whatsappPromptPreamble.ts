/** Préâmbulo do system prompt no WhatsApp: reforça uso exclusivo deste registro Prompt. */
export function buildWhatsappPromptScopePreamble(prompt: {
  id: number;
  name?: string | null;
}): string {
  const label = String(prompt.name || "").trim() || "Agente";
  return [
    "--- Agente ativo (exclusivo desta conexão) ---",
    `ID do agente (prompt): ${prompt.id}`,
    `Nome: ${label}`,
    "Regras de isolamento (obrigatório):",
    "- Use somente o texto deste agente: Regras Gerais, roteiro (etapas/script), FAQ, cérebro/base, actions e file_search quando existir para ESTE promptId.",
    "- Não invente preços, prazos, políticas, nomes de produtos, nem dados de outra empresa, outro agente ou conhecimento genérico que não apareça nesses blocos.",
    "- Se algo não estiver escrito aqui, diga que não tem essa informação no material do agente ou transfira para um atendente humano conforme as regras — não preencha lacunas com suposições.",
    "- Interprete intenções (sinônimos, abreviações, erros de digitação); não exija que o cliente repita frases literais do roteiro.",
    "---",
    ""
  ].join("\n");
}
