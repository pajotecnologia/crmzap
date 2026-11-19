/** Peer GramJS para baixar foto de perfil (privado = sender, grupo = chat). */
export function resolveGramJsProfileEntity(message: any): unknown | null {
  if (!message) return null;

  if (message.isGroup) {
    return message.chat ?? message.peerId ?? message.chatId ?? null;
  }

  return message.sender ?? message.fromId ?? null;
}
