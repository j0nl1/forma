// Root-owned completion for work that finishes after the synchronous seek.
let nextOwner = 0;
export function createFrameController({ seek, root, getTime }) {
  const owner = `motion-${++nextOwner}`;
  let generation = 0,
    revision = 0,
    current,
    disposed = false;
  const renderers = new Map();
  const invalidate = (message = "Frame superseded") => {
    current?.abort.abort(new Error(message));
    current = undefined;
  };
  const verify = (token) => {
    if (
      disposed ||
      !current ||
      current.abort.signal.aborted ||
      token.owner !== owner ||
      token.generation !== generation ||
      token.revision !== revision ||
      token.time !== current.token.time ||
      !root()?.isConnected ||
      (getTime && getTime() !== token.time)
    )
      throw new Error("Stale or detached motion frame");
    return true;
  };
  return {
    register(id, render) {
      if (
        disposed ||
        typeof id !== "string" ||
        !id ||
        typeof render !== "function"
      )
        throw new Error("Frame renderers require an ID and a render function");
      if (renderers.has(id)) throw new Error(`Duplicate frame renderer: ${id}`);
      invalidate("Frame participants changed");
      renderers.set(id, render);
      revision++;
      return () => {
        if (renderers.get(id) === render) {
          invalidate("Frame participants changed");
          renderers.delete(id);
          revision++;
        }
      };
    },
    invalidate,
    revise() {
      invalidate("Motion runtime changed");
      revision++;
    },
    begin(time) {
      if (disposed || !Number.isFinite(time))
        throw new Error("Invalid motion frame");
      invalidate();
      generation++;
      seek(time);
      const token = Object.freeze({ owner, generation, revision, time });
      current = { token, abort: new AbortController() };
      return token;
    },
    verify,
    async complete(token, { timeoutMs = 8000 } = {}) {
      verify(token);
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000)
        throw new Error(
          "Frame timeout must be between 1 and 60000 milliseconds",
        );
      const frame = current;
      let timer, onAbort;
      const stopped = new Promise((_, reject) => {
        onAbort = () =>
          reject(frame.abort.signal.reason ?? new Error("Frame aborted"));
        frame.abort.signal.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Motion frame ${token.time.toFixed(3)} did not complete within ${timeoutMs} ms`,
              ),
            ),
          timeoutMs,
        );
      });
      const context = Object.freeze({
        ...token,
        signal: frame.abort.signal,
        commit: (draw) => {
          verify(token);
          return draw();
        },
      });
      try {
        await Promise.race([
          Promise.all(
            [...renderers].map(async ([id, render]) => {
              try {
                await render(context);
              } catch (error) {
                throw new Error(`Frame renderer ${id}: ${error.message}`, {
                  cause: error,
                });
              }
            }),
          ),
          stopped,
        ]);
        verify(token);
      } catch (error) {
        if (current === frame) invalidate(error.message);
        throw error;
      } finally {
        clearTimeout(timer);
        frame.abort.signal.removeEventListener("abort", onAbort);
      }
    },
    dispose() {
      invalidate("Motion stage disposed");
      disposed = true;
      renderers.clear();
    },
  };
}
