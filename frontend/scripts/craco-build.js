#!/usr/bin/env node
/**
 * Build de produção sem cross-env (CI/Linux não têm devDependencies no PATH).
 */
const { spawnSync } = require("child_process");
const path = require("path");

process.env.CI = "false";
process.env.DISABLE_ESLINT_PLUGIN = "true";
process.env.NODE_OPTIONS = "--max-old-space-size=6144";
process.env.GENERATE_SOURCEMAP = "false";
process.env.INLINE_RUNTIME_CHUNK = "false";

const root = path.join(__dirname, "..");
const cracoPkg = require.resolve("@craco/craco/package.json", { paths: [root] });
const cracoBin = path.join(path.dirname(cracoPkg), "dist", "bin", "craco.js");

console.log("[craco-build] Iniciando build com 6GB de heap para VPS com 16GB de memoria...");

const result = spawnSync(process.execPath, [cracoBin, "build"], {
  stdio: "inherit",
  env: process.env,
  cwd: root
});

if (result.error) {
  console.error("[craco-build] Erro:", result.error);
}
if (result.signal) {
  console.error("[craco-build] Processo interrompido por sinal do sistema:", result.signal);
}
if (result.status !== 0 && result.status !== null) {
  console.error("[craco-build] Finalizado com codigo de erro:", result.status);
}

process.exit(result.status === 0 ? 0 : result.status || 1);
