import { buildCatalogSite } from "../packages/catalog/src/site.mjs";
console.log(
  JSON.stringify(await buildCatalogSite(process.argv[2] ?? "designs/catalog")),
);
