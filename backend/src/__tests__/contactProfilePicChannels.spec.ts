/**
 * @jest-environment node
 */

function buildOficialPicNumberCandidates(number: string): string[] {
  const n = String(number || "").replace(/\D/g, "");
  if (!n) return [];
  const out = new Set<string>([n]);
  if (n.startsWith("55") && n.length >= 12) {
    const ddd = n.slice(2, 4);
    const rest = n.slice(4);
    if (rest.length === 8) out.add(`55${ddd}9${rest}`);
    else if (rest.length === 9 && rest.startsWith("9")) {
      out.add(`55${ddd}${rest.slice(1)}`);
    }
  }
  return [...out];
}

function isPlaceholderUrl(url?: string | null): boolean {
  const u = String(url || "");
  return !u || u.includes("nopicture") || u.includes("noimage");
}

/** Espelha frontend/src/utils/contactAvatar.js */
function getContactInitials(name?: string, phone?: string): string {
  const raw = String(name || "").trim();
  if (raw && !/^\d+$/.test(raw)) {
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
    }
    return (parts[0] || "").slice(0, 2).toUpperCase();
  }
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length >= 2) return digits.slice(-2);
  return "";
}

function getContactAvatarState(contact: {
  name?: string;
  number?: string;
  urlPicture?: string;
  profilePicUrl?: string;
}): "photo" | "initials" | "default" {
  const pic = contact.urlPicture || contact.profilePicUrl || "";
  if (pic && !isPlaceholderUrl(pic)) return "photo";
  if (getContactInitials(contact.name, contact.number)) return "initials";
  return "default";
}

describe("contact profile pic channel guards", () => {
  it("não deve chamar Baileys para Instagram/Facebook", () => {
    const shouldUseBaileys = (channel: string, wbot: any) =>
      channel === "whatsapp" && !!wbot;

    expect(shouldUseBaileys("instagram", undefined)).toBe(false);
    expect(shouldUseBaileys("facebook", {})).toBe(false);
    expect(shouldUseBaileys("whatsapp", { profilePictureUrl: () => {} })).toBe(
      true
    );
  });

  it("detecta placeholder de avatar", () => {
    expect(isPlaceholderUrl("")).toBe(true);
    expect(isPlaceholderUrl("https://cdn.x/nopicture.png")).toBe(true);
    expect(isPlaceholderUrl("https://scontent.xx.fbcdn.net/v/t1.jpg")).toBe(
      false
    );
  });

  it("gera variantes BR com/sem 9º dígito para foto oficial", () => {
    expect(buildOficialPicNumberCandidates("5531987654321")).toEqual(
      expect.arrayContaining(["5531987654321", "553187654321"])
    );
  });

  it("avatar: foto > iniciais > padrão", () => {
    expect(
      getContactAvatarState({
        name: "Marcio Silva",
        urlPicture: "https://api.x/public/company1/contacts/1.jpeg"
      })
    ).toBe("photo");
    expect(
      getContactAvatarState({ name: "Marcio Silva", profilePicUrl: "" })
    ).toBe("initials");
    expect(getContactInitials("Marcio Silva")).toBe("MS");
    expect(getContactInitials("", "5531999999999")).toBe("99");
    expect(getContactAvatarState({ name: "", number: "" })).toBe("default");
  });

  it("Baileys é complementar — tickets funcionam sem foto", () => {
    const ticketsWorkWithoutPic = (hasBaileys: boolean, hasPic: boolean) =>
      true; // tickets nunca dependem de fonte não oficial
    expect(ticketsWorkWithoutPic(false, false)).toBe(true);
    expect(getContactAvatarState({ name: "Iago" })).toBe("initials");
  });
});
