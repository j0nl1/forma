import React from "react";
import { createPortal } from "react-dom";
import { CompositionContext, useTime, useTimeline } from "./animations.jsx";
import {
  CompositionError,
  parseClipDocument,
  compileComposition,
  clipFrame,
} from "../../../../core/src/timeline/composition-model.js";

const ClipContext = React.createContext(null);
const emptyDocument = { schemaVersion: 1, clips: [] };
function initialClips(clips) {
  if (clips !== undefined)
    return {
      enabled: true,
      document: parseClipDocument(
        Array.isArray(clips) ? { schemaVersion: 1, clips } : clips,
      ),
    };
  const blocks = document.querySelectorAll('[id="studio-motion-clips"]');
  if (!blocks.length)
    return { enabled: false, document: parseClipDocument(emptyDocument) };
  if (
    blocks.length !== 1 ||
    blocks[0].tagName !== "SCRIPT" ||
    blocks[0].type !== "application/json" ||
    blocks[0].hasAttribute("src")
  )
    throw new CompositionError(
      "AMBIGUOUS_BINDING",
      "Use one inert studio-motion-clips JSON script",
    );
  return { enabled: true, document: parseClipDocument(blocks[0].textContent) };
}
export function useClip(id) {
  const context = React.useContext(ClipContext),
    time = useTime();
  if (!context?.plan)
    throw (
      context?.error ??
      new Error("useClip requires a valid CompositionProvider inside a Stage")
    );
  const clip = context.plan.clips.find((item) => item.id === id);
  return { ...clipFrame(context.plan, id, time), clip, plan: context.plan };
}

export function CompositionProvider({
  scenes,
  clips,
  source = false,
  children,
}) {
  const nativeComposition = React.useContext(CompositionContext),
    timeline = useTimeline();
  const [initial] = React.useState(() => initialClips(clips));
  const enabled = initial.enabled || clips !== undefined;
  const [documentValue, setDocument] = React.useState(initial.document);
  const [connection, setConnection] = React.useState(null);
  const [status, setStatus] = React.useState(
    source ? "Connecting clip source…" : "Local clip data",
  );
  const [busy, setBusy] = React.useState(false),
    [host, setHost] = React.useState(null);
  const marker = React.useRef(null),
    binding = React.useRef(null),
    saving = React.useRef(false),
    mounted = React.useRef(true),
    sourceGeneration = React.useRef(0);
  const endpoint =
    typeof source === "string"
      ? source.replace(/\/__codex_motion\/?$/, "/__codex_composition")
      : "/__codex_composition";
  const compiled = React.useMemo(() => {
    try {
      return {
        plan: compileComposition({
          scenes: nativeComposition?.scenes ?? scenes,
          clips: documentValue,
        }),
        error: null,
      };
    } catch (error) {
      return { plan: null, error };
    }
  }, [nativeComposition?.scenes, scenes, documentValue]);
  const { plan, error } = compiled;
  React.useEffect(() => {
    mounted.current = true;
    setHost(marker.current.closest(".cd-motion"));
    return () => {
      mounted.current = false;
    };
  }, []);
  React.useEffect(() => {
    if (clips !== undefined)
      setDocument(
        parseClipDocument(
          Array.isArray(clips) ? { schemaVersion: 1, clips } : clips,
        ),
      );
  }, [clips]);
  // Stage installs its bridge in a parent layout effect. This later effect
  // publishes the same compiled plan consumed by hooks and audio export.
  React.useEffect(() => {
    const bridge = window.codexTimeline ?? window.__animStage;
    const root = marker.current.closest(
      "[data-codex-exportable-video-duration]",
    );
    if (!bridge || bridge.root !== root || !enabled) return;
    const diagnostic = error
      ? `${error.code ?? "INVALID_COMPOSITION"}: ${error.message}`
      : undefined;
    Object.defineProperties(bridge, {
      compositionPlan: {
        configurable: true,
        enumerable: true,
        get: () => plan,
      },
      audioPlan: { configurable: true, enumerable: true, get: () => plan },
      compositionError: {
        configurable: true,
        enumerable: true,
        get: () => diagnostic,
      },
    });
    return () => {
      if (bridge.compositionPlan === plan) delete bridge.compositionPlan;
      if (bridge.audioPlan === plan) delete bridge.audioPlan;
      if (bridge.compositionError === diagnostic)
        delete bridge.compositionError;
    };
  }, [plan, error, enabled]);
  const reload = React.useCallback(async () => {
    if (!source || !enabled) return;
    const generation = ++sourceGeneration.current;
    try {
      const response = await fetch(endpoint, { credentials: "same-origin" });
      if (
        !response.ok &&
        !response.headers.get("content-type")?.includes("application/json")
      )
        throw new Error("Clip source is unavailable on this preview");
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error ?? "Clip source is unavailable");
      const next = parseClipDocument(value.document);
      if (
        mounted.current &&
        generation === sourceGeneration.current &&
        !saving.current
      ) {
        binding.current = value;
        setConnection(value);
        setDocument(next);
        setStatus("Clip source connected");
      }
    } catch (error) {
      if (mounted.current && generation === sourceGeneration.current)
        setStatus(`${error.message}. Clip drafts are retained.`);
    }
  }, [source, endpoint, enabled]);
  React.useEffect(() => {
    reload();
  }, [reload]);
  React.useEffect(() => {
    const root = marker.current.closest(
      "[data-codex-exportable-video-duration]",
    );
    const changed = () => {
      if (!saving.current) reload();
    };
    root?.addEventListener("studio-motion-source-saved", changed);
    return () =>
      root?.removeEventListener("studio-motion-source-saved", changed);
  }, [reload]);
  const save = async (operation) => {
    if (!binding.current || saving.current) return null;
    saving.current = true;
    sourceGeneration.current++;
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Codex-Motion-Token": binding.current.token,
        },
        body: JSON.stringify({
          ...operation,
          baseVersion: binding.current.version,
          operationId: crypto.randomUUID(),
        }),
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error ?? "Clip source save failed");
      parseClipDocument(value.document);
      if (mounted.current) {
        binding.current = { ...value, token: binding.current.token };
        setConnection(binding.current);
        setDocument(value.document);
        setStatus(
          operation.action === "undo"
            ? "Clip move undone"
            : operation.action === "redo"
              ? "Clip move redone"
              : "Clip saved to source",
        );
        marker.current
          .closest("[data-codex-exportable-video-duration]")
          .dispatchEvent(
            new CustomEvent("studio-composition-source-saved", {
              detail: {
                version: value.version,
                scenes: value.scenes,
                playback: value.playback,
              },
            }),
          );
      }
      return value;
    } catch (error) {
      if (mounted.current)
        setStatus(
          `${error.message}. Clip drafts are retained; reload source before retrying.`,
        );
      return null;
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const value = { plan, error, source, connection, status, busy, save, reload };
  return (
    <ClipContext.Provider value={value}>
      <span ref={marker} hidden />
      {plan ? (
        children
      ) : (
        <output role="alert">
          {error.name}: {error.code ?? "INVALID_COMPOSITION"}: {error.message}
        </output>
      )}
      {enabled && host && !timeline.capture
        ? createPortal(<ClipInspector />, host)
        : null}
    </ClipContext.Provider>
  );
}

export function ClipInspector() {
  const { plan, error, source, connection, status, busy, save, reload } =
    React.useContext(ClipContext);
  const [selected, setSelected] = React.useState(null),
    [drafts, setDrafts] = React.useState({});
  const clip =
    plan?.clips.find((item) => item.id === selected) ?? plan?.clips[0];
  const selection = clip?.id;
  const draft = selection
    ? Object.hasOwn(drafts, selection)
      ? drafts[selection]
      : String(clip.start)
    : "";
  const apply = async (action) => {
    if (
      action === "move" &&
      (!draft.trim() || !Number.isFinite(Number(draft)) || Number(draft) < 0)
    )
      return;
    const result = await save(
      action === "move"
        ? { action, clipId: selection, start: Number(draft) }
        : { action },
    );
    if (result && selection) {
      const next = result.plan.clips.find((item) => item.id === selection);
      if (next)
        setDrafts((previous) => ({
          ...previous,
          [selection]: String(next.start),
        }));
    }
  };
  return (
    <section
      className="cd-clip-inspector cd-chrome"
      aria-label="Clip inspector"
      style={{
        borderTop: "1px solid #30343d",
        padding: 12,
        maxHeight: "30vh",
        overflow: "auto",
        flexShrink: 0,
      }}
    >
      <strong>Clips</strong>
      {error ? (
        <p role="alert">
          {error.code}: {error.message}
        </p>
      ) : (
        <table style={{ width: "100%", textAlign: "left" }}>
          <thead>
            <tr>
              <th scope="col">Clip</th>
              <th scope="col">Track</th>
              <th scope="col">Time basis</th>
              <th scope="col">Start</th>
              <th scope="col">Duration</th>
            </tr>
          </thead>
          <tbody>
            {plan.clips.map((item) => (
              <tr key={item.id} data-clip-id={item.id}>
                <td>
                  <button
                    onClick={() => setSelected(item.id)}
                    aria-pressed={selection === item.id}
                    aria-label={`Select clip ${item.id}`}
                  >
                    {item.id}
                  </button>{" "}
                  ({item.kind})
                </td>
                <td>{item.track}</td>
                <td>{item.timeBasis}</td>
                <td>{item.start}</td>
                <td>{item.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {clip && (
        <div
          style={{
            display: "flex",
            alignItems: "end",
            gap: 8,
            marginTop: 10,
            flexWrap: "wrap",
          }}
        >
          <label style={{ maxWidth: 160 }}>
            Clip start seconds
            <input
              aria-label="Clip start seconds"
              type="number"
              min="0"
              step="any"
              value={draft}
              onChange={(event) =>
                setDrafts((previous) => ({
                  ...previous,
                  [selection]: event.target.value,
                }))
              }
            />
          </label>
          <button
            disabled={
              !source ||
              !connection ||
              busy ||
              !draft.trim() ||
              !Number.isFinite(Number(draft)) ||
              Number(draft) < 0
            }
            onClick={() => apply("move")}
          >
            Save clip start
          </button>
          <button
            disabled={!connection?.undoDepth || busy}
            onClick={() => apply("undo")}
          >
            Undo clip move
          </button>
          <button
            disabled={!connection?.redoDepth || busy}
            onClick={() => apply("redo")}
          >
            Redo clip move
          </button>
          {source && (
            <button disabled={busy} onClick={reload}>
              Reload clip source
            </button>
          )}
        </div>
      )}
      <output role="status" style={{ display: "block", marginTop: 8 }}>
        {status}
      </output>
      <p style={{ fontSize: 12, marginBottom: 0 }}>
        Tracks group clips for inspection. Saving a numeric start replaces this
        clip's timing reference.
      </p>
    </section>
  );
}
