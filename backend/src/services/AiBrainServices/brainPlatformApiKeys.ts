import { assertBrainPlatformKey } from "./brainPlatformCredentials";

export function resolveBrainOpenAiApiKey(): string {
  return assertBrainPlatformKey("openai");
}

export function resolveBrainAnthropicApiKey(): string {
  return assertBrainPlatformKey("anthropic");
}

export function resolveBrainGeminiApiKey(): string {
  return assertBrainPlatformKey("gemini");
}

export function resolveBrainGrokApiKey(): string {
  return assertBrainPlatformKey("grok");
}
