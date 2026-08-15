<script lang="ts">
  // The popup itself. Mounted once, by App, so it can sit over any panel
  // regardless of what that panel does with overflow.
  import { closeMenu, menu } from "./menu.svelte";

  let box: HTMLDivElement | null = $state(null);
  let w = $state(0);
  let h = $state(0);
  let vw = $state(0);
  let vh = $state(0);

  const PAD = 8;
  // Clamped horizontally, flipped vertically: a menu that would run off the
  // bottom opens upwards from the cursor rather than sliding away from the thing
  // that was clicked.
  const x = $derived(Math.max(PAD, Math.min(menu.x, vw - w - PAD)));
  const y = $derived(menu.y + h + PAD > vh ? Math.max(PAD, menu.y - h) : menu.y);

  // Opening moves focus into the menu, which is what makes Escape and the arrow
  // keys work without a global key handler fighting the editor's own.
  $effect(() => {
    if (!menu.open) return;
    queueMicrotask(() => box?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
  });

  function keydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeMenu();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(box?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    items[(at + step + items.length) % items.length].focus();
  }

  function pick(item: Extract<(typeof menu.items)[number], { kind?: "item" }>) {
    closeMenu();
    item.run();
  }
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} onresize={closeMenu} />

{#if menu.open}
  <!-- A full-screen catcher rather than a document listener: it closes on any
       press outside, and it stops that press from also landing on whatever it
       was over — clicking away from a menu should dismiss it, not draw a pixel. -->
  <div
    class="veil"
    role="presentation"
    onpointerdown={closeMenu}
    oncontextmenu={(e) => {
      e.preventDefault();
      closeMenu();
    }}
    onwheel={closeMenu}
  ></div>
  <div
    class="menu"
    role="menu"
    tabindex="-1"
    aria-label={menu.title}
    bind:this={box}
    bind:clientWidth={w}
    bind:clientHeight={h}
    style:left={`${x}px`}
    style:top={`${y}px`}
    onkeydown={keydown}
  >
    {#if menu.title}<p class="title">{menu.title}</p>{/if}
    {#each menu.items as item, i (i)}
      {#if item.kind === "separator"}
        <hr />
      {:else}
        <button
          role="menuitem"
          class:danger={item.danger}
          disabled={item.disabled}
          onclick={() => pick(item)}
        >
          {#if item.swatch}<span class="chip" style:background={item.swatch}></span>{/if}
          <span class="label">{item.label}</span>
          {#if item.hint}<span class="hint">{item.hint}</span>{/if}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .veil {
    position: fixed;
    inset: 0;
    z-index: 40;
  }
  .menu {
    position: fixed;
    z-index: 41;
    min-width: 11rem;
    max-width: 18rem;
    padding: 0.2rem;
    display: grid;
    gap: 0.05rem;
    background: var(--halo-bg-main);
    border: 1px solid var(--halo-border);
    border-radius: var(--halo-radius);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    /* Stated rather than inherited: this is mounted beside the app shell, not
       inside it, so there is no ancestor carrying the app's typography. */
    font-family: var(--halo-font-body);
    color: var(--halo-text-main);
  }
  .title {
    margin: 0;
    padding: 0.2rem 0.45rem 0.3rem;
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--halo-text-light);
  }
  hr {
    margin: 0.15rem 0.3rem;
    border: 0;
    border-top: 1px solid var(--halo-border);
  }
  button {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.28rem 0.45rem;
    background: none;
    border: 0;
    border-radius: 4px;
    color: var(--halo-text-main);
    font: inherit;
    font-size: 0.78rem;
    text-align: left;
    cursor: pointer;
  }
  button:hover:not(:disabled),
  button:focus-visible {
    background: var(--halo-accent-soft);
    outline: none;
  }
  button:disabled {
    color: var(--halo-text-light);
    cursor: default;
  }
  button.danger:hover:not(:disabled) {
    color: var(--halo-error);
  }
  .label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hint {
    font-size: 0.68rem;
    color: var(--halo-text-light);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .chip {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 2px;
    flex: none;
    box-shadow: 0 0 0 1px var(--halo-border);
  }
</style>
