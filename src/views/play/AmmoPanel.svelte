<!--
  The PDF's two ammunition counters (src/play/ammo.ts): how many are left, − and + to count, the
  number to type a new amount, and after a fight the used ones to pick up again. The ammunition itself
  is picked from MPMB's own list.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import PickList from '../build/PickList.svelte';
  import { ammoChoices, collectSteps, countSteps, freeAmmoSide, half, pickSteps, readAmmo } from '../../play/ammo.ts';
  import type { Ammo, AmmoSide } from '../../play/ammo.ts';
  import type { Step } from '../../session.svelte.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import NumberPad from './NumberPad.svelte';
  import Stepper from './Stepper.svelte';

  interface Props {
    fields: FieldViews;
    disabled: boolean;
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { fields, disabled, change, t }: Props = $props();

  const ammo = $derived(readAmmo(fields));
  const free = $derived(freeAmmoSide(fields));
  const choices = $derived(ammoChoices(fields));
  /** What is open: the list to pick from, the number pad, or the pick-up question after a fight. */
  let open = $state<{ kind: 'pick' | 'count' | 'collect'; side: AmmoSide } | null>(null);
  const at = (side: AmmoSide): Ammo | undefined => ammo.filter((a) => a.side === side)[0];
  const shownAmmo = $derived(open ? at(open.side) : undefined);
  /** The value to keep for "None": MPMB clears the counter when its name is emptied. */
  const NONE = '';

  function picked(name: string) {
    const side = open?.side;
    open = null;
    const before = side ? at(side) : undefined;
    if (!side || name === (before?.name ?? NONE)) return;
    change(pickSteps(side, name));
    // New ammunition: how many? The count MPMB had stays when only the kind changes. (Read before the
    // change: the play view shows the new name at once.)
    if (name !== NONE && !before) open = { kind: 'count', side };
  }

  function counted(amount: number) {
    const a = shownAmmo;
    const side = open?.side;
    open = null;
    if (a) change(countSteps(a, amount, true));
    else if (side) change(countSteps({ side, name: '', amount: 0, start: 0, used: 0 }, amount, true));
  }

  function collect(back: number) {
    const a = shownAmmo;
    open = null;
    if (a) change(collectSteps(a, back));
  }

  const pickOptions = $derived([
    ...choices.map((name) => ({ value: name, label: name })),
    ...(open?.kind === 'pick' && at(open.side) ? [{ value: NONE, label: t.ammoNone }] : []),
  ]);
</script>

{#if ammo.length}
  <section class="panel" aria-labelledby="ammo-title">
    <div class="head">
      <h2 id="ammo-title">{t.ammo}</h2>
      {#if free}
        <button type="button" class="quiet add" {disabled} onclick={() => (open = { kind: 'pick', side: free })}
          >+ {t.ammoAdd}</button
        >
      {/if}
    </div>
    {#each ammo as a (a.side)}
      <div class="row">
        <span class="what">
          <button
            type="button"
            class="name"
            aria-label={fill(t.ammoChange, { name: a.name })}
            {disabled}
            onclick={() => (open = { kind: 'pick', side: a.side })}>{a.name}</button
          >
          {#if a.used > 0}<small>{fill(t.ammoUsed, { count: a.used })}</small>{/if}
        </span>
        <span class="count">
          {#if a.used > 0}
            <button type="button" class="collect" {disabled} onclick={() => (open = { kind: 'collect', side: a.side })}
              >{t.ammoCollect}</button
            >
          {/if}
          <Stepper
            text={String(a.amount)}
            name={a.name}
            canLess={a.amount > 0}
            canMore
            {disabled}
            onless={() => change(countSteps(a, a.amount - 1))}
            onmore={() => change(countSteps(a, a.amount + 1))}
            onpick={() => (open = { kind: 'count', side: a.side })}
            pickLabel={fill(t.ammoCountTitle, { name: a.name })}
            pickAlways
            {t}
          />
        </span>
      </div>
    {/each}
  </section>
{:else}
  <button type="button" class="chip-add" {disabled} onclick={() => (open = { kind: 'pick', side: 'Left' })}
    >+ {t.ammoAdd}</button
  >
{/if}

{#if open?.kind === 'pick'}
  <PickList
    title={shownAmmo ? fill(t.ammoChange, { name: shownAmmo.name }) : t.ammoAdd}
    options={pickOptions}
    current={shownAmmo?.name ?? NONE}
    onpick={picked}
    onclose={() => (open = null)}
    {t}
  />
{:else if open?.kind === 'count'}
  <NumberPad
    title={fill(t.ammoCountTitle, { name: shownAmmo?.name ?? t.ammo })}
    hint={t.ammoCountHint}
    applyLabel={t.apply}
    onapply={counted}
    onclose={() => (open = null)}
    {t}
  />
{:else if open?.kind === 'collect' && shownAmmo}
  {@const a = shownAmmo}
  <Modal title={fill(t.ammoCollectTitle, { name: a.name })} onescape={() => (open = null)} closeLabel={t.close}>
    <p class="hint">{fill(t.ammoCollectText, { count: a.used })}</p>
    <div class="choices">
      <button type="button" class="primary" {disabled} onclick={() => collect(half(a.used))}
        >{fill(t.ammoCollectHalf, { count: half(a.used) })}</button
      >
      <button type="button" {disabled} onclick={() => collect(a.used)}
        >{fill(t.ammoCollectAll, { count: a.used })}</button
      >
      <button type="button" {disabled} onclick={() => collect(0)}>{t.ammoCollectNone}</button>
    </div>
    <p class="hint">{t.ammoCollectRule}</p>
  </Modal>
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
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 800;
  }

  .add {
    margin-left: auto;
    color: var(--accent);
    font-weight: 600;
  }

  .row {
    display: flex;
    align-items: center;
    padding: 0.25rem 0;
    justify-content: space-between;
    gap: 0.5rem;
    border-top: 1px solid var(--line);
  }

  .row:first-of-type {
    border-top: 0;
  }

  /* The name opens MPMB's list: a quiet button, underlined like the other things to tap in a row. */
  .name {
    min-width: 0;
    padding: 0 0.25rem;
    margin-left: -0.25rem;
    border: 0;
    background: none;
    font-weight: 700;
    text-align: left;
    text-decoration: underline dashed var(--ink-muted);
    text-underline-offset: 0.25rem;
  }

  .what {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
  }

  .what small {
    margin-top: -0.375rem;
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  .count {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .collect {
    font-weight: 600;
  }

  .chip-add {
    margin-bottom: 0.625rem;
    border-style: dashed;
    border-radius: 22px;
    color: var(--ink-muted);
    font-weight: 500;
  }

  .hint {
    margin: 0 0 0.75rem;
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }

  .choices {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .choices button {
    min-height: 48px;
    font-weight: 700;
  }
</style>
