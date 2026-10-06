const defaultEndpoint = "https://api.elevenlabs.io/v1/sound-generation";
const byteLimit = 16 * 1024 * 1024;

export function soundRequest(prompt, options = {}) {
  if (typeof prompt !== "string" || !prompt.trim())
    throw new Error("Provide a descriptive sound prompt.");
  const influence = options.promptInfluence ?? 0.3;
  if (
    typeof influence !== "number" ||
    !Number.isFinite(influence) ||
    influence < 0 ||
    influence > 1
  )
    throw new Error("Prompt influence must be a finite number from 0 to 1.");
  const duration = options.durationSeconds;
  if (
    duration != null &&
    (typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      duration < 0.5 ||
      duration > 22)
  )
    throw new Error("Duration must be a finite number from 0.5 to 22 seconds.");
  let endpoint;
  try {
    endpoint = new URL(options.endpoint ?? defaultEndpoint);
  } catch {
    throw new Error("Provide a valid sound provider endpoint.");
  }
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !(
      endpoint.protocol === "https:" ||
      (endpoint.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname))
    )
  )
    throw new Error(
      "The sound endpoint must use HTTPS or loopback HTTP, without credentials, query parameters or fragments.",
    );
  const body = { text: prompt.trim(), prompt_influence: influence };
  if (duration != null) body.duration_seconds = duration;
  return { endpoint: endpoint.href, body };
}

// Verify an actual complete Layer III frame rather than accepting JSON or an ID3 tag alone.
function hasMP3Frame(bytes) {
  let start = 0;
  if (bytes.subarray(0, 3).toString() === "ID3") {
    if (bytes.length < 10 || bytes.subarray(6, 10).some((b) => b & 128))
      return false;
    start =
      ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]) + 10;
    if (bytes[3] === 4 && bytes[5] & 16) start += 10;
  }
  for (let i = start; i + 4 <= Math.min(bytes.length, start + 65536); i++) {
    const version = (bytes[i + 1] >> 3) & 3;
    const layer = (bytes[i + 1] >> 1) & 3;
    const index = bytes[i + 2] >> 4;
    const rateIndex = (bytes[i + 2] >> 2) & 3;
    if (
      bytes[i] !== 255 ||
      (bytes[i + 1] & 224) !== 224 ||
      version === 1 ||
      layer !== 1 ||
      !index ||
      index === 15 ||
      rateIndex === 3
    )
      continue;
    const rate =
      [44100, 48000, 32000][rateIndex] /
      (version === 3 ? 1 : version === 2 ? 2 : 4);
    const bitrate =
      (version === 3
        ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
        : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[
        index
      ] * 1000;
    const size =
      Math.floor(((version === 3 ? 144 : 72) * bitrate) / rate) +
      ((bytes[i + 2] >> 1) & 1);
    if (size >= 4 && i + size <= bytes.length) return true;
  }
  return false;
}

export async function requestSound(
  request,
  { apiKey, timeoutMs = 90000 } = {},
) {
  if (typeof apiKey !== "string" || !apiKey.trim() || /[\r\n]/.test(apiKey))
    throw new Error(
      "Set ELEVENLABS_API_KEY in the process environment before generating sound.",
    );
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 180000)
    throw new Error(
      "Sound request timeout must be an integer from 1 to 180000 milliseconds.",
    );
  const signal = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetch(request.endpoint, {
      method: "POST",
      redirect: "error",
      signal,
      headers: {
        "xi-api-key": apiKey.trim(),
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(request.body),
    });
  } catch {
    throw new Error(
      signal.aborted
        ? "Sound request timed out. The provider outcome is unknown; check its history before retrying."
        : "Sound request failed before a valid response. Check the configured provider; no automatic retry was made.",
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Sound provider rejected the request (HTTP ${response.status}). Check credentials, request parameters and quota; no automatic retry was made.`,
    );
  }
  const type = response.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();
  if (!["audio/mpeg", "audio/mp3", "application/octet-stream"].includes(type)) {
    await response.body?.cancel();
    throw new Error("Sound provider did not return an MP3 audio response.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Sound provider returned no audio body.");
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > byteLimit)
        throw new Error("Sound response exceeds the 16 MiB audio limit.");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw new Error(
      signal.aborted
        ? "Sound download timed out. The provider outcome is unknown; check its history before retrying."
        : error.message === "Sound response exceeds the 16 MiB audio limit."
          ? error.message
          : "Sound download failed before a complete audio response.",
    );
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks, size);
  if (!hasMP3Frame(bytes))
    throw new Error("Sound response contains no complete MP3 audio frame.");
  return bytes;
}
