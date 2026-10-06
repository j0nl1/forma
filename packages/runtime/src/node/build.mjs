import path from "node:path";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { exists } from "../../../core/src/lib/files.mjs";
export async function bundle(
  entry,
  out,
  { globalName, overwrite = false } = {},
) {
  if (!overwrite && (await exists(out)))
    throw new Error(`Output exists: ${out}`);
  await build({
    entryPoints: [path.resolve(entry)],
    outfile: path.resolve(out),
    bundle: true,
    format: "iife",
    globalName,
    platform: "browser",
    jsx: "automatic",
    target: ["es2022"],
    loader: {
      ".svg": "dataurl",
      ".png": "dataurl",
      ".jpg": "dataurl",
      ".jpeg": "dataurl",
      ".webp": "dataurl",
      ".gif": "dataurl",
      ".woff": "dataurl",
      ".woff2": "dataurl",
    },
    nodePaths: [
      fileURLToPath(new URL("../../../../node_modules", import.meta.url)),
    ],
    logLevel: "silent",
    legalComments: "eof",
  });
}
