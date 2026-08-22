"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type AnchorRef = {
  current: HTMLElement | null;
};

type FloatingChatPanelProps = {
  open: boolean;
  anchorRef: AnchorRef;
  onRequestClose: () => void;
  children: ReactNode;
  width?: number;
  estimatedHeight?: number;
  align?: "start" | "center" | "end";
  className?: string;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
};

const VIEWPORT_MARGIN = 10;
const PANEL_GAP = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export default function FloatingChatPanel({
  open,
  anchorRef,
  onRequestClose,
  children,
  width = 320,
  estimatedHeight = 360,
  align = "end",
  className = "",
  onPointerEnter,
  onPointerLeave,
}: FloatingChatPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    visibility: "hidden" as "hidden" | "visible",
  });

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || typeof window === "undefined") return;

    const anchorRect = anchor.getBoundingClientRect();
    const panel = panelRef.current;
    const panelWidth = panel?.offsetWidth || width;
    const panelHeight = panel?.offsetHeight || estimatedHeight;
    const roomAbove = anchorRect.top - VIEWPORT_MARGIN - PANEL_GAP;
    const roomBelow =
      window.innerHeight - anchorRect.bottom - VIEWPORT_MARGIN - PANEL_GAP;
    const placeBelow =
      roomBelow >= Math.min(panelHeight, estimatedHeight) || roomBelow >= roomAbove;

    let left = anchorRect.right - panelWidth;
    if (align === "start") left = anchorRect.left;
    if (align === "center") {
      left = anchorRect.left + anchorRect.width / 2 - panelWidth / 2;
    }
    left = clamp(
      left,
      VIEWPORT_MARGIN,
      window.innerWidth - panelWidth - VIEWPORT_MARGIN,
    );

    let top = placeBelow
      ? anchorRect.bottom + PANEL_GAP
      : anchorRect.top - panelHeight - PANEL_GAP;
    top = clamp(
      top,
      VIEWPORT_MARGIN,
      window.innerHeight - panelHeight - VIEWPORT_MARGIN,
    );

    setPosition({ top, left, visibility: "visible" });
  }, [align, anchorRef, estimatedHeight, width]);

  useLayoutEffect(() => {
    if (!open || typeof window === "undefined") return;

    setPosition((current) => ({ ...current, visibility: "hidden" }));
    place();
    const frame = window.requestAnimationFrame(place);

    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onRequestClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onRequestClose();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, onRequestClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      className={className}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        width,
        maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
        maxHeight: `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`,
        zIndex: 1200,
        visibility: position.visibility,
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </div>,
    document.body,
  );
}
