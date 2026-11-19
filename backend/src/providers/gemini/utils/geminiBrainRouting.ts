import { assertBrainPlatformKey } from "../../../services/AiBrainServices/brainPlatformCredentials";
import { isGeminiModelId, normalizeGeminiModelId } from "./isGeminiModel";

export function geminiBrainProviderFromModel(model?: string | null): "gemini" | null {
  return isGeminiModelId(model) ? "gemini" : null;
}

export async function assertGeminiBrainModelAvailable(
  _companyId: number,
  model?: string | null
): Promise<{ provider: "gemini"; modelId: string }> {
  const modelId = normalizeGeminiModelId(model);
  if (!isGeminiModelId(modelId)) {
    throw new Error("Modelo não é Gemini.");
  }
  assertBrainPlatformKey("gemini");
  return { provider: "gemini", modelId };
}

export function resolveGeminiBrainApiKey(): string {
  return assertBrainPlatformKey("gemini");
}
