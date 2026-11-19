/** GPT e Claude podem coexistir — mantido por compatibilidade (sempre false). */
export async function getAnthropicBlockingOpenAi(
  _companyId: number
): Promise<{ blocking: boolean }> {
  return { blocking: false };
}
