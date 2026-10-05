"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const EDGE_ZONE_PX = 72;
const EDGE_SPEED_PX_PER_SECOND = 290;

export default function ChaosiumBeltRail({
  children,
}: {
  children: ReactNode;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const directionRef = useRef<-1 | 0 | 1>(0);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const stopEdgeGlide = useCallback(() => {
    directionRef.current = 0;
    lastFrameRef.current = null;
    if (animationRef.current != null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  const tick = useCallback(
    (now: number) => {
      const node = scrollerRef.current;
      const direction = directionRef.current;
      if (!node || direction === 0) {
        stopEdgeGlide();
        return;
      }

      const previous = lastFrameRef.current ?? now;
      const elapsedSeconds = Math.min(0.05, Math.max(0, (now - previous) / 1000));
      lastFrameRef.current = now;
      node.scrollLeft += direction * EDGE_SPEED_PX_PER_SECOND * elapsedSeconds;
      animationRef.current = requestAnimationFrame(tick);
    },
    [stopEdgeGlide],
  );

  const startEdgeGlide = useCallback(
    (direction: -1 | 1) => {
      directionRef.current = direction;
      if (animationRef.current == null) {
        lastFrameRef.current = null;
        animationRef.current = requestAnimationFrame(tick);
      }
    },
    [tick],
  );

  useEffect(() => stopEdgeGlide, [stopEdgeGlide]);

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const node = scrollerRef.current;
    if (!node) return;

    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      const delta = event.clientX - drag.startX;
      if (Math.abs(delta) > 4) drag.moved = true;
      node.scrollLeft = drag.startScrollLeft - delta;
      return;
    }

    if (event.pointerType !== "mouse") {
      stopEdgeGlide();
      return;
    }

    const rect = node.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (x <= EDGE_ZONE_PX) {
      startEdgeGlide(-1);
    } else if (x >= rect.width - EDGE_ZONE_PX) {
      startEdgeGlide(1);
    } else {
      stopEdgeGlide();
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    const node = scrollerRef.current;
    if (!node) return;
    stopEdgeGlide();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: node.scrollLeft,
      moved: false,
    };
    node.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const node = scrollerRef.current;
    const drag = dragRef.current;
    if (!node || !drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (node.hasPointerCapture(event.pointerId)) {
      node.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  }

  function scrollOne(direction: -1 | 1) {
    const node = scrollerRef.current;
    if (!node) return;
    const card = node.querySelector<HTMLElement>("[data-chaosium-belt-card]");
    const distance = (card?.offsetWidth ?? 340) + 16;
    node.scrollBy({ left: direction * distance, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        data-testid="chaosium-belt-rail"
        className={`aoe2-nav-scroll flex w-full snap-x snap-proximity items-stretch gap-4 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          dragging ? "cursor-grabbing select-none snap-none" : "cursor-grab"
        }`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          stopEdgeGlide();
          setDragging(false);
          dragRef.current = null;
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            scrollOne(-1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            scrollOne(1);
          }
        }}
        tabIndex={0}
        aria-label="Championship belt lineage rail"
      >
        {children}
      </div>

      <button
        type="button"
        aria-label="Previous championships"
        title="Previous championships"
        onClick={() => scrollOne(-1)}
        onMouseEnter={() => startEdgeGlide(-1)}
        onMouseLeave={stopEdgeGlide}
        className="absolute inset-y-0 left-0 z-30 w-8 cursor-w-resize bg-transparent opacity-0 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-amber-100/20"
      />
      <button
        type="button"
        aria-label="Next championships"
        title="Next championships"
        onClick={() => scrollOne(1)}
        onMouseEnter={() => startEdgeGlide(1)}
        onMouseLeave={stopEdgeGlide}
        className="absolute inset-y-0 right-0 z-30 w-8 cursor-e-resize bg-transparent opacity-0 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-amber-100/20"
      />
    </div>
  );
}
