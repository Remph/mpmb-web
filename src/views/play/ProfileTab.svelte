<!--
  Who the character is: appearance, personality, allies and enemies, backstory. Every box is one of
  the sheet's own fields (page 1, the background page and the notes page of the PDF), saved when it
  loses focus so typing doesn't run MPMB's scripts on every key.
-->
<script lang="ts">
  import type { Texts, UiKey } from '../../i18n.ts';
  import type { Step } from '../../session.svelte.ts';
  import { valueOf } from '../../play/read.ts';
  import type { FieldViews } from '../../worker/views.ts';

  interface Props {
    fields: FieldViews;
    disabled: boolean;
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { fields, disabled, change, t }: Props = $props();

  type Box = readonly [field: string, label: UiKey];
  const FACTS: Box[] = [
    ['Age', 'age'],
    ['Height', 'height'],
    ['Weight', 'weight'],
    ['Sex', 'gender'],
    ['Eyes colour', 'eyes'],
    ['Hair colour', 'hair'],
    ['Skin colour', 'skin'],
    ['Alignment', 'alignment'],
  ];
  const PERSONALITY: Box[] = [
    ['Personality Trait', 'traits'],
    ['Ideal', 'ideal'],
    ['Bond', 'bond'],
    ['Flaw', 'flaw'],
  ];
  const ALLIES: Box[] = [
    ['Background_Organisation', 'allies'],
    ['Background_Enemies', 'enemies'],
  ];
  const FACTION: Box[] = [
    ['Background_Faction.Text', 'faction'],
    ['Background_FactionRank.Text', 'factionRank'],
    ['Background_Renown.Text', 'renown'],
  ];

  /** The stored text, with Acrobat's line breaks ("\r") as the browser's. */
  const text = (field: string): string => valueOf(fields, field).replace(/\r/g, '\n');
  /** Tall enough for what is there plus a line to type on. */
  const rows = (field: string): number => Math.max(2, text(field).split('\n').length + 1);

  function save(field: string, event: Event) {
    const value = (event.currentTarget as HTMLInputElement | HTMLTextAreaElement).value;
    if (value.trim() !== text(field)) change([{ edit: field, text: value }]);
  }
</script>

{#snippet facts(boxes: Box[])}
  <div class="facts">
    {#each boxes as [field, label] (field)}
      {#if fields[field]}
        <label class="fact">
          <span>{t[label]}</span>
          <input type="text" value={text(field)} {disabled} onchange={(event) => save(field, event)} />
        </label>
      {/if}
    {/each}
  </div>
{/snippet}

{#snippet texts(boxes: Box[])}
  <div class="texts">
    {#each boxes as [field, label] (field)}
      {#if fields[field]}
        <label class="text">
          <span>{t[label]}</span>
          <textarea rows={rows(field)} value={text(field)} {disabled} onchange={(event) => save(field, event)}
          ></textarea>
        </label>
      {/if}
    {/each}
  </div>
{/snippet}

<section class="panel" aria-labelledby="appearance-title">
  <h2 id="appearance-title">{t.appearance}</h2>
  {@render facts(FACTS)}
  {@render texts([['Background_Appearance', 'description']])}
</section>

<section class="panel" aria-labelledby="personality-title">
  <h2 id="personality-title">{t.personality}</h2>
  {@render texts(PERSONALITY)}
</section>

<section class="panel" aria-labelledby="allies-title">
  <h2 id="allies-title">{t.alliesEnemies}</h2>
  {@render texts(ALLIES)}
  {@render facts(FACTION)}
</section>

<section class="panel" aria-labelledby="backstory-title">
  <h2 id="backstory-title">{t.backstory}</h2>
  {@render texts([['Background_History', 'backstory']])}
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.625rem;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 800;
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
    gap: 0.375rem;
  }

  /* The label sits inside the box, above the value, so the whole box is the field to tap. */
  .fact {
    position: relative;
    color: var(--ink-muted);
    font-size: 0.75rem;
  }

  .fact span {
    position: absolute;
    top: 0.25rem;
    left: 0.5rem;
    pointer-events: none;
  }

  .fact input {
    width: 100%;
    min-height: 3.25rem;
    padding: 1.125rem 0.5rem 0.25rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 1rem;
    font-weight: 700;
  }

  .fact input:focus {
    border-color: var(--accent);
    outline: none;
  }

  /* Two side by side where there is room (traits next to ideal), one below the other on narrow columns. */
  .texts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.5rem;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.875rem;
    font-weight: 700;
  }

  textarea {
    width: 100%;
    min-height: 44px;
    padding: 0.5rem;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    font-size: 1rem;
    font-weight: 400;
    resize: vertical;
  }

  textarea:focus {
    border-color: var(--accent);
    outline: none;
    background: var(--surface);
  }
</style>
