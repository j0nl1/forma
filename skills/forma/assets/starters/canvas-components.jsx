import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./canvas-runtime.js";
import { reconcileCanvas, visibleBoards } from "./canvas-model.js";
function flatten(children) {
  return React.Children.toArray(children).flatMap((child) =>
    React.isValidElement(child) && child.type === React.Fragment
      ? flatten(child.props.children)
      : [child],
  );
}
// Marker components are interpreted by DesignCanvas; arbitrary wrappers remain ordinary content.
export function DCSection() {
  return null;
}
export function DCArtboard() {
  return null;
}
export function DCPostIt({
  children,
  top,
  left,
  right,
  bottom,
  rotate = -2,
  width = 180,
  style,
}) {
  return (
    <design-note
      top={top}
      left={left}
      right={right}
      bottom={bottom}
      rotate={rotate}
      width={width}
      style={style}
    >
      {children}
    </design-note>
  );
}
export function DesignCanvas({
  children,
  minScale = 0.1,
  maxScale = 8,
  style,
  id,
  stateFile,
  allowExternalAssets = false,
}) {
  const element = useRef(null);
  const source = useMemo(
    () =>
      flatten(children)
        .filter(
          (child) => React.isValidElement(child) && child.type === DCSection,
        )
        .map((section) => ({
          id: String(section.props.id ?? section.props.title),
          title: section.props.title ?? "Untitled section",
          subtitle: section.props.subtitle ?? "",
          props: section.props,
          boards: flatten(section.props.children)
            .filter(
              (child) =>
                React.isValidElement(child) && child.type === DCArtboard,
            )
            .map((board) => ({
              id: String(board.props.id ?? board.props.label),
              label: board.props.label ?? "Option",
              props: board.props,
            })),
          rest: flatten(section.props.children).filter(
            (child) =>
              !React.isValidElement(child) || child.type !== DCArtboard,
          ),
        })),
    [children],
  );
  const [state, setState] = useState(() => reconcileCanvas(source));
  const [portal, setPortal] = useState(null);
  const displayed = reconcileCanvas(source, state);
  useLayoutEffect(() => {
    const canvas = element.current;
    canvas.managed = true;
    const changed = (event) => setState(event.detail);
    canvas.addEventListener("codex-canvas-change", changed);
    canvas.renderFocus = (focus, mount) =>
      setPortal(focus ? { ...focus, mount } : null);
    return () => {
      canvas.removeEventListener("codex-canvas-change", changed);
      canvas.renderFocus = null;
    };
  }, []);
  useLayoutEffect(() => {
    element.current.setSource(source);
  }, [source]);
  useLayoutEffect(() => {
    const canvas = element.current;
    for (const section of canvas.querySelectorAll("design-section")) {
      section.ownerCanvas = canvas;
      section.sectionId = section.getAttribute("canvas-id");
      section.titleInput.value =
        displayed.sections[section.sectionId].title ??
        source.find((entry) => entry.id === section.sectionId).title;
      for (const board of [...section.children].filter(
        (node) => node.localName === "design-board",
      )) {
        board.ownerCanvas = canvas;
        board.sectionId = section.sectionId;
        board.boardId = board.getAttribute("canvas-id");
        board.updateLabel();
        const authored = source
          .find((entry) => entry.id === section.sectionId)
          .boards.find((entry) => entry.id === board.boardId);
        const card = board.shadowRoot.querySelector(".card");
        card.style.cssText = "";
        Object.assign(card.style, authored.props.style ?? {});
      }
    }
  });
  const focusedSection =
    portal && source.find((section) => section.id === portal.section);
  const focusedBoard = focusedSection?.boards.find(
    (board) => board.id === portal.board,
  );
  const rest = flatten(children).filter(
    (child) => !React.isValidElement(child) || child.type !== DCSection,
  );
  return (
    <>
      <design-canvas
        ref={element}
        id={id}
        min-scale={minScale}
        max-scale={maxScale}
        state-file={stateFile}
        allow-external-assets={allowExternalAssets ? "" : undefined}
        style={{ width: "100vw", height: "100vh", ...style }}
      >
        {source.map((section) => (
          <design-section
            key={section.id}
            canvas-id={section.id}
            title={section.title}
            subtitle={section.subtitle}
            gap={section.props.gap ?? 48}
            style={section.props.style}
          >
            {visibleBoards(section, displayed.sections[section.id]).map(
              (board) => (
                <design-board
                  key={board.id}
                  canvas-id={board.id}
                  label={
                    displayed.sections[section.id].labels[board.id] ??
                    board.label
                  }
                  width={board.props.width ?? 260}
                  height={board.props.height ?? 480}
                >
                  {board.props.children}
                </design-board>
              ),
            )}
            {section.rest}
          </design-section>
        ))}
        {rest}
      </design-canvas>
      {portal &&
        focusedBoard &&
        createPortal(
          <div
            style={{
              width: "100%",
              height: "100%",
              ...focusedBoard.props.style,
            }}
          >
            {focusedBoard.props.children}
          </div>,
          portal.mount,
        )}
    </>
  );
}
Object.assign(window, { DesignCanvas, DCSection, DCArtboard, DCPostIt });
