import { geminiGenerateContent } from "../runtime/GeminiRuntime";
import { GEMINI_DEFAULT_MODEL } from "./isGeminiModel";

export type GeminiProbeResult =
  | null
  | {
      kind: "invalid_key" | "quota" | "model" | "network" | "unknown";
      userMessage: string;
      raw: string;
    };

/**
 * Cadeia de modelos para validação automática da chave (preferido → estável leve → fallbacks).
 * Se um modelo estiver 404 (descontinuado) ou 503 (sobrecarregado), tenta o próximo automaticamente.
 */
export function buildGeminiProbeChain(preferredModel?: string): string[] {
  const chain = [
    preferredModel,
    "gemini-flash-lite-latest",
    GEMINI_DEFAULT_MODEL,
    "gemini-flash-latest",
    "gemini-3.8-flash",
    "gemini-2.5-flash-lite"
  ].filter(Boolean);
  return [...new Set(chain as string[])];
}

export async function probeGeminiApiKey(
  apiKey: string,
  preferredModel?: string
): Promise<GeminiProbeResult> {
  const models = buildGeminiProbeChain(preferredModel);
  let lastResult: GeminiProbeResult = null;

  for (const model of models) {
    try {
      await geminiGenerateContent({
        apiKey,
        model,
        messages: [{ role: "user", content: "Responda apenas: ok" }],
        maxOutputTokens: 16,
        temperature: 0
      });
      return null;
    } catch (e: any) {
      const raw = String(e?.message || e || "");
      const lower = raw.toLowerCase();

      if (lower.includes("api key") || lower.includes("api_key") || lower.includes("401") || lower.includes("unregistered callers")) {
        return {
          kind: "invalid_key",
          userMessage: "API Key Gemini inválida ou sem permissão.",
          raw
        };
      }

      if (lower.includes("quota") || lower.includes("429")) {
        return {
          kind: "quota",
          userMessage: "Cota ou limite da API Gemini excedido. Verifique o Google AI Studio.",
          raw
        };
      }

      if (
        lower.includes("not found") ||
        lower.includes("404") ||
        lower.includes("503") ||
        lower.includes("unavailable") ||
        lower.includes("high demand")
      ) {
        lastResult = {
          kind: "model",
          userMessage: "Modelo Gemini não disponível para esta chave.",
          raw
        };
        continue;
      }

      if (lower.includes("timeout") || lower.includes("network")) {
        lastResult = {
          kind: "network",
          userMessage: "Não foi possível conectar à API Gemini. Tente novamente.",
          raw
        };
        continue;
      }

      lastResult = {
        kind: "unknown",
        userMessage: `Falha ao validar API Key: ${raw.slice(0, 200)}`,
        raw
      };
    }
  }

  return lastResult;
}
