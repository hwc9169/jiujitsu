"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TooltipState = {
  open: boolean;
  text: string;
  left: number;
  top: number;
};

const EMPTY_TOOLTIP: TooltipState = {
  open: false,
  text: "",
  left: 0,
  top: 0,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getTooltipTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const candidate = target.closest("[data-tooltip]");
  if (!(candidate instanceof HTMLElement)) return null;
  const text = candidate.dataset.tooltip?.trim();
  if (!text) return null;
  return candidate;
}

function getPosition(target: HTMLElement) {
  const rect = target.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const left = clamp(rect.left + rect.width / 2, 10, viewportWidth - 10);
  const top = Math.max(rect.top - 8, 10);
  return { left, top };
}

export function GlobalTooltip() {
  const [state, setState] = useState<TooltipState>(EMPTY_TOOLTIP);
  const activeRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const show = (target: HTMLElement) => {
      const text = target.dataset.tooltip?.trim();
      if (!text) return;
      activeRef.current = target;
      const next = getPosition(target);
      setState({
        open: true,
        text,
        left: next.left,
        top: next.top,
      });
    };

    const hide = () => {
      activeRef.current = null;
      setState(EMPTY_TOOLTIP);
    };

    const syncPosition = () => {
      const current = activeRef.current;
      if (!current) return;
      const next = getPosition(current);
      setState((prev) => ({
        ...prev,
        left: next.left,
        top: next.top,
      }));
    };

    const onPointerOver = (event: PointerEvent) => {
      const target = getTooltipTarget(event.target);
      if (!target) return;
      if (target === activeRef.current) return;
      show(target);
    };

    const onPointerOut = (event: PointerEvent) => {
      const current = activeRef.current;
      if (!current) return;
      const related = event.relatedTarget;
      if (related instanceof Node && current.contains(related)) return;

      const target = getTooltipTarget(event.target);
      if (target && target === current) {
        hide();
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = getTooltipTarget(event.target);
      if (!target) return;
      show(target);
    };

    const onFocusOut = (event: FocusEvent) => {
      const current = activeRef.current;
      if (!current) return;
      const related = event.relatedTarget;
      if (related instanceof Node && current.contains(related)) return;
      if (event.target === current) hide();
    };

    const onPointerDown = () => hide();
    const onScroll = () => syncPosition();
    const onResize = () => syncPosition();

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  if (!state.open) return null;

  return createPortal(
    <div
      className="floating-tooltip"
      role="tooltip"
      style={{
        left: `${state.left}px`,
        top: `${state.top}px`,
      }}
    >
      {state.text}
      <span className="floating-tooltip-arrow" aria-hidden="true" />
    </div>,
    document.body,
  );
}
