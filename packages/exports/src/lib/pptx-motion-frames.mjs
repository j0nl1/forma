import {
  parseEffect,
  buildSteps,
  effectFrames,
  effectOptions,
} from "../../../runtime/src/browser/deck-effects.js";
import { composedTargets } from "./pptx-motion-compose.mjs";

// This is a bounded compositor for nested declarative fade/wipe builds, not a
// general CSS animation renderer. The HTML remains the editable source.
const fps = 20,
  maximumFrames = 120,
  maximumSlideBytes = 32 * 1024 * 1024;
const families = new Set([
  "fade",
  "wipe",
  "spin",
  "grow",
  "shrink",
  "teeter",
  "path",
]);
const totalDuration = (entry) =>
  entry.duration * entry.repeat * (entry.autoReverse ? 2 : 1);

function planFrames(entries, component) {
  const steps = buildSteps(entries),
    schedule = [];
  // Printing ignores animation timing. Keep one source-base picture on-slide;
  // all playback pictures are stored off-slide until native timing moves them.
  const states = [
    { stepIndex: -2, time: 0 },
    { stepIndex: -1, time: 0 },
  ];
  for (const [stepIndex, step] of steps.entries()) {
    for (const item of step.items)
      if (component.ids.has(item.entry.id))
        schedule.push({ ...item, stepIndex });
    const own = step.items.filter((item) => component.ids.has(item.entry.id));
    if (!own.length) continue;
    const end = Math.max(
      ...own.map((item) => item.start + totalDuration(item.entry)),
    );
    if (states.length + Math.ceil(end / 50) + 1 > maximumFrames)
      throw new Error(
        `the inclusive frame count exceeds ${maximumFrames} images per component`,
      );
    for (let time = 0; time < end; time += 50) states.push({ stepIndex, time });
    states.push({ stepIndex, time: end });
  }
  return { states, schedule };
}

// State lives in a JSHandle, so no page-global name or authored runtime module
// path is needed. Only animations created here are canceled during restoration.
function beginCapture({ sourceIndex, ids, objects }) {
  const slide = document.querySelector("deck-stage").slides[sourceIndex];
  const targets = ids.map((id) =>
    slide.querySelector(`[data-codex-pptx-source="${id}"]`),
  );
  if (targets.some((element) => !element))
    throw new Error("a captured animation target no longer exists");
  const root = targets.find(
    (element) => element && targets.every((other) => element.contains(other)),
  );
  if (!root || root === slide)
    throw new Error("the component has no independently capturable subtree");
  const subtree = [root, ...root.querySelectorAll("*")];
  if (
    subtree.some(
      (element) =>
        element.shadowRoot ||
        /^(VIDEO|AUDIO|CANVAS|IFRAME|SVG)$/.test(element.tagName.toUpperCase()),
    )
  )
    throw new Error(
      "the component contains media, a live surface, or a shadow subtree",
    );
  if (
    subtree.some(
      (element) =>
        element.hasAttribute("data-anim") &&
        !ids.includes(element.getAttribute("data-codex-pptx-source")),
    )
  )
    throw new Error(
      "the subtree includes builds outside its captured component",
    );
  if (root.getAnimations({ subtree: true }).length)
    throw new Error(
      "the subtree includes running or held animations outside the declarative export schedule",
    );
  for (const element of subtree) {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility !== "visible")
      throw new Error("the component contains browser-hidden artwork");
    if (
      style.filter !== "none" ||
      style.backdropFilter !== "none" ||
      style.boxShadow !== "none" ||
      style.textShadow !== "none" ||
      style.outlineStyle !== "none" ||
      style.mixBlendMode !== "normal"
    )
      throw new Error(
        "the component has paint extending beyond verified capture bounds",
      );
    for (const pseudo of ["::before", "::after"])
      if (
        !["none", "normal"].includes(getComputedStyle(element, pseudo).content)
      )
        throw new Error(
          "the component has generated paint outside verified capture bounds",
        );
  }
  const rootId = root.getAttribute("data-codex-pptx-source");
  const owned = objects
    .map((object, index) =>
      object.sourceId === rootId || object.sourceAncestors?.includes(rootId)
        ? index
        : -1,
    )
    .filter((index) => index >= 0);
  if (!owned.length || owned.at(-1) - owned[0] + 1 !== owned.length)
    throw new Error(
      "the subtree's artwork is interleaved with unrelated objects",
    );
  if (
    objects.some(
      (object, index) =>
        object.animIds?.some((id) => ids.includes(id)) &&
        !owned.includes(index),
    )
  )
    throw new Error(
      "the captured animation membership is not contained by its subtree",
    );
  if (
    owned.some(
      (index) =>
        objects[index].kind === "media" ||
        objects[index].flattenedAnimationIds?.length,
    )
  )
    throw new Error(
      "the subtree includes media or independently flattened animation targets",
    );
  const all = [];
  const collect = (node) => {
    for (const element of node.querySelectorAll("*")) {
      all.push(element);
      if (element.shadowRoot) collect(element.shadowRoot);
    }
  };
  collect(document);
  const ancestors = new Set();
  for (
    let element = root.parentElement;
    element;
    element = element.parentElement ?? element.getRootNode().host
  )
    ancestors.add(element);
  const styles = all
    .filter(
      (element) =>
        root.contains(element) ||
        ancestors.has(element) ||
        element.getClientRects().length,
    )
    .map((element) => [element, element.getAttribute("style")]);
  const fills = subtree.map((element) => [
    element,
    getComputedStyle(element).webkitTextFillColor,
  ]);
  const animations = document.getAnimations().map((animation) => ({
    animation,
    time: animation.currentTime,
    state: animation.playState,
    rate: animation.playbackRate,
  }));
  const opacity = targets.map((element) =>
    Number(getComputedStyle(element).opacity),
  );
  if (animations.some((saved) => saved.animation instanceof CSSTransition))
    throw new Error(
      "the page includes a live CSS transition that capture cannot restore safely",
    );
  for (const saved of animations) saved.animation.pause();
  for (const [element] of styles)
    element.style.setProperty("transition", "none", "important");
  for (const [element] of styles) {
    if (root.contains(element)) continue;
    const style = element.style;
    if (!ancestors.has(element))
      style.setProperty("visibility", "hidden", "important");
    for (const [property, value] of Object.entries({
      "background-color": "transparent",
      "background-image": "none",
      "border-color": "transparent",
      "box-shadow": "none",
      "text-shadow": "none",
      "outline-color": "transparent",
      "-webkit-text-fill-color": "transparent",
    }))
      style.setProperty(property, value, "important");
  }
  // Text fill inherits; pin original subtree fills without suppressing WAAPI
  // visibility or alpha. Restore these exact style attributes in the finally.
  for (const [element, fill] of fills)
    element.style.setProperty("-webkit-text-fill-color", fill, "important");
  return {
    slide,
    root,
    subtree,
    targets,
    styles,
    animations,
    created: [],
    opacity,
    owned,
  };
}

async function captureComponent(page, slide, component, plan, remainingBytes) {
  const locator = page
    .locator("deck-stage > [data-deck-slide]")
    .nth(slide.sourceIndex);
  await locator.scrollIntoViewIfNeeded();
  const handle = await page.evaluateHandle(beginCapture, {
    sourceIndex: slide.sourceIndex,
    ids: [...component.ids],
    objects: slide.objects,
  });
  try {
    const metadata = await handle.evaluate((state) => ({
      opacity: state.opacity,
      owned: state.owned,
    }));
    const opacity = new Map(
      [...component.ids].map((id, index) => [id, metadata.opacity[index]]),
    );
    const schedules = plan.schedule.map(({ entry, start, stepIndex }) => ({
      id: entry.id,
      kind: entry.kind,
      stepIndex,
      start,
      duration: totalDuration(entry),
      frames: effectFrames(
        { ...entry, opacity: opacity.get(entry.id) },
        { width: slide.width, height: slide.height },
      ),
      options: effectOptions(entry, start),
    }));
    await handle.evaluate((state, schedules) => {
      state.schedules = schedules.map((schedule) => ({
        ...schedule,
        element: state.targets.find(
          (element) =>
            element.getAttribute("data-codex-pptx-source") === schedule.id,
        ),
      }));
    }, schedules);
    const seek = async (sample) =>
      handle.evaluate((state, sample) => {
        state.created.forEach((animation) => animation.cancel());
        state.created = [];
        for (const schedule of state.schedules) {
          if (sample.stepIndex === -2) continue;
          const future = schedule.stepIndex > sample.stepIndex;
          if (future && schedule.kind !== "entrance") continue;
          const animation = schedule.element.animate(
            schedule.frames,
            schedule.options,
          );
          state.created.push(animation);
          animation.pause();
          animation.currentTime = future
            ? 0
            : schedule.stepIndex < sample.stepIndex
              ? schedule.start + schedule.duration
              : sample.time;
        }
        const origin = state.slide.getBoundingClientRect();
        const boxes = [];
        const add = (rect) =>
          boxes.push({
            x: rect.x - origin.x,
            y: rect.y - origin.y,
            w: rect.width,
            h: rect.height,
          });
        for (const element of state.subtree) {
          add(element.getBoundingClientRect());
          for (const node of element.childNodes) {
            if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim())
              continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            add(range.getBoundingClientRect());
          }
        }
        return boxes;
      }, sample);
    // Union every sampled layout box before capturing; even fully clipped or
    // transparent frames retain their moving descendants' paint envelope.
    const boxes = [];
    for (const sample of plan.states) boxes.push(...(await seek(sample)));
    const x = Math.floor(Math.min(...boxes.map((box) => box.x)) - 1),
      y = Math.floor(Math.min(...boxes.map((box) => box.y)) - 1),
      right = Math.ceil(Math.max(...boxes.map((box) => box.x + box.w)) + 1),
      bottom = Math.ceil(Math.max(...boxes.map((box) => box.y + box.h)) + 1);
    if (
      ![x, y, right, bottom].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      right > slide.width ||
      bottom > slide.height
    )
      throw new Error("the sampled motion envelope extends outside the slide");
    const geometry = { x, y, w: right - x, h: bottom - y };
    const frames = [];
    let bytes = 0;
    for (const [ordinal, sample] of plan.states.entries()) {
      await seek(sample);
      const origin = await handle.evaluate((state) => {
        const rect = state.slide.getBoundingClientRect();
        return { x: rect.x + scrollX, y: rect.y + scrollY };
      });
      const png = await page.screenshot({
        type: "png",
        animations: "allow",
        omitBackground: true,
        fullPage: true,
        clip: {
          x: origin.x + x,
          y: origin.y + y,
          width: geometry.w,
          height: geometry.h,
        },
      });
      bytes += png.length;
      if (bytes > remainingBytes)
        throw new Error(
          "the slide exceeds its 32 MiB compositing image budget",
        );
      frames.push({
        ...geometry,
        ...sample,
        kind: "image",
        parked: sample.stepIndex !== -2,
        png,
        animIds: [],
        objectName: `studio-frame-${slide.sourceIndex}-${component.entries[0].id}-${ordinal}`,
        alt: "Sampled nested HTML animation",
      });
    }
    return { frames, bytes, owned: metadata.owned };
  } finally {
    await handle.evaluate((state) => {
      state.created.forEach((animation) => animation.cancel());
      for (const [element, style] of state.styles) {
        element.setAttribute("style", style ?? "");
        element.style.setProperty("transition", "none", "important");
      }
      // Establish restored paint before restoring transition rules, so temporary
      // isolation never starts an authored transition on its way out.
      void document.documentElement.offsetWidth;
      for (const [element, style] of state.styles) {
        element.setAttribute("style", style ?? "");
        if (style === null) element.removeAttribute("style");
      }
      for (const saved of state.animations) {
        saved.animation.playbackRate = saved.rate;
        saved.animation.currentTime = saved.time;
        if (saved.state === "running") saved.animation.play();
        else if (saved.state === "finished") {
          saved.animation.finish();
          saved.animation.currentTime = saved.time;
        } else if (saved.state === "idle") saved.animation.cancel();
        else saved.animation.pause();
      }
    });
    // Source style observers may rebuild editor thumbnails. Allow their queued
    // restoration refresh to finish after the exact attributes are restored.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await handle.dispose();
  }
}

export async function preparePptxCompositingFrames(page, slide) {
  const entries = slide.animations.flatMap((captured) => {
    const parsed = parseEffect(captured.attributes ?? {});
    return parsed ? [{ ...captured, ...parsed }] : [];
  });
  const components = composedTargets(entries, slide.objects, slide);
  const warnings = [],
    plans = [];
  let bytes = 0;
  for (const component of components) {
    // Only failures whose cause is nested alpha or mask compositing qualify.
    if (
      !component.issue ||
      !/paint envelopes overlap|mask/.test(component.issue) ||
      !component.entries.some((entry) =>
        ["fade", "wipe"].includes(entry?.family),
      )
    )
      continue;
    try {
      if (
        component.entries.some(
          (entry) =>
            !entry ||
            !families.has(entry.family) ||
            entry.unsupportedReason ||
            entry.animationGeometryUnsupported,
        )
      )
        throw new Error(
          "the component includes effects or geometry outside the bounded fade/wipe subset",
        );
      const plan = planFrames(entries, component);
      const captured = await captureComponent(
        page,
        slide,
        component,
        plan,
        maximumSlideBytes - bytes,
      );
      bytes += captured.bytes;
      plans.push({
        ...captured,
        ids: [...component.ids],
        issue: component.issue,
      });
    } catch (error) {
      warnings.push(
        `Nested compositing remains static because ${error.message}.`,
      );
    }
  }
  // Commit replacement only after capture and restoration have succeeded.
  for (const plan of [...plans].sort((a, b) => b.owned[0] - a.owned[0]))
    slide.objects.splice(plan.owned[0], plan.owned.length, ...plan.frames);
  slide.rasterBuilds = plans.map(({ ids, frames }) => ({
    ids,
    frames: frames.map(({ objectName, stepIndex, time }) => ({
      objectName,
      stepIndex,
      time,
    })),
  }));
  for (const plan of plans)
    warnings.push(
      `${plan.ids.length} nested HTML builds use ${plan.frames.length} transparent pictures sampled at ${fps} fps (${plan.bytes} PNG bytes) because ${plan.issue}. Their affected artwork is rasterized; other objects keep their existing export representation, source click steps are preserved, and the HTML remains editable.`,
    );
  return {
    warnings,
    frames: plans.reduce((sum, plan) => sum + plan.frames.length, 0),
    bytes,
  };
}

export function frameBuildSteps(steps, builds, shapeIds) {
  const result = steps.map((step) => ({ ...step, items: [...step.items] }));
  for (const build of builds) {
    let previous;
    for (const frame of build.frames) {
      const target = shapeIds.get(frame.objectName);
      if (!/^\d+$/.test(target ?? ""))
        throw new Error("A compositing frame has no unique emitted shape.");
      if (frame.stepIndex < 0) {
        previous = target;
        continue;
      }
      result[frame.stepIndex].items.push({
        start: frame.time,
        entry: {
          frameVisibility: [
            { target: previous, visible: false },
            { target, visible: true },
          ],
          duration: 0,
          repeat: 1,
          autoReverse: false,
          trigger: "with",
          kind: "emphasis",
        },
      });
      previous = target;
    }
  }
  return result;
}

export function initialFrameNodes(builds, shapeIds, writer) {
  return builds
    .flatMap((build) => build.frames)
    .map((frame) => {
      const target = shapeIds.get(frame.objectName);
      const hidden =
        frame.stepIndex !== -1 ? writer.visibility(target, false) : "";
      return (
        hidden +
        (frame.stepIndex !== -2
          ? writer.numeric(
              target,
              "ppt_x",
              [
                [0, -2],
                [1, -2],
              ],
              1,
            )
          : "")
      );
    })
    .join("");
}
