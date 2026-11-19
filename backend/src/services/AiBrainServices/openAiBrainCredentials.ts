import ListSettingsServiceOne from "../SettingServices/ListSettingsServiceOne";
import Prompt from "../../models/Prompt";

function parseAgentIntegration(raw: unknown): { apiKey: string } {
  if (!raw) return { apiKey: "" };
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return { apiKey: v?.apiKey ? String(v.apiKey).trim() : "" };
  } catch {
    return { apiKey: "" };
  }
}

export async function resolveOpenAiApiKey(companyId: number): Promise<string> {
  const integ = await ListSettingsServiceOne({ companyId, key: "agent_integration" });
  let { apiKey } = parseAgentIntegration(integ?.value);

  if (!apiKey) {
    const prompt = await Prompt.findOne({
      where: { companyId },
      attributes: ["apiKey"],
      order: [["updatedAt", "DESC"]]
    });
    if (prompt?.apiKey) {
      apiKey = String(prompt.apiKey).trim();
    }
  }

  return apiKey;
}
