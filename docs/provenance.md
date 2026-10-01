# Provenance and trust

Behavioral reference: [JimLiu/baoyu-design](https://github.com/JimLiu/baoyu-design), inspected at commit `6530033592bf7fa58bc1a5a2a2ad278da45213a9` on October 1, 2026. The reference credits Jim Liu and an underlying Anthropic design workflow. Its licensing statement does not independently establish the provenance of every embedded artifact.

Prompts, docs, scripts, and starters here were written anew after inspecting capabilities and source contracts. No upstream executable was run. No upstream prompt, minified bundle, image, `.fig` fixture, or vendor directory was copied into this deliverable. This is an independent rewrite informed by source inspection, not a legal clean-room certification or a guarantee about the reference project's provenance.

The watercolor kit preserves the inspected public pigment names, RGB transmittance values, operation weights, and seeded random-number contract so authored paintings retain their inputs. Those API data are credited to the MIT-licensed reference by Jim Liu (Baoyu). Its raster renderer, paper texture, brush fields, caches, components and controls are independently implemented here; identical brush pixels are not claimed.

Research snapshots stay outside the repository. Components and schemas are independently maintained. The initial rewrite's smaller components reduced functionality beyond the requested Codex adaptation; [porting status](porting-status.md) tracks correcting those reductions, and [capabilities](capabilities.md) documents current differences.

## Dependencies

| Package | Purpose | Source |
| --- | --- | --- |
| esbuild | JSX/TSX and module bundling | [esbuild](https://github.com/evanw/esbuild) |
| kiwi-schema | Binary schema and ByteBuffer primitives | [Kiwi](https://github.com/evanw/kiwi) |
| fflate | ZIP decoding | [fflate](https://github.com/101arrowz/fflate) |
| fzstd | Streaming Zstandard decoding | [fzstd](https://github.com/101arrowz/fzstd) |
| parse5 | HTML parsing | [parse5](https://github.com/inikulin/parse5) |
| postcss | CSS inspection, font rule parsing and export | [PostCSS](https://github.com/postcss/postcss) |
| playwright | Chromium verification and capture | [Playwright](https://github.com/microsoft/playwright) |
| react / react-dom | Optional component systems | [React](https://github.com/facebook/react) |
| three | Optional 3D | [Three.js](https://github.com/mrdoob/three.js) |
| prettier | Development source formatting | [Prettier](https://github.com/prettier/prettier) |

Versions and integrity hashes are locked. Use `npm ci --ignore-scripts`; explicit Chromium installation is separate. FFmpeg comes from the OS. Dependencies remain a supply-chain boundary.

The default caption font is Inter Medium 4.1, independently obtained from the [font author's website](https://rsms.me/inter/) and distributed under the SIL Open Font License 1.1. Its [asset notes](../skills/codex-design/assets/starters/fonts/README.md) record the download URL, retrieval date, checksum and included license. The build embeds this font locally; it requires no CDN request.

There is no telemetry, background updater, hosted asset proxy, model selection change, credential collector, or remote install hook. Preview binds to loopback; exports write local files and refuse existing outputs. Browsing, generation, publishing, and transfers use the actual available Codex tools under the user's authorization.

Passing tests verify stated contracts. They do not certify absence of defects or faithful rendering of every possible Figma file.
