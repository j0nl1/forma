# HTML email

Deliver one HTML file with a single-column reading order. Start from `email.html`; edit its title, hidden preview text, content, destinations and footer for the user's actual message. Keep the centered content within 600px and make the outer table fluid. The starter includes a 600px conditional wrapper for Outlook and a smaller action table whose padded cell supplies the button background.

## Structure that survives removed header styles

Use presentation tables with explicit widths, zero borders and zero cell spacing/padding. Apply the important background, color, font, spacing and line-height directly to each element. Give text a system font stack and use pixel line-heights with `mso-line-height-rule: exactly`. Keep the action as a real link filling a padded, colored table cell; do not replace it with a button element or image. Preserve the Outlook conditional wrapper when changing the card width.

The first body element is a hidden span containing roughly 85 characters of preview text. Keep `lang` on the root. The header may provide media or color-scheme adjustments, but the message must remain readable if every header style is removed. The starter uses light/dark metadata, restrained light backgrounds and an optional dark palette; test the authored colors in the user's target clients.

Avoid scripts, external CSS, web fonts, custom elements, flex/grid layout, floats, positioned artwork, forms and autoplay media. Build ordinary artwork with cells, borders and text. Local project images and embedded data images are not a recipient delivery mechanism. If an image is essential, use a clearly identified placeholder until the user supplies an actual hosted HTTPS asset; retain descriptive alt text and explicit dimensions. Check that the message and action still make sense with images disabled.

## Prepare the delivery

Keep the HTML comfortably below 100 KB. Replace every example URL with a working destination and avoid empty/hash-only actions. For a marketing message, obtain the user's actual sender identity, postal address and unsubscribe destination/copy. Do not invent those details. Add a readable plain-text version when requested. The starter's footer explicitly identifies unfinished delivery details; remove that instruction only after supplying them.

Preview the design at desktop and narrow widths, then inspect the actual target email clients. A browser screenshot and a successful HTML export prove browser behavior only. They do not establish Outlook, Gmail or Apple Mail compatibility, successful delivery or compliance. Report which clients were actually checked and any remaining image/link/footer placeholders. Hand off the HTML to the user's email tool; send only when explicitly authorized.

The owned browser regression checks the starter at 1440px and 360px with all header styles removed: no overflow, retained content and action colors, hidden preheader and a centered content width of at most 600px. It also checks the explicit table attributes, conditional Outlook wrapper and file-size budget. Actual client rendering remains an acceptance requirement.
