const HEX_RE = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/;

function hexToRgb(hex) {
  let h = String(hex).replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixWithWhite(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  const toHex = (c) => c.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * `custom: false` quando a empresa não escolheu cor de gráfico: os gráficos mantêm as cores originais.
 */
export function buildChartPalette(hex, fallbackHex) {
  const custom = Boolean(hex && HEX_RE.test(hex));
  const main = custom ? hex : fallbackHex;
  const safe = HEX_RE.test(main || "") ? main : "#3B82F6";
  return {
    custom,
    main: safe,
    light: mixWithWhite(safe, 0.4),
    soft: withAlpha(safe, 0.2),
  };
}

export function chartColor(theme, fallback) {
  const c = theme?.palette?.chart;
  return c?.custom ? c.main : fallback;
}

export function chartColorLight(theme, fallback) {
  const c = theme?.palette?.chart;
  return c?.custom ? c.light : fallback;
}

export function chartColorSoft(theme, fallback) {
  const c = theme?.palette?.chart;
  return c?.custom ? c.soft : fallback;
}

/** Paletas de dashboard (`blueDark` = série principal, `blueLight` = secundária). */
export function withChartPalette(theme, palette) {
  const c = theme?.palette?.chart;
  if (!c?.custom) return palette;
  return { ...palette, blueDark: c.main, blueLight: c.light };
}
