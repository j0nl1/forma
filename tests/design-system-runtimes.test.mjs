import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { temporary, root } from "./helpers.mjs";
import { install } from "../tools/install.mjs";
import {
  compile,
  inspect,
  preview,
  importSystem,
} from "../skills/forma/scripts/design-system.mjs";
import {
  runtimeDeclaration,
  reactRuntime,
  usesBrowserReact,
  rewriteCardGlobals,
} from "../skills/forma/scripts/lib/system-authoring.mjs";
import { sourceAST } from "../skills/forma/scripts/lib/system-contracts.mjs";
import { serve } from "../skills/forma/scripts/preview.mjs";
import { withPage } from "../skills/forma/scripts/lib/browser.mjs";

async function fixture(t) {
  const directory = await temporary(t),
    source = path.join(directory, "lumina");
  await fs.mkdir(path.join(source, "components"), { recursive: true });
  await fs.writeFile(
    path.join(source, "README.md"),
    "# Lumina System\n\nUse a deliberate action and a directional mark.",
  );
  await fs.writeFile(
    path.join(source, "styles.css"),
    ":root{--accent:#305f9d}body{margin:0;padding:24px;font:18px system-ui;color:#162943;background:#f1f5fb}button{display:flex;gap:8px;align-items:center;font:inherit;background:var(--accent);color:white;border:0;border-radius:8px;padding:10px 16px}svg{width:18px;height:18px}",
  );
  await fs.writeFile(
    path.join(source, "components/Button.jsx"),
    `const React=window.React;const {ZIcon:Mark}=window.LuminaDesignSystem_ab12cd;if(typeof window==='undefined')throw new Error('Source must only run in a browser');window.sourceRuns=(window.sourceRuns||0)+1;export function Button({label='Continue'}){const [count,setCount]=React.useState(0);return <button onClick={()=>setCount(count+1)}><Mark/>{label} {count}</button>}`,
  );
  await fs.writeFile(
    path.join(source, "components/ZIcon.jsx"),
    `const React=globalThis.React;export function ZIcon(){return <svg viewBox="0 0 20 20" aria-label="Directional mark"><path d="M3 10h14m-6-6 6 6-6 6" stroke="currentColor" fill="none" strokeWidth="2"/></svg>}`,
  );
  await fs.writeFile(
    path.join(source, "components/Button.d.ts"),
    '/** @startingPoint section="Actions" viewport="700x180" */\nexport interface ButtonProps {label?:string}',
  );
  await fs.writeFile(
    path.join(source, "_ds_manifest.json"),
    JSON.stringify({
      namespace: "LuminaDesignSystem_ab12cd",
      components: [{ name: "Button", sourcePath: "components/Button.jsx" }],
      cards: [],
      globalCssPaths: ["styles.css"],
    }),
  );
  await fs.writeFile(
    path.join(source, "_ds_bundle.js"),
    `throw new Error('Never execute or import the old bundle');window.originalBundleRuns=1;`,
  );
  await fs.writeFile(
    path.join(source, "components/card.html"),
    `<!-- @dsCard group="Components" name="Lumina actions" viewport="700x180" -->\n<!doctype html><html lang="en"><head><meta name="codex-fixed-sheet" content="off"><title>Lumina actions</title><link rel="stylesheet" href="../styles.css"><script crossorigin src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script><script src="https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js"></script><script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script><script>const React=window.React;const DOM=window.ReactDOM;document.documentElement.dataset.pair=React.version;</script></head><body><div id="root"></div><script src="../_ds_bundle.js"></script><script type="text/babel">const {Button}=window.LuminaDesignSystem_ab12cd;DOM.createRoot(document.getElementById('root')).render(<Button label="Begin"/>);</script></body></html>`,
  );
  return { directory, source };
}
async function files(directory) {
  const output = {};
  async function visit(folder) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await visit(file);
      else
        output[path.relative(directory, file)] = await fs.readFile(
          file,
          "utf8",
        );
    }
  }
  await visit(directory);
  return output;
}

test("runtime declarations identify exact package URLs and both installed React/DOM pairs", () => {
  assert.equal(
    runtimeDeclaration(
      "https://unpkg.com/react@18.2.0/umd/react.production.min.js",
    ).runtimeVersion,
    "18.3.1",
  );
  assert.equal(
    runtimeDeclaration(
      "https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.development.js",
    ).package,
    "react-dom",
  );
  assert.equal(
    runtimeDeclaration(
      "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js",
    ).replacement,
    "build-time JSX/TSX",
  );
  for (const url of [
    "https://unpkg.com.evil.invalid/react@18.3.1/umd/react.production.min.js",
    "https://unpkg.com/other@1/react.production.min.js",
    "https://cdn.jsdelivr.net/gh/other/react-dom.production.min.js",
    "https://example.com/babel.min.js",
  ])
    assert.equal(runtimeDeclaration(url), null);
  assert.throws(
    () =>
      runtimeDeclaration(
        "https://unpkg.com/react@17.0.2/umd/react.production.min.js",
      ),
    /Unsupported React CDN version/,
  );
  for (const version of ["18.3.1", "19.2.4"]) {
    const runtime = reactRuntime(version),
      require = createRequire(path.join(runtime.alias.react, "package.json"));
    assert.equal(require("react/package.json").version, version);
    assert.equal(
      JSON.parse(
        execFileSync(
          process.execPath,
          [
            "-p",
            `JSON.stringify(require(${JSON.stringify(path.join(runtime.alias["react-dom"], "package.json"))}).version)`,
          ],
          { encoding: "utf8" },
        ),
      ),
      version,
    );
  }
});

test("legacy source namespaces and browser-global components compile independently without editing or executing source", async (t) => {
  const { directory, source } = await fixture(t),
    before = await files(source),
    model = await inspect(source);
  assert.deepEqual(model.issues, []);
  assert.deepEqual(await files(source), before);
  assert.equal(model.authoring.version, "18.3.1");
  assert.deepEqual(model.authoring.sourceNamespaces, [
    "LuminaDesignSystem_ab12cd",
  ]);
  assert.equal(model.authoring.declarations.length, 3);
  const manifest = await compile(source);
  assert.equal(manifest.reactVersion, "18.3.1");
  assert.match(manifest.namespace, /^CodexDS_lumina_/);
  assert.ok(manifest.sourceNamespaces.includes("LuminaDesignSystem_ab12cd"));
  const after = await files(source);
  for (const [name, text] of Object.entries(before))
    if (!name.startsWith("_ds_")) assert.equal(after[name], text);
  assert.doesNotMatch(
    after["_ds_bundle.js"],
    /Never execute or import the old bundle/,
  );
  const next = await compile(source);
  assert.equal(next.namespace, manifest.namespace);
  assert.ok(next.sourceNamespaces.includes("LuminaDesignSystem_ab12cd"));
  await preview(source);
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  for (const [pagePath, section] of [
    ["preview.html", 'article[data-card-name="Button"]'],
    [manifest.cards[0].path, null],
  ])
    await withPage(url + "lumina/" + pagePath, async (page) => {
      const target = section ? page.locator(section).first() : page;
      await target
        .getByRole("button", { name: "Directional mark Begin 0" })
        .click();
      await target
        .getByRole("button", { name: "Directional mark Begin 1" })
        .waitFor();
      assert.equal(
        await page.evaluate(
          (namespace) => window[namespace].React.version,
          manifest.namespace,
        ),
        "18.3.1",
      );
      assert.equal(await page.evaluate(() => window.sourceRuns), 1);
      assert.equal(
        await page.evaluate(() => window.originalBundleRuns),
        undefined,
      );
      assert.equal(
        await page.evaluate(
          () =>
            [...document.scripts].filter((script) =>
              /^\/\* @codex-ds namespace=/.test(script.textContent),
            ).length,
        ),
        1,
      );
      if (!section)
        assert.equal(
          await page.evaluate(
            () => window.ReactDOM === window.CodexDesignSystem.ReactDOM,
          ),
          true,
        );
    });
});

test("React 18 rendering, callbacks, class lookup, both hydration APIs, portals, flush and unmount retain actual behavior", async (t) => {
  const legacyRuntime = reactRuntime("18.3.1");
  const require = createRequire(
    path.join(legacyRuntime.alias["react-dom"], "package.json"),
  );
  const React = require("react");
  const ssr = (label) =>
    require("react-dom/server").renderToString(
      React.createElement("button", null, label + " ", 0),
    );
  const directory = await temporary(t),
    source = path.join(directory, "legacy");
  await fs.mkdir(source);
  await fs.writeFile(
    path.join(source, "styles.css"),
    "body{margin:0;padding:24px;font:18px system-ui}button{font:inherit;display:block;margin:8px;padding:8px}#portal{padding:12px;border:1px solid #ddd}",
  );
  await fs.writeFile(
    path.join(source, "card.html"),
    `<!-- @dsCard group="Compatibility" name="Rendering contracts" viewport="700x600" -->\n<!doctype html><html><head><meta name="codex-fixed-sheet" content="off"><link rel="stylesheet" href="styles.css"></head><body><div id="legacy"></div><div id="hydrated">${ssr("Hydrated")}</div><div id="modern">${ssr("Modern hydration")}</div><div id="portal"></div><div id="owner"></div><div id="subtree"></div><button onclick="ReactDOM.flushSync(()=>instance.setState({count:7}));document.body.dataset.flushed=document.querySelector('#legacy button').textContent">Flush legacy</button><button onclick="document.body.dataset.unmounted=String(ReactDOM.unmountComponentAtNode(document.getElementById('legacy')))">Unmount legacy</button><script type="text/babel">class Counter extends React.Component{static childContextTypes={tone:()=>null};state={count:0};getChildContext(){return {tone:"Indigo"}}render(){return <button onClick={()=>this.setState({count:this.state.count+1})}>Legacy {this.state.count}</button>}}const instance=ReactDOM.render(<Counter/>,document.getElementById('legacy'),function(){document.body.dataset.callback=String(this instanceof Counter)});document.body.dataset.node=String(ReactDOM.findDOMNode(instance)===document.querySelector('#legacy button'));function Subtree(props,context){return <button>Subtree {context.tone}</button>}Subtree.contextTypes={tone:()=>null};ReactDOM.unstable_renderSubtreeIntoContainer(instance,<Subtree/>,document.getElementById('subtree'),()=>document.body.dataset.subtreeCallback='yes');function Hydrated(){const [count,setCount]=React.useState(0);return <button onClick={()=>setCount(count+1)}>Hydrated {count}</button>}const witness=document.querySelector('#hydrated button');ReactDOM.hydrate(<Hydrated/>,document.getElementById('hydrated'));document.body.dataset.hydrated=String(witness===document.querySelector('#hydrated button'));function ModernHydration(){const [count,setCount]=React.useState(0);return <button onClick={()=>setCount(count+1)}>Modern hydration {count}</button>}ReactDOM.hydrateRoot(document.getElementById('modern'),<ModernHydration/>);function Portal(){const [count,setCount]=React.useState(0);return ReactDOM.createPortal(<button onClick={()=>setCount(count+1)}>Portal {count}</button>,document.getElementById('portal'))}ReactDOM.createRoot(document.getElementById('owner')).render(<Portal/>);</script></body></html>`,
  );
  const manifest = await compile(source);
  assert.equal(manifest.reactVersion, "18.3.1");
  await preview(source);
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  for (const filename of ["preview.html", manifest.cards[0].path])
    await withPage(url + "legacy/" + filename, async (page) => {
      const area =
        filename === "preview.html"
          ? page.locator('article[data-card-name="Rendering contracts"]')
          : page;
      const body = area.locator("body");
      for (const name of ["callback", "node", "hydrated"])
        assert.equal(await body.getAttribute("data-" + name), "true");
      assert.equal(await body.getAttribute("data-subtree-callback"), "yes");
      assert.ok(
        await area
          .getByRole("button", { name: "Subtree Indigo", exact: true })
          .isVisible(),
      );
      for (const prefix of [
        "Legacy",
        "Hydrated",
        "Modern hydration",
        "Portal",
      ]) {
        await area
          .getByRole("button", { name: prefix + " 0", exact: true })
          .click();
        await area
          .getByRole("button", { name: prefix + " 1", exact: true })
          .waitFor();
      }
      await area
        .getByRole("button", { name: "Flush legacy", exact: true })
        .click();
      assert.equal(await body.getAttribute("data-flushed"), "Legacy 7");
      await area
        .getByRole("button", { name: "Unmount legacy", exact: true })
        .click();
      assert.equal(await body.getAttribute("data-unmounted"), "true");
      assert.equal(await area.locator("#legacy button").count(), 0);
      assert.equal(
        await area
          .getByRole("button", { name: "Portal 1", exact: true })
          .count(),
        1,
      );
    });
});

test("bound window-like values remain local while native React 19 keeps its own runtime", async (t) => {
  for (const code of [
    "function sample(window){return window.React}",
    "{const self={};self.React}",
    "function sample(){if(true){var globalThis={};}return globalThis.React}",
  ])
    assert.equal(usesBrowserReact(sourceAST("source.jsx", code).source), false);
  const rewritten = rewriteCardGlobals(
    'const window={React:{label:"Local"}};console.log(window.React.label)',
    "card.jsx",
    "CodexDS_test_012345abcdef",
    [],
  );
  assert.match(rewritten, /window\.React\.label/);
  const directory = await temporary(t),
    source = path.join(directory, "native");
  await fs.mkdir(source);
  await fs.writeFile(
    path.join(source, "styles.css"),
    "body{font:18px system-ui}",
  );
  await fs.writeFile(
    path.join(source, "Mock.jsx"),
    `import React from 'react';export function Mock({window={React:{label:'Local React'}}}){const [count,setCount]=React.useState(0);return <button onClick={()=>setCount(count+1)}>{window.React.label} {React.version} {count}</button>}`,
  );
  await fs.writeFile(
    path.join(source, "data.html"),
    '<!-- @dsCard group="Data" name="Inert data" -->\n<!doctype html><html lang="en"><head><title>Inert data</title></head><body><script type="application/json" id="sample-data">{"ReactDOM.render":"Reference label"}</script></body></html>',
  );
  const manifest = await compile(source);
  assert.equal(manifest.reactVersion, "19.2.4");
  assert.match(
    await fs.readFile(
      path.join(
        source,
        manifest.cards.find((item) => item.name === "Inert data").path,
      ),
      "utf8",
    ),
    /\{"ReactDOM.render":"Reference label"\}/,
  );
  await preview(source);
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(url + "native/preview.html", async (page) => {
    await page.getByRole("button", { name: "Local React 19.2.4 0" }).click();
    await page.getByRole("button", { name: "Local React 19.2.4 1" }).waitFor();
  });
  await fs.writeFile(
    path.join(source, "system.json"),
    JSON.stringify({
      schemaVersion: 1,
      name: "Native global",
      slug: "native",
      css: "styles.css",
      reactVersion: "19.2.4",
    }),
  );
  await fs.writeFile(
    path.join(source, "NativeGlobal.jsx"),
    `const React=window.React;export function NativeGlobal(){const [count,setCount]=React.useState(0);return <button onClick={()=>setCount(count+1)}>Native global {typeof React.useActionState} {count}</button>}`,
  );
  assert.equal((await inspect(source)).authoring.version, "19.2.4");
  await compile(source);
  await preview(source);
  await withPage(url + "native/preview.html", async (page) => {
    await page
      .getByRole("button", { name: "Native global function 0" })
      .click();
    await page
      .getByRole("button", { name: "Native global function 1" })
      .waitFor();
  });
});

test("unrecognized remote scripts, unsupported versions and missing namespace exports fail without overwriting artifacts", async (t) => {
  const { source } = await fixture(t);
  await compile(source);
  const before = await files(source),
    cardFile = path.join(source, "components/card.html");
  await fs.appendFile(
    cardFile,
    '<script src="https://example.com/react-helper.js"></script>',
  );
  await assert.rejects(
    compile(source),
    /Remote dependency must be downloaded or removed/,
  );
  assert.equal(
    (await files(source))["_ds_manifest.json"],
    before["_ds_manifest.json"],
  );
  await fs.writeFile(
    cardFile,
    before["components/card.html"].replace("react@18.3.1", "react@17.0.2"),
  );
  const bad = await inspect(source);
  assert.ok(
    bad.issues.some((issue) => issue.includes("Unsupported React CDN version")),
  );
  await assert.rejects(compile(source), /Unsupported React CDN version/);
  await fs.writeFile(cardFile, before["components/card.html"]);
  await fs.appendFile(
    path.join(source, "components/Button.jsx"),
    "\nconst missing=window.LuminaDesignSystem_ab12cd.Missing;",
  );
  await assert.rejects(
    compile(source),
    /Unknown browser system export Missing/,
  );
  assert.equal(
    (await files(source))["_ds_manifest.json"],
    before["_ds_manifest.json"],
  );
});

test("legacy runtime, translated namespaces and source-free reviews survive managed import and portable deletion", async (t) => {
  const { directory, source } = await fixture(t),
    manifest = await compile(source),
    project = path.join(directory, "project");
  await importSystem(source, project);
  const copied = path.join(project, "_ds/lumina");
  await preview(copied);
  await fs.copyFile(
    path.join(copied, "preview.html"),
    path.join(directory, "portable.html"),
  );
  await fs.copyFile(
    path.join(copied, manifest.cards[0].path),
    path.join(directory, "card.html"),
  );
  await fs.rm(source, { recursive: true });
  await fs.rm(project, { recursive: true });
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  for (const filename of ["portable.html", "card.html"])
    await withPage(url + filename, async (page) => {
      const target =
        filename === "portable.html"
          ? page.locator('article[data-card-name="Button"]').first()
          : page;
      await target
        .getByRole("button", { name: "Directional mark Begin 0" })
        .click();
      await target
        .getByRole("button", { name: "Directional mark Begin 1" })
        .waitFor();
    });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(directory, "portable.html")).href);
    await page.evaluate(() => window.CodexSystemReviewReady);
    await page
      .locator('article[data-card-name="Button"]')
      .first()
      .getByRole("button", { name: "Directional mark Begin 0" })
      .click();
    await page
      .getByRole("button", { name: "Directional mark Begin 1" })
      .waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("installed skill includes and resolves its React 18 workspace without the checkout", async (t) => {
  const { directory, source } = await fixture(t),
    destination = path.join(directory, "installed");
  await install(destination);
  assert.deepEqual(
    JSON.parse(
      await fs.readFile(
        path.join(destination, "runtimes/react18/package.json"),
        "utf8",
      ),
    ),
    JSON.parse(
      await fs.readFile(
        path.join(root, "runtimes/react18/package.json"),
        "utf8",
      ),
    ),
  );
  execFileSync("npm", ["ci", "--ignore-scripts", "--offline"], {
    cwd: destination,
    stdio: "pipe",
  });
  const require = createRequire(
    path.join(destination, "runtimes/react18/package.json"),
  );
  assert.equal(require("react/package.json").version, "18.3.1");
  assert.equal(require("react-dom/package.json").version, "18.3.1");
  const output = JSON.parse(
    execFileSync(
      process.execPath,
      [path.join(destination, "scripts/design-system.mjs"), "compile", source],
      { encoding: "utf8" },
    ),
  );
  assert.equal(output.reactVersion, "18.3.1");
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await withPage(url + "lumina/" + output.cards[0].path, async (page) => {
    await page
      .getByRole("button", { name: "Directional mark Begin 0" })
      .click();
    await page
      .getByRole("button", { name: "Directional mark Begin 1" })
      .waitFor();
  });
});

test("separately compiled systems share each exact React pair and compose stateful components in one root", async (t) => {
  const directory = await temporary(t),
    systems = [];
  for (const version of ["18.3.1", "19.2.4"]) {
    for (const label of ["Primary", "Supporting"]) {
      const folder = `system-${version.replaceAll(".", "-")}-${label.toLowerCase()}`,
        source = path.join(directory, folder);
      await fs.mkdir(source);
      await fs.writeFile(
        path.join(source, "styles.css"),
        "body{font:18px system-ui;background:#f1f5fb;color:#162943;padding:24px}button{font:inherit;padding:12px 18px;background:#305f9d;color:white;border:0;border-radius:8px;margin-right:12px}",
      );
      await fs.writeFile(
        path.join(source, "system.json"),
        JSON.stringify({
          schemaVersion: 1,
          name: label,
          slug: folder,
          css: "styles.css",
          entry: "Panel.jsx",
          reactVersion: version,
        }),
      );
      await fs.writeFile(
        path.join(source, "Panel.jsx"),
        `import*as React from'react';import*as DOM from'react-dom';import*as Client from'react-dom/client';import*as JSX from'react/jsx-runtime';import*as JSXDev from'react/jsx-dev-runtime';export function runtimeShape(){return{React:Object.keys(React),DOM:Object.keys(DOM),Client:Object.keys(Client),JSX:Object.keys(JSX),JSXDev:Object.keys(JSXDev)}};export function Panel(){const [count,setCount]=React.useState(0);return <button onClick={()=>setCount(count+1)}>${label} ${version} {count}</button>}`,
      );
      systems.push({ version, label, folder, manifest: await compile(source) });
    }
  }
  const sections = ["18.3.1", "19.2.4"]
    .map((version) => {
      const pair = systems.filter((item) => item.version === version);
      return `<section><h1>Shared React ${version}</h1><div id="root-${version}"></div></section>${pair.map((item) => `<script src="${item.folder}/_ds_bundle.js"></script>`).join("")}<script>{const a=window.${pair[0].manifest.namespace},b=window.${pair[1].manifest.namespace};a.createRoot(document.getElementById('root-${version}')).render(a.React.createElement(a.React.Fragment,null,a.React.createElement(a.Components.Panel),a.React.createElement(b.Components.Panel)));}</script>`;
    })
    .join("");
  await fs.writeFile(
    path.join(directory, "composition.html"),
    `<!doctype html><html lang="en"><head><title>Shared design system runtimes</title><link rel="stylesheet" href="${systems[0].folder}/_ds_tokens.css"></head><body>${sections}</body></html>`,
  );
  await fs.writeFile(
    path.join(directory, "expected.html"),
    `<!doctype html><html lang="en"><head><title>Expected composed appearance</title><link rel="stylesheet" href="${systems[0].folder}/_ds_tokens.css"></head><body>${["18.3.1", "19.2.4"].map((version) => `<section><h1>Shared React ${version}</h1><div>${["Primary", "Supporting"].map((label) => `<button>${label} ${version} 1</button>`).join("")}</div></section>`).join("")}</body></html>`,
  );
  const { server, url } = await serve(directory, 0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  for (const width of [1100, 390])
    await withPage(
      url + "composition.html",
      async (page) => {
        for (const { version, label } of systems) {
          await page
            .getByRole("button", { name: `${label} ${version} 0` })
            .click();
          await page
            .getByRole("button", { name: `${label} ${version} 1` })
            .waitFor();
        }
        const result = await page.evaluate(
          (systems) => ({
            same: systems
              .filter((_, i) => i % 2 === 0)
              .map((item, i) => {
                const a = window[item.manifest.namespace],
                  b = window[systems[i * 2 + 1].manifest.namespace];
                return a.React === b.React && a.ReactDOM === b.ReactDOM;
              }),
            distinct:
              window[systems[0].manifest.namespace].React !==
              window[systems[2].manifest.namespace].React,
            versions: Object.keys(window.CodexDesignRuntimes),
            shapes: systems.map((item) =>
              window[item.manifest.namespace].Components.runtimeShape(),
            ),
          }),
          systems,
        );
        assert.deepEqual(result.same, [true, true]);
        assert.equal(result.distinct, true);
        assert.deepEqual(result.versions.sort(), ["18.3.1", "19.2.4"]);
        for (let i = 0; i < systems.length; i++) {
          const runtime = reactRuntime(systems[i].version),
            require = createRequire(
              path.join(runtime.alias.react, "package.json"),
            );
          for (const [key, name] of Object.entries({
            React: "react",
            DOM: "react-dom",
            Client: "react-dom/client",
            JSX: "react/jsx-runtime",
            JSXDev: "react/jsx-dev-runtime",
          })) {
            for (const exported of Object.keys(require(name)))
              assert.ok(
                result.shapes[i][key].includes(exported),
                `${systems[i].version} preserves ${name}.${exported}`,
              );
          }
        }
        const rendered = await page.screenshot({ fullPage: true });
        if (process.env.CODEX_RUNTIME_CAPTURE_DIR) {
          await fs.mkdir(process.env.CODEX_RUNTIME_CAPTURE_DIR, {
            recursive: true,
          });
          await page.screenshot({
            path: path.join(
              process.env.CODEX_RUNTIME_CAPTURE_DIR,
              `shared-runtimes-${width}.png`,
            ),
            fullPage: true,
          });
        }
        await page.goto(url + "expected.html");
        const expected = await page.screenshot({ fullPage: true });
        const difference = await page.evaluate(
          async ([actual, expected]) => {
            const decode = async (encoded) => {
              const image = new Image();
              image.src = "data:image/png;base64," + encoded;
              await image.decode();
              const canvas = document.createElement("canvas");
              canvas.width = image.width;
              canvas.height = image.height;
              const context = canvas.getContext("2d");
              context.drawImage(image, 0, 0);
              return context.getImageData(0, 0, canvas.width, canvas.height)
                .data;
            };
            const a = await decode(actual),
              b = await decode(expected);
            let pixels = 0,
              max = 0;
            for (let i = 0; i < a.length; i += 4) {
              let changed = false;
              for (let channel = 0; channel < 3; channel++) {
                const delta = Math.abs(a[i + channel] - b[i + channel]);
                if (delta) changed = true;
                max = Math.max(max, delta);
              }
              if (changed) pixels++;
            }
            return { pixels, max };
          },
          [rendered.toString("base64"), expected.toString("base64")],
        );
        if (process.env.CODEX_RUNTIME_CAPTURE_DIR)
          await fs.writeFile(
            path.join(
              process.env.CODEX_RUNTIME_CAPTURE_DIR,
              `shared-runtimes-expected-${width}.png`,
            ),
            expected,
          );
        // Split React text nodes can differ by one RGB level at glyph edges.
        assert.ok(
          difference.pixels <= 16 && difference.max <= 1,
          `Authored appearance at width ${width}: ${JSON.stringify(difference)}`,
        );
      },
      { width, height: 600 },
    );
});
