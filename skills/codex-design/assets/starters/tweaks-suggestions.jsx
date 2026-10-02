import React, { useEffect, useMemo, useRef, useState } from "react";
export function useTwkTypewriter(
  items,
  {
    placeholder = "Describe a tweak…",
    typeMs = 35,
    eraseMs = 22,
    pauseMs = 1800,
    startMs = 400,
    tailMs = 28,
    enabled = true,
  } = {},
) {
  const signature = JSON.stringify(items),
    key = `codex-design-tweak-suggestions:${signature}`;
  const played = () => {
    try {
      return sessionStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  };
  const [skipped, setSkipped] = useState(
    () =>
      !items.length ||
      played() ||
      matchMedia("(prefers-reduced-motion:reduce)").matches,
  );
  const [frame, setFrame] = useState({
    text: "",
    tail: "",
    idx: 0,
    done: false,
  });
  const plan = useMemo(() => {
    let time = 0;
    return items.map((text, idx) => {
      const start = time + startMs;
      let letterTime = start;
      // Timing and slicing share UTF-16 offsets, including surrogate pairs.
      const points = Array.from({ length: text.length }, (_, index) => {
        if (index) letterTime += typeMs + Math.random() * 20;
        return letterTime;
      });
      const pause = points.at(-1) ?? start;
      const erase = pause + pauseMs;
      time = erase + text.length * eraseMs;
      return { text, idx, start, points, pause, erase, end: time };
    });
  }, [signature, typeMs, eraseMs, pauseMs, startMs]);
  useEffect(() => {
    setSkipped(
      !items.length ||
        played() ||
        matchMedia("(prefers-reduced-motion:reduce)").matches,
    );
    setFrame({ text: "", tail: "", idx: 0, done: false });
  }, [key]);
  useEffect(() => {
    if (skipped || !enabled || !plan.length) return;
    let timer;
    const start = performance.now();
    const tick = () => {
      const time = performance.now() - start,
        segment = plan.find((item) => time < item.end);
      if (segment) {
        const count =
          time < segment.erase
            ? segment.points.filter((point) => point <= time).length
            : Math.max(
                0,
                segment.text.length -
                  Math.floor((time - segment.erase) / Math.max(1, eraseMs)),
              );
        setFrame({
          text: segment.text.slice(0, count),
          idx: segment.idx,
          tail: "",
          done: false,
        });
      } else {
        try {
          sessionStorage.setItem(key, "1");
        } catch {}
        const count = Math.min(
          placeholder.length,
          Math.floor((time - plan.at(-1).end) / Math.max(1, tailMs)),
        );
        setFrame({
          text: "",
          idx: plan.length - 1,
          tail: placeholder.slice(0, count),
          done: true,
        });
        if (count === placeholder.length) return;
      }
      timer = setTimeout(tick, 16);
    };
    tick();
    return () => clearTimeout(timer);
  }, [key, plan, enabled, skipped, placeholder, eraseMs, tailMs]);
  const markPlayed = () => {
    try {
      sessionStorage.setItem(key, "1");
    } catch {}
    setSkipped(true);
  };
  return skipped
    ? { text: "", tail: placeholder, idx: frame.idx, done: true, markPlayed }
    : { ...frame, markPlayed };
}
export function TweakSuggestionBar({
  suggestions = [],
  placeholder = "Describe a tweak…",
  ideasPrompt = "Suggest three concise controls for this design and replace the suggestions in TweakSuggestionBar. Keep each idea under 35 characters.",
  onRequest,
  animationOptions = {},
}) {
  const [value, setValue] = useState(""),
    [ghost, setGhost] = useState(""),
    [focused, setFocused] = useState(false),
    [draft, setDraft] = useState(null),
    [message, setMessage] = useState("");
  const input = useRef();
  const writer = useTwkTypewriter(suggestions, {
    ...animationOptions,
    placeholder,
    enabled: !value && !ghost && !focused,
  });
  const freeze = () => {
    const suggestion = !writer.done ? suggestions[writer.idx] : "";
    writer.markPlayed();
    if (!value && !ghost && suggestion) setGhost(suggestion);
    input.current?.focus();
  };
  const handoff = async (request) => {
    setMessage("Preparing draft");
    setDraft(request);
    setValue("");
    setGhost("");
    window.dispatchEvent(
      new CustomEvent("codex-tweak-request", { detail: request }),
    );
    if (onRequest) {
      try {
        await onRequest(request);
        setMessage("Draft prepared for review");
      } catch (error) {
        setMessage(`Draft delivery failed: ${error.message}`);
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(request.text);
      setMessage("Copied. Paste into Codex, review and send.");
    } catch {
      setMessage(
        "Copy the draft below, then paste it into Codex to review and send.",
      );
    }
  };
  const submit = () => {
    const text = (value || ghost).trim();
    if (text)
      handoff({
        text,
        kind: suggestions.includes(text) ? "suggestion" : "freetext",
      });
  };
  return (
    <>
      <div className="suggestion" onPointerDown={freeze}>
        <div className="suggestion-field">
          <input
            ref={input}
            aria-label="Describe a tweak"
            value={value}
            placeholder={focused && !ghost ? placeholder : ""}
            onChange={(event) => {
              setValue(event.target.value);
              setGhost("");
            }}
            onFocus={() => {
              setFocused(true);
              writer.markPlayed();
            }}
            onBlur={() => {
              setFocused(false);
              if (!value) setGhost("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Tab" && ghost && !value) {
                event.preventDefault();
                setValue(ghost);
                setGhost("");
              } else if (event.key === "Enter") {
                event.preventDefault();
                submit();
              } else if (event.key === "Escape") setGhost("");
            }}
          />
          {!value && !ghost && !focused && (
            <div className="ghost">
              {writer.done ? writer.tail : writer.text}
              {!writer.done || writer.tail.length < placeholder.length ? (
                <i className="caret" />
              ) : null}
            </div>
          )}
          {ghost && !value && <div className="ghost">{ghost}</div>}
        </div>
        {value || ghost ? (
          <button
            type="button"
            onPointerDown={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
            onClick={submit}
          >
            Copy draft
          </button>
        ) : writer.done && !focused ? (
          <button
            type="button"
            onPointerDown={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
            onClick={() => handoff({ text: ideasPrompt, kind: "ideas" })}
          >
            Ideas
          </button>
        ) : null}
      </div>
      {draft && (
        <div className="draft">
          <textarea
            className="field"
            aria-label="Codex draft"
            value={draft.text}
            readOnly
          />
          <small role="status" aria-label="Draft handoff status">
            {message}
          </small>
        </div>
      )}
    </>
  );
}
Object.assign(window, { TweakSuggestionBar });
