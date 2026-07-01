import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("dist/esm", { recursive: true });
writeFileSync("dist/esm/package.json", `${JSON.stringify({ type: "module" }, null, 2)}\n`);
console.log("  wrote dist/esm/package.json");
