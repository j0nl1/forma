# Optional Codex integration

Apply the shared [harness workflow](harness.md) first. Read this reference only when using Codex. The skill and local helpers do not require these tools; preserve the standard fallback when they are absent.

| Capability | Codex convenience | Fallback |
| --- | --- | --- |
| Questions | Use `request_user_input_async` for missing preferences when exposed; continue independent work. In Plan mode, use an exposed structured input tool for suitable optional questions. | Ask a concise question in chat when an answer is required. A text input tool cannot accept screenshot uploads. |
| Visible preview | If `open_in_codex` is exposed, open the verified URL as a browser target in the current chat. | Deliver the reported loopback URL for a standard browser. |
| Browser control | If unified browser control is exposed, follow its returned documentation and exact initialization requirements. Prefer the in-app browser for local pages. | Use local Playwright checks and ordinary browser inspection. Use a signed-in browser only when the task needs the user's existing session. |
| Files and media | Use absolute Markdown file links and local media embeds when the current client supports them. | Provide absolute paths and URLs for local applications. |
| Optional assets and transfer | Use available image, PDF, presentation or connector capabilities with their associated skills and authorization. | Use supplied local assets or deliver an explicit local handoff. |

Tool names and capabilities differ between CLI, IDE and desktop. Do not invent tools or modify Codex's model, approval settings, plugins or unrelated configuration. Do not install this skill merely to build a design. Resolve skill paths from its discovered directory; UI metadata in `agents/openai.yaml` is optional Codex configuration and is not a requirement for other harnesses.
