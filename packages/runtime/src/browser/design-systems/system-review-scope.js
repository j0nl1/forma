// Isolation for authored previews, not a security sandbox for untrusted code.
export function cardEnvironment({
  shadow,
  body,
  head,
  root,
  card,
  assets,
  schedule,
  report,
}) {
  const locals = Object.create(null),
    pending = [];
  let windowProxy,
    documentProxy,
    completed = false;
  const query = (selector, all = false) => {
    if (selector === "html" || selector === ":root") return all ? [root] : root;
    return shadow[all ? "querySelectorAll" : "querySelector"](selector);
  };
  const onReady = (
    callback,
    type = "DOMContentLoaded",
    target = documentProxy,
  ) => {
    const invoke = () =>
      typeof callback === "function"
        ? callback.call(target, new Event(type))
        : callback.handleEvent(new Event(type));
    if (completed)
      queueMicrotask(() => {
        try {
          invoke();
        } catch (error) {
          report(error);
        }
      });
    else pending.push(invoke);
  };
  const documentValues = {
    body,
    head,
    documentElement: root,
    defaultView: () => windowProxy,
    getElementById: (id) =>
      [...shadow.querySelectorAll("[id]")].find(
        (node) => node.id === String(id),
      ) ?? null,
    querySelector: (selector) => query(selector),
    querySelectorAll: (selector) => query(selector, true),
    getElementsByClassName: (name) => body.getElementsByClassName(name),
    getElementsByTagName: (name) =>
      name === "body"
        ? [body]
        : name === "head"
          ? [head]
          : body.getElementsByTagName(name),
    addEventListener: (type, callback, options) =>
      ["DOMContentLoaded", "load", "readystatechange"].includes(type)
        ? onReady(callback, type)
        : document.addEventListener(type, callback, options),
    removeEventListener: (type, callback, options) =>
      document.removeEventListener(type, callback, options),
  };
  documentProxy = new Proxy(document, {
    get(target, key) {
      if (key === "defaultView") return windowProxy;
      if (Object.hasOwn(documentValues, key)) return documentValues[key];
      if (key === "currentScript") return null;
      if (key === "readyState") return "complete";
      if (key === "activeElement") return shadow.activeElement ?? body;
      if (key === "styleSheets") return shadow.styleSheets;
      if (key === "title") return locals.documentTitle ?? "";
      if (key === "write" || key === "writeln")
        return () => {
          throw new Error(
            "document.write is unsupported in isolated system cards",
          );
        };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, key, value) {
      if (key === "title") locals.documentTitle = value;
      else if (key !== "cookie") documentValues[key] = value;
      return true;
    },
  });
  const sourceBase = new URL(
    "./" + (card.sourcePath ?? "index.html"),
    "https://review.invalid/",
  );
  async function fetchLocal(input, options) {
    if (typeof input === "string" || input instanceof URL) {
      const source = new URL(String(input), sourceBase);
      if (source.origin === sourceBase.origin) {
        const key = decodeURIComponent(source.pathname.slice(1));
        if (Object.hasOwn(assets, key)) return fetch(assets[key], options);
        const base = new URL(
          "./" + (card.sourcePath ?? "index.html"),
          location.href,
        );
        return fetch(new URL(String(input), base), options);
      }
    }
    return fetch(input, options);
  }
  const globalValues = {
    document: documentProxy,
    fetch: fetchLocal,
    innerWidth: card.width,
    innerHeight: card.height,
    addEventListener: (type, callback, options) =>
      type === "load"
        ? onReady(callback, type, windowProxy)
        : window.addEventListener(type, callback, options),
    removeEventListener: window.removeEventListener.bind(window),
  };
  windowProxy = new Proxy(Object.create(null), {
    get(target, key) {
      if (
        ["window", "self", "globalThis", "top", "parent", "frames"].includes(
          key,
        )
      )
        return windowProxy;
      if (Object.hasOwn(locals, key)) return locals[key];
      if (Object.hasOwn(globalValues, key)) return globalValues[key];
      const value = window[key];
      return typeof value === "function" && !/^[A-Z]/.test(String(key))
        ? value.bind(window)
        : value;
    },
    set(target, key, value) {
      if (key === "onload") onReady(value, "load", windowProxy);
      else locals[key] = value;
      return true;
    },
    has(target, key) {
      return key in locals || key in globalValues || key in window;
    },
    ownKeys() {
      return [
        ...new Set([...Reflect.ownKeys(window), ...Reflect.ownKeys(locals)]),
      ];
    },
    getOwnPropertyDescriptor(target, key) {
      return {
        configurable: true,
        enumerable: true,
        get: () => windowProxy[key],
        set: (value) => {
          windowProxy[key] = value;
        },
      };
    },
    defineProperty(target, key, descriptor) {
      Object.defineProperty(locals, key, { ...descriptor, configurable: true });
      return true;
    },
  });
  const scopeFor = (excluded = []) => {
    const exclusions = new Set([
      "__reviewScope",
      "__reviewLocals",
      "__reviewEvent",
      ...excluded,
    ]);
    return new Proxy(windowProxy, {
      has(target, key) {
        return typeof key !== "symbol" && !exclusions.has(key);
      },
      get(target, key) {
        return key === Symbol.unscopables ? undefined : target[key];
      },
    });
  };
  function run(script) {
    const declarations = script.bindings ?? [];
    for (const item of declarations.filter((item) => item.variable))
      if (!Object.hasOwn(locals, item.name)) locals[item.name] = undefined;
    const expose = declarations
      .filter((item) => !item.variable)
      .map(
        (item) =>
          `${JSON.stringify(item.name)}:{configurable:true,enumerable:true,get:()=>${item.name},set:${item.mutable ? `(value)=>{${item.name}=value}` : `()=>{throw new TypeError('Assignment to constant variable')}`}}`,
      )
      .join(",");
    new Function(
      "__reviewScope",
      "__reviewLocals",
      `with(__reviewScope){\n${script.code}\nObject.defineProperties(__reviewLocals,{${expose}});\n}`,
    ).call(
      windowProxy,
      scopeFor(
        declarations.filter((item) => !item.variable).map((item) => item.name),
      ),
      locals,
    );
  }
  function handlers() {
    for (const handler of card.handlers) {
      const node = shadow.querySelector(`[data-review-event-${handler.key}]`);
      if (!node) continue;
      node.removeAttribute(`data-review-event-${handler.key}`);
      const callback = new Function(
        "__reviewScope",
        "__reviewEvent",
        `with(__reviewScope){return(function(event){${handler.code}\n}).call(this,__reviewEvent)}`,
      );
      node.addEventListener(handler.event, function (event) {
        try {
          if (callback.call(this, scopeFor(), event) === false)
            event.preventDefault();
          schedule();
        } catch (error) {
          report(error);
        }
      });
      if (handler.event === "load" && (node === body || node === root))
        onReady(() => node.dispatchEvent(new Event("load")));
    }
  }
  return {
    run,
    handlers,
    async ready() {
      completed = true;
      for (const callback of pending.splice(0)) {
        try {
          await callback();
        } catch (error) {
          report(error);
        }
      }
      schedule();
    },
  };
}
