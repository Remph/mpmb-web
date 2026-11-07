<!--
  The Speed tile's window: Speed and encumbered speed as text, as in the PDF, with where MPMB says the
  speed comes from. A speed that is higher than its sources (an old sheet's typed value counted twice)
  shows at a glance there. MPMB treats whatever differs from its own total as typed in and keeps it on
  top when species, class or feats change later, so writing the fields as text is all the app does.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { Texts } from '../../i18n.ts';
  import type { Step } from '../../session.svelte.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import Modal from '../../popups/Modal.svelte';
  import { valueOf } from '../../play/read.ts';
  import { speedSources, speedSteps } from '../../play/speed.ts';

  interface Props {
    fields: FieldViews;
    change: (steps: Step[]) => void;
    onclose: () => void;
    t: Texts;
  }

  let { fields, change, onclose, t }: Props = $props();

  // What the sheet says when the window opens; typing changes only these copies until Apply.
  const before = untrack(() => ({ speed: valueOf(fields, 'Speed'), encumbered: valueOf(fields, 'Speed encumbered') }));
  let speed = $state(before.speed);
  let encumbered = $state(before.encumbered);
  const sources = $derived(speedSources(fields['Speed']?.userName));
  /** A flying or swimming speed sits on its own line (MPMB joins them with ",\n"); Firefox can't size a box to its text. */
  const rows = (text: string): number => Math.max(1, text.split('\n').length);

  function save() {
    const steps = speedSteps(before, { speed, encumbered });
    if (steps.length) change(steps);
    onclose();
  }
</script>

<Modal title={t.speedEditTitle} onescape={onclose} closeLabel={t.close}>
  <form
    id="speed-form"
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
  >
    <div class="two">
      <label>{t.speedEditSpeed}<textarea rows={rows(speed)} bind:value={speed}></textarea></label>
      <label>{t.speedEditEncumbered}<textarea rows={rows(encumbered)} bind:value={encumbered}></textarea></label>
    </div>
    {#if sources.length}
      <div class="from">
        <h3>{t.speedEditFrom}</h3>
        {#each sources as source (source.mode)}
          {#if sources.length > 1}<p class="mode">{t[`speedMode${source.mode}`]}</p>{/if}
          <ul>
            {#each source.items as item, i (i)}<li>{item}</li>{/each}
          </ul>
        {/each}
      </div>
    {/if}
    <p class="hint">{t.speedEditHint}</p>
  </form>
  {#snippet actions()}
    <button type="button" onclick={onclose}>{t.cancel}</button>
    <button type="submit" form="speed-form" class="primary">{t.apply}</button>
  {/snippet}
</Modal>

<style>
  form {
    display: grid;
    gap: 0.75rem;
  }

  .two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  label {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
  }

  /* Text boxes rather than inputs: a second kind of movement is a second line in MPMB's field. */
  textarea {
    min-width: 0;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 1.125rem;
    font-weight: 700;
    resize: none;
  }

  .from {
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--paper);
    font-size: 0.9375rem;
  }

  h3 {
    margin: 0;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .mode {
    margin: 0.375rem 0 0;
    font-weight: 600;
  }

  ul {
    margin: 0.125rem 0 0;
    padding-left: 1.25rem;
    overflow-wrap: anywhere;
  }

  .hint {
    margin: 0;
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }
</style>
