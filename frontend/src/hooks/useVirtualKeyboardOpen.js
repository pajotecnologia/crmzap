import { useEffect, useState } from "react";

const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

export function isTextEditable(el) {
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return !el.readOnly && !el.disabled;
  if (tag === "SELECT") return false;
  if (tag === "INPUT") {
    const type = String(el.type || "text").toLowerCase();
    return !NON_TEXT_INPUTS.has(type) && !el.readOnly && !el.disabled;
  }
  return false;
}

/**
 * Ao focar um campo em telas de toque, rola até ele quando o teclado virtual
 * o esconde (iOS não redimensiona o layout; Android às vezes não rola).
 */
export function useKeepFocusedFieldVisible(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    const coarse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    if (!coarse) return undefined;

    let timer = null;
    const ensureVisible = (el) => {
      if (!el || !el.isConnected || document.activeElement !== el) return;
      const rect = el.getBoundingClientRect();
      const vv = window.visualViewport;
      const viewTop = vv ? vv.offsetTop : 0;
      const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const margin = 16;
      if (rect.top < viewTop + margin || rect.bottom > viewBottom - margin) {
        try {
          el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        } catch {
          el.scrollIntoView(false);
        }
      }
    };
    const onFocusIn = (event) => {
      const el = event.target;
      if (!isTextEditable(el)) return;
      if (el.closest && el.closest("[data-keep-focus-scroll='off']")) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => ensureVisible(el), 320);
    };
    const onViewportResize = () => {
      const el = document.activeElement;
      if (isTextEditable(el)) ensureVisible(el);
    };

    document.addEventListener("focusin", onFocusIn);
    window.visualViewport?.addEventListener("resize", onViewportResize);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("focusin", onFocusIn);
      window.visualViewport?.removeEventListener("resize", onViewportResize);
    };
  }, [enabled]);
}

/**
 * true enquanto um campo de texto está focado em dispositivo de toque
 * (teclado virtual aberto). Usado para tirar elementos fixos do caminho.
 */
export default function useVirtualKeyboardOpen(enabled = true) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setOpen(false);
      return undefined;
    }
    const coarse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    if (!coarse) {
      setOpen(false);
      return undefined;
    }

    let blurTimer = null;
    const onFocusIn = (event) => {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }
      setOpen(isTextEditable(event.target));
    };
    const onFocusOut = () => {
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        setOpen(isTextEditable(document.activeElement));
      }, 120);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [enabled]);

  return open;
}
