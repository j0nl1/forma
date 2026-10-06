import React from "react";
export function ExportPanel({ duration, onExport, busy, progress, onCancel }) {
  const [format, setFormat] = React.useState("mp4");
  const [includeAudio, setIncludeAudio] = React.useState(true);
  const [fastCapture, setFastCapture] = React.useState(false);
  const [fps, setFps] = React.useState(30),
    [crf, setCrf] = React.useState(18),
    [scale, setScale] = React.useState(2);
  const [start, setStart] = React.useState(0),
    [end, setEnd] = React.useState(duration);
  return (
    <form
      className="cd-editor cd-chrome"
      onSubmit={(event) => {
        event.preventDefault();
        onExport({
          format,
          captureMethod: fastCapture ? "fast" : "standard",
          fps,
          crf,
          deviceScaleFactor: scale,
          startMs: start * 1000,
          endMs: Math.min(end, duration) * 1000,
          audio: includeAudio && format !== "gif" ? "auto" : "none",
        });
      }}
    >
      <strong>Video export</strong>
      <p className="cd-help">
        Render the saved composition locally. MP4 and WebM can include marked
        media audio.
      </p>
      <div className="cd-section-fields">
        <label>
          <span>Include marked media audio</span>
          <input
            aria-label="Include marked media audio"
            type="checkbox"
            checked={includeAudio}
            disabled={format === "gif" || busy}
            onChange={(event) => setIncludeAudio(event.target.checked)}
          />
        </label>
        <label>
          <span>Faster PNG capture</span>
          <input
            aria-label="Faster PNG capture"
            type="checkbox"
            checked={fastCapture}
            disabled={busy}
            onChange={(e) => setFastCapture(e.target.checked)}
          />
        </label>
        <label>
          Format
          <select
            aria-label="Video format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            <option value="mp4">MP4</option>
            <option value="webm">WebM</option>
            <option value="gif">GIF</option>
          </select>
        </label>
        <label>
          Frames per second
          <input
            aria-label="Video fps"
            type="number"
            min="1"
            max="60"
            required
            value={fps}
            onChange={(e) => setFps(+e.target.value)}
          />
        </label>
        <label>
          Quality (lower is better)
          <input
            aria-label="Video quality"
            type="number"
            min="0"
            max="51"
            required
            value={crf}
            onChange={(e) => setCrf(+e.target.value)}
          />
        </label>
        <label>
          Capture scale
          <input
            aria-label="Capture scale"
            type="number"
            min="1"
            max="3"
            step="0.5"
            required
            value={scale}
            onChange={(e) => setScale(+e.target.value)}
          />
        </label>
        <label>
          Start seconds
          <input
            aria-label="Export start seconds"
            type="number"
            min="0"
            max={duration}
            step="0.01"
            required
            value={start}
            onChange={(e) => setStart(+e.target.value)}
          />
        </label>
        <label>
          End seconds
          <input
            aria-label="Export end seconds"
            type="number"
            min="0.01"
            max={duration}
            step="0.01"
            required
            value={Math.min(end, duration)}
            onChange={(e) => setEnd(+e.target.value)}
          />
        </label>
      </div>
      {busy && progress && (
        <div role="status">
          {progress.phase}: {progress.frame ?? 0} / {progress.frames ?? "…"}{" "}
          frames
        </div>
      )}
      {busy && progress?.frames > 0 && (
        <progress
          aria-label="Export progress"
          value={progress.frame ?? 0}
          max={progress.frames}
        />
      )}
      {busy && (
        <button type="button" onClick={onCancel} disabled={!progress?.id}>
          Cancel export
        </button>
      )}
      <button disabled={busy} type="submit" style={{ marginTop: 12 }}>
        {busy ? "Rendering…" : "Render and download"}
      </button>
    </form>
  );
}

export function useVideoExport({
  source,
  binding,
  save,
  saving,
  timing,
  setStatus,
}) {
  const [busy, setBusy] = React.useState(false),
    [progress, setProgress] = React.useState(null);
  const active = React.useRef(null);
  const endpoint =
    (typeof source === "string" ? source : "/__codex_motion") + "/export";
  const headers = () => ({
    "Content-Type": "application/json",
    "X-Codex-Motion-Token": binding.current?.token,
  });
  const cancel = async () => {
    if (!active.current?.job?.id) return;
    try {
      const response = await fetch(endpoint + "/cancel", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ jobId: active.current.job.id }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setStatus("Cancelling video export…");
    } catch (error) {
      setStatus(error.message);
    }
  };
  React.useEffect(
    () => () => {
      clearTimeout(active.current?.timer);
      active.current?.abort.abort();
    },
    [],
  );
  const exportVideo = async (options) => {
    if (!binding.current) {
      setStatus("Start preview.mjs with --motion-file for local video export");
      return;
    }
    if (active.current) return;
    const job = { abort: new AbortController(), job: null };
    active.current = job;
    setBusy(true);
    setProgress(null);
    setStatus("Rendering video locally…");
    const poll = async () => {
      try {
        const response = await fetch(endpoint + "/status", {
          headers: headers(),
          signal: job.abort.signal,
        });
        if (response.ok) {
          const value = await response.json();
          if (active.current === job) {
            job.job = value.job;
            setProgress(value.job);
          }
        }
      } catch {
        /* The export response carries the final failure. */
      }
      if (active.current === job && !job.abort.signal.aborted)
        job.timer = setTimeout(poll, 500);
    };
    try {
      await save(timing);
      while (saving.current) {
        job.abort.signal.throwIfAborted();
        await new Promise((r) => setTimeout(r, 25));
      }
      if (!binding.current)
        throw new Error("Resolve the source edit before exporting");
      const request = fetch(endpoint, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(options),
        signal: job.abort.signal,
      });
      job.timer = setTimeout(poll, 150);
      const response = await request;
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob()),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `animation.${options.format}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const warning = response.headers.get("X-Codex-Export-Warnings");
      setStatus(
        warning
          ? `Video downloaded. ${warning}`
          : "Video rendered and downloaded.",
      );
    } catch (error) {
      if (!job.abort.signal.aborted) setStatus(error.message);
    } finally {
      clearTimeout(job.timer);
      job.abort.abort();
      if (active.current === job) {
        active.current = null;
        setBusy(false);
        setProgress(null);
      }
    }
  };
  return { busy, progress, cancel, exportVideo };
}
