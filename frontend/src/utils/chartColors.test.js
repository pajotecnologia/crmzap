import {
  buildChartPalette,
  chartColor,
  chartColorLight,
  withChartPalette,
} from "./chartColors";

const themeWith = (chart) => ({ palette: { chart } });

describe("buildChartPalette", () => {
  it("usa a cor escolhida quando válida", () => {
    const p = buildChartPalette("#ff0000", "#3B82F6");
    expect(p.custom).toBe(true);
    expect(p.main).toBe("#ff0000");
    expect(p.light).toBe("#ff6666");
    expect(p.soft).toBe("rgba(255, 0, 0, 0.2)");
  });

  it("cai na cor de fallback sem marcar como personalizada", () => {
    const p = buildChartPalette("", "#3B82F6");
    expect(p.custom).toBe(false);
    expect(p.main).toBe("#3B82F6");
  });

  it("ignora valores inválidos", () => {
    expect(buildChartPalette("red", "#3B82F6").custom).toBe(false);
    expect(buildChartPalette(undefined, "nope").main).toBe("#3B82F6");
  });
});

describe("helpers de cor de gráfico", () => {
  const custom = themeWith(buildChartPalette("#00aa00", "#3B82F6"));
  const standard = themeWith(buildChartPalette("", "#3B82F6"));

  it("mantém as cores originais quando não há cor personalizada", () => {
    expect(chartColor(standard, "#2563EB")).toBe("#2563EB");
    expect(chartColorLight(standard, "#60A5FA")).toBe("#60A5FA");
    const palette = { blueDark: "#2563EB", blueLight: "#60A5FA", red: "#f00" };
    expect(withChartPalette(standard, palette)).toBe(palette);
  });

  it("aplica a cor personalizada nas séries", () => {
    expect(chartColor(custom, "#2563EB")).toBe("#00aa00");
    const palette = withChartPalette(custom, { blueDark: "#2563EB", blueLight: "#60A5FA", red: "#f00" });
    expect(palette.blueDark).toBe("#00aa00");
    expect(palette.red).toBe("#f00");
  });

  it("tolera tema sem paleta de gráfico", () => {
    expect(chartColor({ palette: {} }, "#123456")).toBe("#123456");
    expect(chartColor(undefined, "#123456")).toBe("#123456");
  });
});
