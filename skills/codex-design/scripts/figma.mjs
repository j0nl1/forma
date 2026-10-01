#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, main, exists, write, writeJson, slug } from "./lib/files.mjs";
import {
  loadFig,
  outline,
  select,
  renderDocument,
  renderNode,
  extractedTokens,
  nodeId,
} from "./lib/figma.mjs";
export async function importFig(mode, input, output, nodeSpec) {
  const doc = await loadFig(input);
  if (mode === "outline") return { version: doc.version, nodes: outline(doc) };
  if (!output) throw new Error("An output destination is required");
  if (await exists(output)) throw new Error(`Refusing to overwrite: ${output}`);
  const tokens = extractedTokens(doc);
  const css = `:root{\n${Object.entries(tokens)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n")}\n}\n`;
  if (mode === "render" || mode === "materialize") {
    if (!nodeSpec) throw new Error("--node <id-or-exact-name> is required");
    const rendered = renderDocument(doc, select(doc, nodeSpec));
    if (mode === "render") await write(output, rendered.html);
    else {
      await fs.mkdir(output, { recursive: true });
      await write(path.join(output, "index.html"), rendered.html);
      await write(path.join(output, "tokens.css"), css);
      await writeJson(path.join(output, "warnings.json"), rendered.warnings);
    }
    return { output: path.resolve(output), warnings: rendered.warnings };
  }
  if (mode === "mount") {
    await fs.mkdir(output, { recursive: true });
    await writeJson(path.join(output, "node-index.json"), outline(doc));
    for (const n of doc.nodes.values())
      await writeJson(path.join(output, "nodes", nodeId(n.guid) + ".json"), {
        ...n,
        children: n.children.map((c) => nodeId(c.guid)),
      });
    await writeJson(
      path.join(output, "blobs.json"),
      doc.blobs.map((b) => ({
        bytes: Buffer.from(b.bytes ?? []).toString("base64"),
      })),
    );
    for (const [name, bytes] of Object.entries(doc.images)) {
      if (!/^[a-zA-Z0-9._-]+$/.test(name))
        throw new Error("Invalid Figma asset filename");
      await write(path.join(output, "images", name), bytes);
    }
    return { output: path.resolve(output), nodes: doc.nodes.size };
  }
  if (mode === "design-system") {
    await fs.mkdir(output, { recursive: true });
    await write(path.join(output, "tokens.css"), css);
    const warnings = [];
    const examples = [...doc.nodes.values()]
      .filter((n) => n.type === "SYMBOL" || n.isStateGroup)
      .map((n) => ({
        name: n.name ?? nodeId(n.guid),
        html: renderNode(doc, n, { warnings }),
      }));
    await writeJson(path.join(output, "system.json"), {
      schemaVersion: 1,
      name: path.basename(input, ".fig"),
      slug: slug(path.basename(output)),
      css: "tokens.css",
      components: [],
      examples,
      startingPoints: [],
      guidance:
        "Imported Figma colors and component geometry. Review unsupported properties against the original.",
    });
    await writeJson(path.join(output, "warnings.json"), [...new Set(warnings)]);
    return {
      output: path.resolve(output),
      components: examples.length,
      tokens: Object.keys(tokens).length,
      warnings,
    };
  }
  throw new Error(`Unknown Figma operation: ${mode}`);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(async () => {
    const { positional: p, flags } = args(process.argv.slice(2), {
      "--node": "value",
    });
    if (
      !["outline", "mount", "render", "materialize", "design-system"].includes(
        p[0],
      ) ||
      p.length !== (p[0] === "outline" ? 2 : 3)
    )
      throw new Error(
        "Usage: node figma.mjs outline <file.fig> | mount|design-system <file.fig> <folder> | render|materialize <file.fig> <destination> --node <id-or-name>",
      );
    console.log(JSON.stringify(await importFig(...p, flags.node), null, 2));
  });
