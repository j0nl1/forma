import {
  cssQuoted,
  cssUnescape,
} from "../../../runtime/src/browser/font-css.js";

export function splitCSS(value, delimiter = ",") {
  const result = [];
  let from = 0,
    depth = 0;
  for (let index = 0; index < value.length; index++) {
    const quoted = cssQuoted(value, index);
    if (quoted) {
      index = quoted.end - 1;
      continue;
    }
    if (value.startsWith("/*", index)) {
      const end = value.indexOf("*/", index + 2);
      index = end < 0 ? value.length : end + 1;
      continue;
    }
    if (value[index] === "(") depth++;
    if (value[index] === ")") depth--;
    if (!depth && value[index] === delimiter) {
      result.push(value.slice(from, index).trim());
      from = index + 1;
    }
  }
  result.push(value.slice(from).trim());
  return result;
}
export function cssVariables(value) {
  const result = [];
  for (let index = 0; index < value.length; index++) {
    const quoted = cssQuoted(value, index);
    if (quoted) {
      index = quoted.end - 1;
      continue;
    }
    if (value.startsWith("/*", index)) {
      const end = value.indexOf("*/", index + 2);
      index = end < 0 ? value.length : end + 1;
      continue;
    }
    if (
      !value.startsWith("var(", index) ||
      (index && /[\w-]/.test(value[index - 1]))
    )
      continue;
    const start = index;
    let depth = 1,
      end = index + 4;
    for (; end < value.length && depth; end++) {
      const string = cssQuoted(value, end);
      if (string) {
        end = string.end - 1;
        continue;
      }
      if (value.startsWith("/*", end)) {
        const finish = value.indexOf("*/", end + 2);
        end = finish < 0 ? value.length : finish + 1;
        continue;
      }
      if (value[end] === "(") depth++;
      if (value[end] === ")") depth--;
    }
    if (depth) continue;
    const parts = splitCSS(value.slice(index + 4, end - 1));
    result.push({
      start,
      end,
      name: cssUnescape(parts[0].replace(/\/\*[\s\S]*?\*\//g, "").trim()),
      fallback: parts.length > 1 ? parts.slice(1).join(", ") : null,
    });
    index = end - 1;
  }
  return result;
}
export function resolveTokens(tokens) {
  const issues = new Set();
  function resolve(value, chain = []) {
    let output = value;
    const variables = cssVariables(value);
    for (let index = variables.length - 1; index >= 0; index--) {
      const variable = variables[index];
      let replacement;
      if (Object.hasOwn(tokens, variable.name)) {
        if (chain.includes(variable.name)) {
          issues.add(
            `Token alias cycle: ${[...chain, variable.name].join(" → ")}`,
          );
          continue;
        }
        replacement = resolve(tokens[variable.name], [...chain, variable.name]);
      } else if (variable.fallback !== null)
        replacement = resolve(variable.fallback, chain);
      else {
        issues.add(
          `${chain[0] ?? "Token"} references missing token ${variable.name}`,
        );
        continue;
      }
      output =
        output.slice(0, variable.start) +
        replacement +
        output.slice(variable.end);
    }
    return output;
  }
  for (const [name, value] of Object.entries(tokens)) resolve(value, [name]);
  return {
    resolve,
    get issues() {
      return [...issues];
    },
  };
}
