<!--
  Experience points in the play view, so adding them after a session needs no Build screen. MPMB adds
  them (src/play/experience.ts) and asks about a new level itself, as in Acrobat.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import { addExperienceSteps, readExperience } from '../../play/experience.ts';
  import type { Step } from '../../session.svelte.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import NumberPad from './NumberPad.svelte';

  interface Props {
    fields: FieldViews;
    disabled: boolean;
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { fields, disabled, change, t }: Props = $props();

  const xp = $derived(readExperience(fields));
  const number = (n: number): string => n.toLocaleString(t.locale);
  let adding = $state(false);
  /** Up to 999,999 points at once: the whole table to level 20 is 355,000. */
  const XP_DIGITS = 6;

  function add(amount: number) {
    adding = false;
    if (amount > 0) change(addExperienceSteps(amount));
  }
</script>

<section class="panel" aria-labelledby="xp-title">
  <div class="line">
    <p>
      <span id="xp-title" class="k">{t.experience}</span>
      <b>{fill(t.xpTotal, { xp: number(xp.total) })}</b>
      {#if xp.next !== null}<small>{fill(t.xpNext, { xp: number(xp.next) })}</small>{/if}
    </p>
    <button type="button" {disabled} onclick={() => (adding = true)}>+ {t.xpAddShort}</button>
  </div>
</section>

{#if adding}
  <NumberPad
    title={t.xpAddTitle}
    hint={xp.next !== null
      ? `${fill(t.xpTotal, { xp: number(xp.total) })} · ${fill(t.xpNext, { xp: number(xp.next) })}`
      : fill(t.xpTotal, { xp: number(xp.total) })}
    applyLabel={t.xpAdd}
    maxDigits={XP_DIGITS}
    onapply={add}
    onclose={() => (adding = false)}
    {t}
  />
{/if}

<style>
  .panel {
    margin-top: 0.625rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  p {
    display: flex;
    flex-direction: column;
    min-width: 0;
    margin: 0;
    line-height: 1.25;
  }

  .k,
  small {
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  b {
    font-size: 1.0625rem;
    font-weight: 800;
  }

  button {
    flex: none;
    font-weight: 600;
  }
</style>
