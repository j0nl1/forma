# Provenance and trust

Forma maintains its own instructions, helpers and editable starters. External repositories, design notes and imported files are treated as data during inspection. Review executable source before opening it in a browser; this package is not a sandbox.

The watercolor kit includes public pigment names, RGB transmittance values and operation weights credited to Jim Liu under the MIT license. Preserve the copyright notices in the root and packaged licenses and in `watercolor-kit.js`. Rendering, paper texture, brush fields, caches, components and controls are maintained in this project.

## Dependencies

| Package | Purpose | Source |
| --- | --- | --- |
| pptxgenjs | Native PowerPoint objects, notes and OOXML packaging | [PptxGenJS](https://github.com/gitbrent/PptxGenJS) |
| esbuild | JSX/TSX and module bundling | [esbuild](https://github.com/evanw/esbuild) |
| kiwi-schema | Binary schema and ByteBuffer primitives | [Kiwi](https://github.com/evanw/kiwi) |
| fflate | ZIP decoding | [fflate](https://github.com/101arrowz/fflate) |
| fzstd | Streaming Zstandard decoding | [fzstd](https://github.com/101arrowz/fzstd) |
| parse5 | HTML parsing | [parse5](https://github.com/inikulin/parse5) |
| smol-toml | Data-only project preference parsing | [smol-toml](https://github.com/squirrelchat/smol-toml) |
| postcss | CSS inspection, font rule parsing and export | [PostCSS](https://github.com/postcss/postcss) |
| postcss-selector-parser | Shadow-root selector transformations that preserve literals | [Selector parser](https://github.com/postcss/postcss-selector-parser) |
| marked | Design-system README Markdown rendering | [Marked](https://github.com/markedjs/marked) |
| playwright | Chromium verification and capture | [Playwright](https://github.com/microsoft/playwright) |
| react / react-dom | Optional component systems | [React](https://github.com/facebook/react) |
| three | Optional 3D | [Three.js](https://github.com/mrdoob/three.js) |
| typescript | Read-only source/declaration syntax trees for system contracts | [TypeScript](https://github.com/microsoft/TypeScript) |
| prettier | Development source formatting | [Prettier](https://github.com/prettier/prettier) |

Versions and integrity hashes are locked. Use `npm ci --ignore-scripts`; explicit Chromium installation is separate. FFmpeg comes from the OS. Dependencies remain a supply-chain boundary.

The default caption font is Inter Medium 4.1, independently obtained from the [font author's website](https://rsms.me/inter/) and distributed under the SIL Open Font License 1.1. Its [asset notes](../packages/runtime/src/browser/fonts/README.md) record the download URL, retrieval date, checksum and included license. The build embeds this font locally; it requires no CDN request.

There is no telemetry, background updater, hosted asset proxy, model selection change, credential collector, or remote install hook. Preview binds to loopback; exports write local files and refuse existing outputs. Browsing, generation, publishing, and transfers use the actual available harness tools under the user's authorization.

Passing tests verify stated contracts. They do not certify absence of defects or faithful rendering of every possible Figma file.
