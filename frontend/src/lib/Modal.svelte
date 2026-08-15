<script lang="ts">
  // The chrome every dialog shares: a veil, a box, a title, and a row of
  // actions at the bottom.
  //
  // A dialog rather than a row that unfolds in place, for the things that are a
  // CHOICE. An inline row appears where you were not looking, can be walked
  // away from without deciding, and moves everything under it while it is open.
  // A modal asks the question, takes an answer or a cancel, and leaves.
  import type { Snippet } from "svelte";

  type Props = {
    open: boolean;
    title: string;
    /** Quiet, after the title — which sprite or part this is about. */
    subject?: string;
    children: Snippet;
    footer: Snippet;
    onclose: () => void;
    /** Enter, when the dialog has something to confirm. */
    onconfirm?: () => void;
  };

  let { open, title, subject, children, footer, onclose, onconfirm }: Props = $props();

  let box: HTMLDivElement | null = $state(null);

  // Focus goes into the box, which is what makes Escape work without a global
  // handler, and what stops a keystroke reaching the editor behind it.
  //
  // `data-autofocus` outranks document order, for the dialog that is only
  // buttons: its first button is Cancel, and focusing that would turn Enter —
  // the confirming key everywhere else — into a dismissal.
  $effect(() => {
    if (!open) return;
    queueMicrotask(() => {
      const first = box?.querySelector<HTMLElement>(
        "[data-autofocus], input:not([type=hidden]), select, button:not(:disabled)",
      );
      (first ?? box)?.focus();
    });
  });
</script>

{#if open}
  <div
    class="veil"
    role="presentation"
    onpointerdown={onclose}
    oncontextmenu={(e) => e.preventDefault()}
  ></div>
  <div
    class="box"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    bind:this={box}
    onkeydown={(e) => {
      if (e.key === "Escape") onclose();
      if (e.key === "Enter" && !e.isComposing && onconfirm) {
        const t = e.target as HTMLElement;
        // Enter on a button is that button, not the dialog's answer.
        if (t?.tagName !== "BUTTON" && t?.tagName !== "SELECT") onconfirm();
      }
      e.stopPropagation();
    }}
  >
    <h2>
      {title}{#if subject}<span class="who">{subject}</span>{/if}
    </h2>
    <div class="body">{@render children()}</div>
    <div class="acts">{@render footer()}</div>
  </div>
{/if}

<style>
  .veil {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(0, 0, 0, 0.45);
  }
  .box {
    position: fixed;
    z-index: 51;
    left: 50%;
    top: 40%;
    transform: translate(-50%, -50%);
    min-width: 21rem;
    max-width: 30rem;
    display: grid;
    gap: 0.8rem;
    padding: 1rem;
    background: var(--halo-bg-main);
    border: 1px solid var(--halo-border);
    border-radius: var(--halo-radius);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
    /* Beside the app shell, not inside it, so it states its own typography. */
    font-family: var(--halo-font-body);
    color: var(--halo-text-main);
  }
  .box:focus-visible {
    outline: none;
  }
  h2 {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.9rem;
    font-weight: 600;
  }
  .who {
    font-weight: 400;
    font-size: 0.78rem;
    color: var(--halo-text-light);
  }
  .body {
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }
  .acts {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  /* The footer's buttons, styled HERE so four dialogs stop carrying four copies
     of the same CSS. `.go` is the confirming action, `.go.danger` the
     destructive one, `.gap` pushes what follows to the right. */
  .acts > :global(button) {
    background: var(--halo-bg-light);
    color: var(--halo-text-main);
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    padding: 0.3rem 0.7rem;
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .acts > :global(button:hover:not(:disabled)) {
    border-color: var(--halo-text-light);
  }
  .acts > :global(button.go) {
    border-color: var(--halo-accent);
    color: var(--halo-accent);
    background: var(--halo-accent-soft);
  }
  .acts > :global(button.go.danger) {
    border-color: var(--halo-error);
    color: var(--halo-error);
    background: none;
  }
  .acts > :global(button:disabled) {
    opacity: 0.4;
    cursor: default;
  }
  .acts > :global(.gap) {
    flex: 1;
  }
</style>
