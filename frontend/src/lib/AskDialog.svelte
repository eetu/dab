<script lang="ts">
  // ask()/confirmed(), rendered. Built on Modal like every other dialog — this
  // one used to hand-roll its chrome and only ever focused a text field, so the
  // two destructive confirms in the app (Discard, Revert), which have no text
  // field, were deaf to Escape and Enter.
  import { dialog, settle } from "./dialog.svelte";
  import Modal from "./Modal.svelte";

  let field: HTMLInputElement | null = $state(null);
  let value = $state("");

  // Opening seeds the field and selects it, so a rename is type-and-Enter.
  $effect(() => {
    if (!dialog.open) return;
    value = dialog.spec?.value ?? "";
    queueMicrotask(() => field?.select());
  });

  const ok = $derived(!dialog.spec?.label || !!value.trim());
  const submit = () => {
    if (ok) settle(dialog.spec?.label ? value.trim() : "");
  };
</script>

{#if dialog.spec}
  {@const spec = dialog.spec}
  <Modal open={dialog.open} title={spec.title} onclose={() => settle(null)} onconfirm={submit}>
    {#if spec.label}
      <label>
        <span>{spec.label}</span>
        <input bind:this={field} bind:value spellcheck="false" placeholder={spec.placeholder} />
      </label>
    {/if}
    {#if spec.note}<p class="note">{spec.note}</p>{/if}

    {#snippet footer()}
      <span class="gap"></span>
      <button onclick={() => settle(null)}>Cancel</button>
      <!-- Autofocused when there is no field: the first button would be Cancel,
           and Enter must keep meaning yes. -->
      <button
        class="go"
        class:danger={spec.danger}
        disabled={!ok}
        data-autofocus={spec.label ? undefined : true}
        onclick={submit}
      >
        {spec.confirm ?? "OK"}
      </button>
    {/snippet}
  </Modal>
{/if}

<style>
  label {
    display: grid;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--halo-text-muted);
  }
  input {
    background: var(--halo-bg-light);
    color: var(--halo-text-main);
    border: 1px solid var(--halo-border);
    border-radius: 4px;
    padding: 0.35rem 0.45rem;
    font: inherit;
    font-size: 0.85rem;
  }
  input:focus-visible {
    outline: 2px solid var(--halo-accent);
    outline-offset: -1px;
  }
  .note {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--halo-text-light);
  }
</style>
