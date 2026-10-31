<!--
  Level up (M6): which class gets the next level, with what that level brings, or a new class
  (multiclassing). The answer becomes the new text of MPMB's class field; MPMB does the rest (hit points,
  features, spell slots) as when the player types a higher level into the PDF.
-->
<script lang="ts">
  import {
    addClass,
    classFieldText,
    meetsPrereqs,
    rowsOf,
    setLevel,
    totalLevel,
    MAX_LEVEL,
  } from '../../build/classes.ts';
  import type { BuilderInfo } from '../../engine/builder.ts';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import { ABILITIES, numberOf } from '../../play/read.ts';
  import Modal from '../../popups/Modal.svelte';
  import type { Step } from '../../session.svelte.ts';
  import type { FieldViews } from '../../worker/views.ts';

  interface Props {
    info: BuilderInfo;
    fields: FieldViews;
    change: (steps: Step[]) => void;
    onclose: () => void;
    t: Texts;
  }

  let { info, fields, change, onclose, t }: Props = $props();

  const rows = $derived(rowsOf(info.known));
  const next = $derived(totalLevel(rows) + 1);
  const scores = $derived(Object.fromEntries(ABILITIES.map((a) => [a, numberOf(fields, a)])));
  const others = $derived(info.classes.filter((c) => !rows.some((r) => r.key === c.key)));
  /** A class key the character has, or "new:<key>" for a new class. */
  let choice = $state('');
  $effect(() => {
    if (!choice) choice = rows[0]?.key ?? '';
  });

  const name = (key: string) => info.classes.filter((c) => c.key === key)[0]?.name ?? key;
  const brings = (features: string[], feat = false) => {
    const all = feat ? [...features, t.levelUpFeat] : features;
    return all.length ? fill(t.levelUpNew, { features: all.join(', ') }) : t.levelUpNothingNew;
  };

  function levelUp() {
    if (next > MAX_LEVEL) return onclose();
    const index = rows.findIndex((r) => r.key === choice);
    const updated = choice.startsWith('new:')
      ? addClass(rows, choice.slice('new:'.length))
      : setLevel(rows, index, (rows[index]?.level ?? 0) + 1);
    onclose();
    change([{ edit: 'Class and Levels', text: classFieldText(updated, info.classes) }]);
  }
</script>

<Modal title={fill(t.levelUpTitle, { level: next })} onescape={onclose} closeLabel={t.close}>
  <p class="ask">{t.levelUpWhich}</p>
  <div class="options" role="radiogroup" aria-label={t.levelUpWhich}>
    {#each info.known as known (known.key)}
      <label class="option" class:on={choice === known.key}>
        <input type="radio" name="level-up" value={known.key} bind:group={choice} />
        <span>
          <b>{name(known.key)} {known.level + 1}</b>
          <small>{brings(known.nextFeatures, known.nextFeat)}</small>
        </span>
      </label>
    {/each}
    {#if others.length}
      <label class="option" class:on={choice.startsWith('new')}>
        <input
          type="radio"
          name="level-up"
          value="new"
          checked={choice.startsWith('new')}
          onchange={() => (choice = 'new')}
        />
        <span>
          <b>{t.levelUpAnother}</b>
          <small>{t.levelUpAnotherLine}</small>
        </span>
      </label>
    {/if}
  </div>
  {#if choice.startsWith('new')}
    <div class="options others" role="radiogroup" aria-label={t.levelUpAnother}>
      {#each others as other (other.key)}
        {@const met = meetsPrereqs(other.prereqs, scores)}
        <label class="option" class:on={choice === `new:${other.key}`}>
          <input type="radio" name="level-up-class" value={`new:${other.key}`} bind:group={choice} />
          <span>
            <b>{other.name} 1</b>
            <small
              >{[
                other.prereqs &&
                  `${fill(t.buildNeeds, { what: other.prereqs })}${met === false ? ` ${t.buildNotMet}` : ''}`,
                brings(other.firstFeatures),
              ]
                .filter(Boolean)
                .join(' · ')}</small
            >
          </span>
        </label>
      {/each}
    </div>
  {/if}
  <p class="hp">{t.levelUpHitPoints}</p>
  {#snippet actions()}
    <button type="button" onclick={onclose}>{t.cancel}</button>
    <button type="button" class="primary" disabled={!choice || choice === 'new'} onclick={levelUp}>{t.levelUp}</button>
  {/snippet}
</Modal>

<style>
  .ask {
    margin: 0 0 0.75rem;
    color: var(--ink-muted);
  }

  .options {
    display: grid;
    gap: 0.5rem;
  }

  .others {
    margin: 0.5rem 0 0 1.5rem;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 52px;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.625rem;
    cursor: pointer;
  }

  .option.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  input {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    margin: 0;
    accent-color: var(--accent);
  }

  .option span {
    display: grid;
    min-width: 0;
  }

  small {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .hp {
    margin: 0.75rem 0 0;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--accent-soft);
  }
</style>
