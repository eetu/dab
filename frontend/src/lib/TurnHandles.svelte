<script lang="ts">
  // The handles a turn hangs on the art: the rotate arm about the pivot, or the
  // hinge line a swing or a tilt turns about. On the art rather than in the bar,
  // because the thing a turn is about belongs on the thing being turned.
  import { type Box, type SpriteBody } from "dab-core";

  import { setHinge, setTurn, turning } from "./editor.svelte";
  import { viewport } from "./viewport.svelte";

  let {
    canvas,
    box,
    origin,
    px,
    node,
  }: {
    canvas: HTMLCanvasElement | null;
    /** The stage: the assembly's box, in the sprite's cells. */
    box: Box;
    /** The active node's top-left, in stage cells. */
    origin: { x: number; y: number };
    /** Screen pixels per cell. */
    px: number;
    node: SpriteBody;
  } = $props();

  // A dot on an arm, hung off the turn's pivot — dragging it is how every
  // transform tool says "rotate me", and the bar's slider was the only way in.
  // 0° points the arm up; clockwise follows the drag.

  /** The pivot in the ACTIVE node's cells. A whole-node turn RESIZES the node
   *  at every angle (grow-to-fit recentres the art), so its pivot is wherever
   *  the node's centre is NOW — pinning the centre captured at begin left the
   *  handle orbiting a point the art had moved away from. A selection's pivot
   *  is fixed: the block is stamped about the same centre throughout. */
  const pivotCells = $derived(
    turning.whole ? { x: node.w / 2, y: node.h / 2 } : { x: turning.cx, y: turning.cy },
  );
  /** Pivot and handle tip in STAGE pixels (CSS px inside the stage box). */
  const pivotPx = $derived({
    x: (origin.x + pivotCells.x) * px,
    y: (origin.y + pivotCells.y) * px,
  });
  /** Arm length, capped so the grip stays INSIDE the pane — the art's radius
   *  at a deep zoom is hundreds of pixels, most of them past the edge. The
   *  stage sits centred plus the pan, so its pane offset is derivable. */
  const armPx = $derived.by(() => {
    const stageLeft = viewport.paneW / 2 - (box.w * px) / 2 + viewport.tx;
    const stageTop = viewport.paneH / 2 - (box.h * px) / 2 + viewport.ty;
    const cx = stageLeft + pivotPx.x;
    const cy = stageTop + pivotPx.y;
    const room = Math.min(cx, cy, viewport.paneW - cx, viewport.paneH - cy) - 14;
    return Math.max(24, Math.min(turning.r * px, 140, room));
  });
  const handlePx = $derived.by(() => {
    const rad = ((turning.angle - 90) * Math.PI) / 180;
    return { x: pivotPx.x + armPx * Math.cos(rad), y: pivotPx.y + armPx * Math.sin(rad) };
  });
  const snapped = $derived(turning.on && turning.angle % 90 === 0);

  /** Drag the hinge line to any column (a swing) or row (a tilt). Whole cells:
   *  a hinge between two pixels is not a thing this grid can express. */
  function dragHinge(e: PointerEvent) {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer — the drag still works, it just isn't captured */
    }
    const move = (ev: PointerEvent) => {
      // Stage pixels to the ACTIVE NODE's own, which is what a hinge is in:
      // the door's third column is the third column of the door.
      const rect = canvas!.getBoundingClientRect();
      const at =
        turning.axis === "x"
          ? ((ev.clientY - rect.top) / rect.height) * box.h - origin.y
          : ((ev.clientX - rect.left) / rect.width) * box.w - origin.x;
      setHinge(at);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /** Freehand snaps to the quarters, ⌘ glides past them — the same bargain the
   *  resize dialog's guides strike, said with the same accent when it bites. */
  const SNAP_DEG = 7;
  function dragHandle(e: PointerEvent) {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer — the drag still works, it just isn't captured */
    }
    const move = (ev: PointerEvent) => {
      // The rect and the pivot, FRESH each move: a whole-node turn resizes the
      // stage under the drag, and a rect captured at pointerdown mapped every
      // later pointer through geometry that no longer existed.
      const rect = canvas!.getBoundingClientRect();
      const sx = ((ev.clientX - rect.left) / rect.width) * box.w;
      const sy = ((ev.clientY - rect.top) / rect.height) * box.h;
      const dx = sx - (origin.x + pivotCells.x);
      const dy = sy - (origin.y + pivotCells.y);
      if (!dx && !dy) return;
      let deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI) + 90;
      if (deg > 180) deg -= 360;
      if (!ev.metaKey && !ev.ctrlKey) {
        const near = Math.round(deg / 90) * 90;
        if (Math.abs(deg - near) <= SNAP_DEG) deg = near === -180 ? 180 : near;
      }
      setTurn(deg);
    };
    move(e);
    const el = e.currentTarget as HTMLElement;
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }
</script>

{#if turning.on && turning.axis !== "z"}
  <!-- The hinge: the line the art swings about, dragged to any column or
         row. Where the rotate handle would be, and for the same reason — the
         thing a turn is about has to be on the art, not in the bar. -->
  <button
    class="hinge"
    class:across={turning.axis === "x"}
    style:left={turning.axis === "y" ? `${(origin.x + turning.hinge) * px}px` : "0"}
    style:top={turning.axis === "x" ? `${(origin.y + turning.hinge) * px}px` : "0"}
    title="Drag the hinge — the line the art turns about"
    aria-label="Hinge"
    onpointerdown={(e) => {
      e.stopPropagation();
      dragHinge(e);
    }}
  ></button>
{/if}
{#if turning.on && turning.axis === "z"}
  <!-- The rotation handle: an arm from the pivot, a grip at its end. Accent
         when the angle sits on a quarter — the snap made visible. -->
  <div
    class="rotarm"
    class:snapped
    style:left={`${pivotPx.x}px`}
    style:top={`${pivotPx.y}px`}
    style:width={`${armPx}px`}
    style:transform={`rotate(${turning.angle - 90}deg)`}
  ></div>
  <button
    class="rotgrip"
    class:snapped
    style:left={`${handlePx.x}px`}
    style:top={`${handlePx.y}px`}
    title="Drag to rotate — snaps at 90°, ⌘ glides free"
    aria-label="Rotate by dragging"
    onpointerdown={(e) => {
      e.stopPropagation();
      dragHandle(e);
    }}
  ></button>
{/if}

<style>
  /* The rotate handle. The arm pivots about its LEFT edge, which sits on the
     turn's centre; the grip is a real button so it can take the pointer before
     the pane's capture does. */
  /* The hinge: a line across the whole stage, because the art swings about the
     LINE and not about the piece of it the door happens to cover. Grabbable
     well past its one pixel of width — a 1px target at ×4 is not a target. */
  .hinge {
    position: absolute;
    z-index: 3;
    padding: 0;
    border: 0;
    background: none;
    cursor: ew-resize;
    width: 11px;
    height: 100%;
    margin-left: -5px;
  }
  .hinge.across {
    cursor: ns-resize;
    width: 100%;
    height: 11px;
    margin-left: 0;
    margin-top: -5px;
  }
  .hinge::after {
    content: "";
    position: absolute;
    left: 5px;
    top: 0;
    width: 1px;
    height: 100%;
    background: var(--halo-accent);
  }
  .hinge.across::after {
    left: 0;
    top: 5px;
    width: 100%;
    height: 1px;
  }
  .rotarm {
    position: absolute;
    height: 1px;
    background: rgba(150, 205, 255, 0.55);
    transform-origin: left center;
    pointer-events: none;
  }
  .rotarm.snapped {
    background: var(--halo-accent);
    height: 2px;
  }
  .rotgrip {
    position: absolute;
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid rgba(150, 205, 255, 0.9);
    background: var(--halo-bg-main);
    cursor: grab;
    touch-action: none;
  }
  .rotgrip:active {
    cursor: grabbing;
  }
  .rotgrip.snapped {
    border-color: var(--halo-accent);
  }
</style>
