import { readFileSync, writeFileSync } from "node:fs";

const replacements = [
  {
    file: "dist/esm/core/abi.js",
    from: [
      "// eslint-disable-next-line @typescript-eslint/no-require-imports",
      "const abiData = require(\"./abi_data.json\");",
    ].join("\n"),
    to: "import abiData from \"./abi_data.json\" with { type: \"json\" };",
  },
  {
    file: "dist/esm/chains/index.js",
    from: [
      "// eslint-disable-next-line @typescript-eslint/no-require-imports",
      "const rawChainData = require(\"./all_chains.json\");",
    ].join("\n"),
    to: "import rawChainData from \"./all_chains.json\" with { type: \"json\" };",
  },
];

for (const replacement of replacements) {
  const before = readFileSync(replacement.file, "utf8");
  if (!before.includes(replacement.from)) {
    throw new Error(`Expected JSON require pattern not found in ${replacement.file}`);
  }
  writeFileSync(replacement.file, before.replace(replacement.from, replacement.to));
  console.log(`  fixed JSON import in ${replacement.file}`);
}
