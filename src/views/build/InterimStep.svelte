<!--
  Build steps 6 and 7 until their own design comes (the next M6 update): MPMB's own menus for the
  class and species choices, and a note about the modifiers.
-->
<script lang="ts">
  import type { Texts } from '../../i18n.ts';
  import type { Step } from '../../session.svelte.ts';
  import type { BuildStep } from './steps.ts';

  interface Props {
    step: Extract<BuildStep, 'choices' | 'modifiers'>;
    disabled: boolean;
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { step, disabled, change, t }: Props = $props();
</script>

<section class="card">
  <h2>{step === 'choices' ? t.buildChoices : t.buildModifiers}</h2>
  <p class="soon">{t.buildComingNext}</p>

  {#if step === 'choices'}
    <div class="buttons">
      <button type="button" {disabled} onclick={() => change([{ click: 'Class Features Menu' }])}>
        {t.buildClassChoices}
      </button>
      <button type="button" {disabled} onclick={() => change([{ click: 'Race Features Menu' }])}>
        {t.buildSpeciesChoices}
      </button>
    </div>
  {:else}
    <p class="hint">{t.buildModifiersLater}</p>
  {/if}
</section>

<style>
  .card {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    padding: 1rem 1.25rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
  }

  p {
    margin: 0;
  }

  .soon {
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--accent-soft);
  }

  .hint {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
