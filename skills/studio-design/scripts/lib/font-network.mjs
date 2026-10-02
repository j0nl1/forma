import { parse } from "postcss";
import { localUrl } from "./files.mjs";
import {
  fontOrigins,
  cssImport,
  cssString,
  rewriteCSSURLs,
} from "../../assets/starters/font-css.js";

export { fontOrigins };
export function fontRequestAllowed(url, method, type, origins) {
  try {
    const target = new URL(url);
    let local = false;
    try {
      localUrl(target.href);
      local = true;
    } catch {
      /* Remote origins require explicit configuration. */
    }
    return (
      ["http:", "https:"].includes(target.protocol) &&
      !target.username &&
      !target.password &&
      ["GET", "HEAD"].includes(method) &&
      ["font", "stylesheet", "fetch"].includes(type) &&
      (local || origins.includes(target.origin))
    );
  } catch {
    return false;
  }
}
export async function fulfillFontRequest(route, origins) {
  const request = route.request();
  let url = request.url(),
    response;
  for (let redirects = 0; redirects <= 20; redirects++) {
    if (
      !fontRequestAllowed(
        url,
        request.method(),
        request.resourceType(),
        origins,
      )
    )
      throw new Error(
        "A font resource or redirect leaves the configured origins",
      );
    response = await route.fetch({ url, maxRedirects: 0, timeout: 30000 });
    const headers = response.headers();
    if (
      [301, 302, 303, 307, 308].includes(response.status()) &&
      headers.location
    ) {
      url = new URL(headers.location, url).href;
      await response.dispose();
      response = undefined;
      continue;
    }
    try {
      let body = await response.body();
      if (
        request.method() !== "HEAD" &&
        (request.resourceType() === "stylesheet" ||
          /text\/css/i.test(headers["content-type"] ?? ""))
      ) {
        const css = parse(body.toString("utf8"));
        const edits = [];
        css.walkDecls((node) =>
          edits.push(
            rewriteCSSURLs(
              node.value,
              (value) => new URL(value, url).href,
            ).then((value) => {
              node.value = value;
            }),
          ),
        );
        css.walkAtRules("import", (node) => {
          const source = cssImport(node.params);
          node.params =
            node.params.slice(0, source.start) +
            cssString(new URL(source.value, url).href) +
            node.params.slice(source.end);
        });
        await Promise.all(edits);
        body = Buffer.from(css.toString());
      }
      for (const key of [
        "content-length",
        "content-encoding",
        "transfer-encoding",
      ])
        delete headers[key];
      await route.fulfill({ status: response.status(), headers, body });
      return;
    } finally {
      await response.dispose();
    }
  }
  throw new Error("A font resource exceeded twenty redirects");
}
