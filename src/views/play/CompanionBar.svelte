<!--
  The bar under the top bar on a sheet with companions (Remph picked "switch the whole view", 2026-11-04).
  Closed it is one line: who is shown, the way back to the character and the button that opens the list.
  Open it lists the character and every companion with its hit points, plus "+ Companion". Whether the
  list is open is kept for this browser, like the language. A druid's Wild Shape forms get a row of their
  own under the companions, with the uses left (Remph picked A, 2026-11-08).
  Phones (M13, mock-up pass 2): the list lives in a sheet opened from the "+1 ▾" badge after the name in the top
  bar; the bar itself shows only on a companion's or form's page, with the way back.
-->
<script lang="ts">
  import { counted, fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import { companionLabel } from '../../play/companions.ts';
  import type { Companion } from '../../play/companions.ts';
  import { formKey } from '../../play/wild-shapes.ts';
  import Modal from '../../popups/Modal.svelte';
  import type { WildShapeForm, WildShapeUses } from '../../play/wild-shapes.ts';

  interface Props {
    /** The character's name, for "Back to …" and the first button. */
    character: string;
    companions: Companion[];
    /** The shown companion's prefix, or null for the character. */
    shown: string | null;
    disabled: boolean;
    /** The prefixes of companions that disappeared at 0 HP (see goneSpell): "gone" instead of their hit points. */
    gone: string[];
    onshow: (prefix: string | null) => void;
    onadd: () => void;
    /** Wild Shape: whether the character has it (the forms row shows even before the first form). */
    wildShape?: boolean;
    forms?: WildShapeForm[];
    uses?: WildShapeUses | null;
    /** The shown form's key (formKey), and the key of the form the character is in; null for none. */
    shownForm?: string | null;
    inForm?: WildShapeForm | null;
    onshowform?: (key: string) => void;
    onaddform?: () => void;
    /** Phones: no list in the bar (the sheet has it), and no bar at all on the character's own page. */
    phone?: boolean;
    /** Phones: the switcher sheet is open (the top bar's badge opens it). */
    sheetOpen?: boolean;
    onclosesheet?: () => void;
    t: Texts;
  }

  let {
    character,
    companions,
    shown,
    disabled,
    gone,
    onshow,
    onadd,
    wildShape = false,
    forms = [],
    uses = null,
    shownForm = null,
    inForm = null,
    onshowform = () => {},
    onaddform = () => {},
    phone = false,
    sheetOpen = false,
    onclosesheet = () => {},
    t,
  }: Props = $props();

  /** In the sheet every pick also closes it: the page behind is what the player asked for. */
  const then =
    (action: () => void): (() => void) =>
    () => {
      if (phone) onclosesheet();
      action();
    };

  const STORAGE_KEY = 'mpmb-web.companionList';
  let listOpen = $state(readOpen());

  function readOpen(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'open';
    } catch {
      return false;
    }
  }

  function toggle() {
    listOpen = !listOpen;
    try {
      localStorage.setItem(STORAGE_KEY, listOpen ? 'open' : 'closed');
    } catch {
      // Storage blocked (private mode): the list still opens and closes until the page is closed.
    }
  }

  const current = $derived(companions.find((c) => c.prefix === shown) ?? null);
  const currentForm = $derived(forms.find((f) => formKey(f) === shownForm) ?? null);
  const inFormKey = $derived(inForm ? formKey(inForm) : null);
  const title = $derived(!wildShape ? t.companions : companions.length ? t.barTitleForms : t.barTitleFormsOnly);
  /** "1 companion, 6 forms": companions only when there are any, forms whenever the character has Wild Shape. */
  const count = $derived(
    [
      companions.length || !wildShape ? counted(t.companionsCountOne, t.companionsCount, companions.length) : '',
      wildShape ? counted(t.formsCountOne, t.formsCount, forms.length) : '',
    ]
      .filter(Boolean)
      .join(', '),
  );
  const formLine = (f: WildShapeForm): string =>
    formKey(f) === inFormKey ? t.formNow : fill(t.formStats, { cr: f.challenge, ac: f.armorClass });
  const hpText = (c: Companion): string =>
    gone.includes(c.prefix)
      ? t.companionGone
      : c.hp.max === null
        ? ''
        : fill(t.companionHp, { current: c.hp.current ?? c.hp.max, max: c.hp.max });
  const nameOf = (c: Companion): string => companionLabel(c) || t.companionEmptyPage;
</script>

{#snippet lists()}
  <div class="list" id={phone ? undefined : 'companion-list'}>
    <button
      type="button"
      class="pick"
      aria-pressed={shown === null && shownForm === null}
      onclick={then(() => onshow(null))}
    >
      {character}<small>{inForm ? fill(t.characterAsShort, { form: inForm.name }) : t.companionCharacter}</small>
    </button>
    {#each companions as c (c.prefix)}
      <button
        type="button"
        class="pick"
        class:gone={gone.includes(c.prefix)}
        aria-pressed={shown === c.prefix}
        onclick={then(() => onshow(c.prefix))}
      >
        {nameOf(c)}<small>{hpText(c) || c.kind}</small>
      </button>
    {/each}
    <button type="button" class="pick add" {disabled} onclick={then(onadd)}>+ {t.companionAdd}</button>
  </div>
  {#if wildShape}
    <div class="list forms" role="group" aria-labelledby="forms-title">
      <span class="group">
        <b id="forms-title">{t.wildShape}</b>
        {#if uses}<small>{fill(t.wildShapeUsesLeft, { left: uses.left, total: uses.total })}</small>{/if}
      </span>
      {#each forms as f (formKey(f))}
        <button
          type="button"
          class="pick"
          class:in={formKey(f) === inFormKey}
          aria-pressed={shownForm === formKey(f)}
          onclick={then(() => onshowform(formKey(f)))}
        >
          {f.name}<small>{formLine(f)}</small>
        </button>
      {/each}
      <button type="button" class="pick add" {disabled} onclick={then(onaddform)}>+ {t.formAdd}</button>
    </div>
  {/if}
{/snippet}

{#if !phone || current || currentForm || inForm}
  <nav class="bar" class:in-form={inForm !== null} aria-label={wildShape ? t.barListForms : t.companionsList}>
    <div class="inner">
      <div class="line">
        {#if current}
          <button type="button" class="back" onclick={() => onshow(null)}
            >← {fill(t.companionBack, { name: character })}</button
          >
          <span class="now"><b>{nameOf(current)}</b> <small>{hpText(current)}</small></span>
        {:else if currentForm}
          <button type="button" class="back" onclick={() => onshow(null)}
            >← {fill(t.companionBack, { name: character })}</button
          >
          <span class="now"
            ><b>{currentForm.name}</b>
            <small>{formKey(currentForm) === inFormKey ? t.formNow : t.formKind}</small></span
          >
        {:else if inForm}
          <span class="now"><b>{fill(t.characterAs, { name: character, form: inForm.name })}</b></span>
        {:else}
          <span class="now"><b>{title}</b></span>
        {/if}
        {#if !phone}
          <button type="button" class="toggle" aria-expanded={listOpen} aria-controls="companion-list" onclick={toggle}>
            {count}
            <span aria-hidden="true">{listOpen ? '▴' : '▾'}</span>
            <span class="sr">{listOpen ? t.companionsHideList : t.companionsShowList}</span>
          </button>
        {/if}
      </div>
      {#if listOpen && !phone}
        {@render lists()}
      {/if}
    </div>
  </nav>
{/if}

{#if phone && sheetOpen}
  <!-- Phones: the same rows as a sheet, one per line, each a full thumb wide. -->
  <Modal title={wildShape ? t.barListForms : t.companionsList} onescape={onclosesheet} closeLabel={t.close}>
    <div class="sheet">{@render lists()}</div>
  </Modal>
{/if}

<style>
  .bar {
    border-bottom: 1px solid var(--line);
    background: var(--accent-soft);
  }

  .inner {
    max-width: var(--page-max);
    margin-inline: auto;
    padding: 0.25rem 1rem;
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
    min-height: 44px;
  }

  .now {
    flex: 1 1 auto;
    min-width: 0;
  }

  .now small {
    color: var(--ink-muted);
  }

  .back,
  .toggle {
    background: var(--surface);
    font-weight: 700;
  }

  .back {
    color: var(--accent);
  }

  .toggle {
    margin-left: auto;
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    padding: 0.25rem 0 0.5rem;
  }

  .pick {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    min-height: 44px;
    padding: 0.25rem 0.75rem;
    line-height: 1.15;
    text-align: left;
  }

  .pick small {
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  .pick[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 700;
  }

  .pick[aria-pressed='true'] small {
    color: inherit;
    opacity: 0.85;
  }

  .pick.gone:not([aria-pressed='true']) {
    border-style: dashed;
    color: var(--ink-muted);
  }

  .pick.add {
    border-style: dashed;
    color: var(--ink-muted);
  }

  /* While the character is in a form the bar is tinted a step stronger, so nobody misses it. */
  .bar.in-form {
    background: color-mix(in srgb, var(--accent-soft), var(--accent) 12%);
  }

  .forms {
    align-items: center;
    border-top: 1px dashed var(--line);
    padding-top: 0.5rem;
  }

  .group {
    display: inline-flex;
    flex-direction: column;
    min-width: 6.5rem;
    margin-right: 0.25rem;
    line-height: 1.15;
  }

  .group small {
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  /* The sheet (phones): rows, not chips. */
  .sheet .list {
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: stretch;
  }

  .sheet .forms {
    align-items: stretch;
    margin-top: 0.5rem;
  }

  .sheet .group {
    flex-direction: row;
    align-items: baseline;
    gap: 0.5rem;
    padding-top: 0.25rem;
  }

  .sheet .pick {
    display: flex;
    width: 100%;
  }

  /* The form the character is in: marked even while another page is shown. */
  .pick.in:not([aria-pressed='true']) {
    border: 2px solid var(--accent);
  }
</style>
