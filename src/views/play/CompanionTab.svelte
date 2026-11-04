<!--
  A companion's middle column: on "combat" its attacks and its traits and features, on "notes" the rules
  text of the feature that gave it (MPMB writes Find Familiar's or Pact of the Chain's text there) and the
  page's own notes.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import type { Companion } from '../../play/companions.ts';
  import RichText from './RichText.svelte';

  interface Props {
    companion: Companion;
    part: 'combat' | 'notes';
    t: Texts;
  }

  let { companion, part, t }: Props = $props();

  const traits = $derived([companion.traits, companion.features].filter(Boolean).join('\r'));
</script>

{#if part === 'combat'}
  <section class="panel" aria-labelledby="companion-attacks-title">
    <div class="head">
      <h2 id="companion-attacks-title">{t.attacks}</h2>
      {#if Number(companion.attacksPerAction) > 1}
        <span class="muted">{fill(t.attacksPerAction, { count: companion.attacksPerAction })}</span>
      {/if}
    </div>
    {#each companion.attacks as attack (attack.row)}
      <div class="attack">
        <span class="name">{attack.name}</span>
        <span class="hit">
          {#if attack.toHit}<span class="badge">{attack.toHit}</span>{/if}
          {#if attack.damage}<span class="badge damage">{attack.damage} <small>{attack.damageType}</small></span>{/if}
        </span>
        <span class="muted">{[attack.range, attack.description].filter(Boolean).join(', ')}</span>
      </div>
    {:else}
      <p class="muted">{t.noAttacks}</p>
    {/each}
  </section>

  {#if traits}
    <section class="panel text" aria-labelledby="companion-traits-title">
      <h2 id="companion-traits-title">{t.companionTraits}</h2>
      <RichText text={traits} />
    </section>
  {/if}
{:else}
  {#if companion.rules.length}
    <section class="panel text" aria-labelledby="companion-rules-title">
      <h2 id="companion-rules-title">{t.companionRules}</h2>
      {#each companion.rules as rule, i (i)}<RichText text={rule} />{/each}
    </section>
  {/if}
  {#if companion.notes.length}
    <section class="panel text" aria-labelledby="companion-notes-title">
      <h2 id="companion-notes-title">{t.tabNotes}</h2>
      {#each companion.notes as note, i (i)}<RichText text={note} />{/each}
    </section>
  {/if}
  {#if !companion.rules.length && !companion.notes.length}
    <p class="muted">{t.companionEmpty}</p>
  {/if}
{/if}

<style>
  .panel {
    margin-bottom: 0.625rem;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 800;
  }

  p {
    margin: 0;
  }

  .muted {
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }

  .attack {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.125rem 0.75rem;
    padding: 0.5rem 0;
    border-top: 1px solid var(--line);
  }

  .attack:first-of-type {
    padding-top: 0;
    border-top: 0;
  }

  .name {
    font-size: 1.0625rem;
    font-weight: 800;
  }

  .hit {
    grid-row: span 2;
    align-self: center;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.375rem;
  }

  .badge {
    display: inline-grid;
    place-items: center;
    min-width: 3.5rem;
    min-height: 44px;
    padding: 0 0.5rem;
    border-radius: 0.5rem;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 1.125rem;
    font-weight: 800;
    line-height: 1.1;
    text-align: center;
  }

  .badge.damage {
    background: var(--hover);
    color: var(--ink);
  }

  .badge small {
    font-size: 0.75rem;
    font-weight: 600;
  }

  .text {
    line-height: 1.45;
  }
</style>
