<script lang="ts">
  // A square button with an icon in it.
  //
  // Its own component because five panels had each grown their own: different
  // sizes, different hit areas, different ideas of what "on" looks like. The
  // label is required and is both the tooltip and the accessible name — an icon
  // button with neither is a rebus.
  import type { Snippet } from "svelte";

  type Props = {
    children: Snippet;
    /** The control's NAME, and the tooltip when there is no hint. Stable:
     *  a Play button is called Play whether or not it can be pressed. */
    label: string;
    /** What the tooltip says instead, when the situation needs explaining —
     *  "a single frame has nothing to play" is a reason, not a name. */
    hint?: string;
    onclick: (e: MouseEvent) => void;
    /** Pressed, in the toggle sense: this state is currently on. */
    active?: boolean;
    disabled?: boolean;
    /** Destructive, so hover says so before the press does. */
    danger?: boolean;
    /** `sm` for inside a dense list row, `md` for a panel header. */
    size?: "sm" | "md";
    /** Quieter until hovered — for the trigger on a row that is mostly content. */
    ghost?: boolean;
    /** Round and rail-sized — the tool rail's shape. */
    pill?: boolean;
  };

  let {
    children,
    label,
    hint,
    onclick,
    active = false,
    disabled = false,
    danger = false,
    size = "md",
    ghost = false,
    pill = false,
  }: Props = $props();
</script>

<button
  class:on={active}
  class:danger
  class:ghost
  class:pill
  data-size={size}
  {disabled}
  title={hint ?? label}
  aria-label={label}
  aria-pressed={active}
  {onclick}
>
  {@render children()}
</button>

<style>
  button {
    display: grid;
    place-items: center;
    background: var(--halo-bg-main);
    color: var(--halo-text-main);
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    cursor: pointer;
    padding: 0;
    font: inherit;
    line-height: 1;
  }
  /* A hit area that does not shrink with the icon: a 12px glyph in a dense row
     still needs something a pointer can land on. */
  button[data-size="sm"] {
    min-width: 1.4rem;
    min-height: 1.4rem;
  }
  button[data-size="md"] {
    min-width: 1.7rem;
    min-height: 1.6rem;
  }
  button.ghost {
    background: none;
    border-color: transparent;
    color: var(--halo-text-muted);
  }
  button.ghost:hover:not(:disabled) {
    background: var(--halo-bg-main);
    border-color: var(--halo-border);
    color: var(--halo-text-main);
  }
  button:hover:not(:disabled) {
    border-color: var(--halo-text-light);
  }
  button.on {
    border-color: var(--halo-accent);
    color: var(--halo-accent);
    background: var(--halo-accent-soft);
  }
  button.danger:hover:not(:disabled) {
    color: var(--halo-error);
    border-color: var(--halo-error);
  }
  button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  button:focus-visible {
    outline: 2px solid var(--halo-accent);
    outline-offset: 1px;
  }
  /* The rail's shape: round, a fixed 2rem, quiet until hovered. Position is
     relative so a caller can pin a shortcut badge inside the circle. */
  button.pill {
    position: relative;
    border-radius: var(--halo-radius-pill);
    width: 2rem;
    height: 2rem;
    background: none;
    border-color: transparent;
    color: var(--halo-text-muted);
  }
  button.pill:hover:not(:disabled) {
    color: var(--halo-text-main);
    border-color: var(--halo-border);
  }
  button.pill.on {
    color: var(--halo-accent);
    border-color: var(--halo-accent);
    background: var(--halo-accent-soft);
  }
</style>
