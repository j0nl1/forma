# Generated sound effects

Use `scripts/forma.mjs sound-effects` for a requested UI sound, ambient effect or other generated sound asset. It accepts a descriptive text prompt, optional 0.5–22 second duration, prompt influence from 0 to 1 (default 0.3), and a real MP3 in the project's `scraps/` directory. Use concrete descriptions of the material, action, atmosphere and tail; inspect the resulting audio before choosing it.

This helper sends the configured provider's actual HTTP request. Its default endpoint is the [ElevenLabs sound generation API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert). The provider currently accepts a broader duration range, but this helper accepts 0.5–22 seconds. Omitting duration lets the provider choose it. The request does not force a lower bitrate or change the agent's chosen model.

## Prepare and review

Use the installed helper's absolute path, or the checkout's `skills/forma/scripts/` directory:

```sh
FORMA_SKILL="$HOME/.agents/skills/forma"
node "$FORMA_SKILL/scripts/forma.mjs" sound-effects /absolute/path/to/project \
  --prompt "A soft mechanical button click, close and dry, with a short gentle tail" \
  --name button-click --duration 0.8 --prompt-influence 0.3
```

The default command prints a JSON plan containing the destination, endpoint and exact request body. It makes no request, creates no file and never prints a credential. The project must already exist. Names are lowercase ASCII filename slugs with optional `.mp3`; an omitted name derives a descriptive slug plus a fresh suffix from the prompt. Existing outputs are never replaced. Invalid duration/influence, unsafe destinations and malformed `design.json` are rejected before generation.

## Generate with configured credentials

Configure `ELEVENLABS_API_KEY` in the invoking process environment using your normal secret manager. Keep it out of files, shell command text/history, HTML, browser storage, logs and Git. The helper reads it only for generation. It needs Node.js 22+ and FFmpeg for actual MP3 decoding, with no provider SDK or additional npm package. FFmpeg availability is checked before sending a paid request.

Run the same reviewed command with `--generate` to make one request:

```sh
node "$FORMA_SKILL/scripts/forma.mjs" sound-effects /absolute/path/to/project \
  --prompt "A soft mechanical button click, close and dry, with a short gentle tail" \
  --name button-click --duration 0.8 --prompt-influence 0.3 --generate
```

This command can consume the provider's credits. It sends authentication in a header, refuses redirects, uses a finite timeout and bounds the response to 16 MiB. Only a successful audio response containing complete MP3 framing and passing an actual FFmpeg decode is published. Header-shaped bytes with invalid MPEG side information are rejected before publication. HTTP errors, JSON bodies, unavailable downloads and timeouts never become MP3 files. Requests are not automatically retried; a timeout may leave the provider outcome unknown, so check its history before another generation.

`--endpoint` configures an explicitly chosen endpoint implementing the same request/response contract. HTTPS and loopback HTTP are allowed; credentials, query parameters and fragments in that URL are rejected. Non-ElevenLabs hosts are recorded as configured providers rather than claiming ElevenLabs generation. `--timeout-ms` changes the 90-second deadline, from 1 to 180000 ms. A loopback integration fixture proves protocol handling only and is not a substitute for an actual configured provider run.

## Output, provenance and recovery

Success returns the absolute MP3 path, size, SHA-256, request parameters and metadata-registration result. `design.json` receives an `audio` asset entry with provider, endpoint, prompt, requested duration when supplied, influence, creation time and hash. Existing unrelated project data is retained. Requested duration is not reported as measured duration. Listen to the MP3 and use FFprobe when an exact duration/codec is needed.

A short-lived hidden reservation prevents two requests from claiming the same filename. Publication never overwrites a prior result. Metadata registration has its own exclusive reservation. If registration fails after successful generation, the MP3 stays saved and the result explicitly reports `registration.registered: false`; keep the audio, fix project metadata and register it through `project.mjs record ... --type audio`. Do not regenerate a successful asset merely to recover its registration. Interrupted processes may leave a `.pending` reservation; inspect the corresponding process/request before manually removing that specific reservation.

Use a generated local MP3 in an authored `<audio>` element and the existing [marked-media export contract](../../references/exports.md#audio). Keep it inside the animation stage, choose a real source interval and gain, and enable audio in MP4/WebM export. Web Audio preview synthesis does not replace generated provider output or the marked-media export path. Browser playback should start from a user gesture and retain mute/gain controls.

## Verification scope

Tests use an actual local HTTP fixture returning a clearly synthetic, FFmpeg-encoded MP3. They verify request parameters, credentials excluded from plans/output, valid saved bytes, actual decoding, provenance, preflight failures, finite download errors and no automatic retry. No paid provider generation is performed by the test suite. The current environment has no native sound-generation tool; live provider output quality, account behavior and broader audio comparison remain pending in the [known limitations](../../references/limitations.md).
