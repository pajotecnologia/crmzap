import AiBrainConversation from "../../models/AiBrainConversation";

export function assertConversationBelongsToProject(
  conversation: AiBrainConversation,
  projectId?: number
): void {
  if (
    projectId != null &&
    conversation.projectId != null &&
    Number(conversation.projectId) !== Number(projectId)
  ) {
    throw new Error("Esta conversa pertence a outro projeto Brain.");
  }
}
