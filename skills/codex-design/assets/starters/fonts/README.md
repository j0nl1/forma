# Default caption font

Inter Medium 4.1 supplies the original animation caption default: the Inter family at weight 500, normal style. The engine bundles this WOFF2 as a data URL and declares it only when the document has no authored Inter face. An authored Inter font remains authoritative. Other font families and weights follow the document CSS.

Source: [Inter official website](https://rsms.me/inter/) and its [font stylesheet](https://rsms.me/inter/inter.css). The binary was retrieved from `https://rsms.me/inter/font-files/Inter-Medium.woff2?v=4.1` on 2026-10-02.

SHA-256: `0ff3e94614e1493eb556314fd247ae6c4a85a7783b4cc86be539940cf83f2a48`.

The font is distributed under the [SIL Open Font License 1.1](OFL.txt). It is a third-party font asset, independently obtained from the font author; it is not imported from the reference project's runtime. Copy this directory with the animation starter. The JSX build embeds the font, so the finished bundle requires no font network request.
