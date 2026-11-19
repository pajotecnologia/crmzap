/**
 * Detecta recusa / adiamento / desinteresse do cliente (PT-BR),
 * inclusive formas suaves que o roteiro costuma tratar como “sim” por engano.
 */

function stripDiacritics(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeIntentText(text: string): string {
  return stripDiacritics(text).replace(/\s+/g, " ").trim();
}

/**
 * Cliente sinaliza que NÃO quer seguir agora: recusa, desinteresse ou adiamento.
 * Exemplos: "não", "acho que não", "não quero", "pode ser depois", "talvez depois".
 */
export function userExpressesSoftDeclineOrDeferral(text: string): boolean {
  const t = normalizeIntentText(text);
  if (!t) return false;

  /** Aceite claro — não tratar como recusa. */
  if (
    /^(sim|claro|pode\s+sim|com\s+certeza|quero\s+sim|bora|fechado|combinado|ok\s*,?\s*pode)\b/.test(t) &&
    !/\b(nao|depois|talvez|futuramente)\b/.test(t)
  ) {
    return false;
  }

  const patterns = [
    /^(nao|n|negativo|jamais|nope|nah)\b/,
    /\bacho\s+que\s+nao\b/,
    /\bacho\s+melhor\s+nao\b/,
    /\bmelhor\s+nao\b/,
    /\bnao\s+sei\s+(se\s+)?(quero|desejo|preciso)\b/,
    /\bnao\s+sei\s+que\s+quero\b/,
    /\bna\s+verdade\s+nao\b/,
    /\bnao\s+quero\b/,
    /\bnao\s+tenho\s+interesse\b/,
    /\bsem\s+interesse\b/,
    /\bagora\s+nao\b/,
    /\bnao\s+por\s+agora\b/,
    /\bprefiro\s+nao\b/,
    /\bnao\s+preciso\b/,
    /\btalvez\s+depois\b/,
    /\bpode\s+ser\s+depois\b/,
    /\bdepois\s+eu\s+(vejo|volto|chamo|falo)\b/,
    /\bmais\s+tarde\b/,
    /\bem\s+outro\s+momento\b/,
    /\bquem\s+sabe(?:\s+futuramente)?\b/,
    /\bfuturamente\b/,
    /\bdeixa\s+(pra|para)\s+(depois|la|lá)\b/,
    /\bnao\s+(vai\s+rolar|rola|da|dá)\b/,
    /\boutro\s+dia\b/,
    /\bnao\s+agora\b/,
    /\bobrigad[oa]\s*,?\s*nao\b/
  ];
  return patterns.some((p) => p.test(t));
}

/** Resposta do agente que finge ter marcado reunião / horário sem o cliente ter aceito. */
export function assistantTextFalselyConfirmsSchedule(text: string): boolean {
  const t = normalizeIntentText(text);
  if (!t) return false;
  const patterns = [
    /\bhorario\s+combinado\b/,
    /\breuniao\s+combinada\b/,
    /\blink\s+da\s+reuniao\b/,
    /\benvio\s+o\s+link\b/,
    /\bte\s+envio\s+o\s+link\b/,
    /\bvou\s+deixar\s+separado\b/,
    /\bj[aá]\s+(esta|tá|ta)\s+agendad[oa]\b/,
    /\bagendei\s+(para|pra|o)\b/,
    /\bmarcamos\s+(para|pra|entao|então)\b/,
    /\bate\s+la\b/,
    /\bate\s+l[aá]\b/,
    /\bconfirmado\s+(o\s+)?(horario|agendamento|reuniao)\b/
  ];
  return patterns.some((p) => p.test(t));
}

export function buildSoftDeclineDeferralReply(userText: string): string {
  const t = normalizeIntentText(userText);
  const isDefer =
    /\b(depois|mais\s+tarde|futuramente|outro\s+momento|outro\s+dia|talvez)\b/.test(t) &&
    !/\bnao\s+tenho\s+interesse\b/.test(t) &&
    !/\bsem\s+interesse\b/.test(t);

  if (isDefer) {
    return "Tranquilo — sem pressão. Quando fizer sentido pra você, é só me chamar por aqui e a gente retoma.";
  }
  return "Entendi, sem problemas. Se mudar de ideia ou quiser só tirar uma dúvida depois, pode me chamar por aqui.";
}
