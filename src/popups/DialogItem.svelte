<!--
  One element of an Acrobat dialog description (and its children), drawn as HTML. MPMB's dialogs use
  views and clusters for layout, static and edit texts, buttons, check boxes, radio buttons and lists,
  and the OK/Cancel/Other buttons. Icons (`image`) are left out: they come from the PDF's artwork.
-->
<script lang="ts">
  import type { DialogElement, DialogState, DialogView } from '../engine/host.ts';
  import type { Texts } from '../i18n.ts';
  import DialogItem from './DialogItem.svelte';
  import type { ListEntry } from './lists.ts';
  import { listEntries, selectEntry } from './lists.ts';

  interface Props {
    element: DialogElement;
    state: DialogState;
    view: DialogView;
    /** item_ids of the radio buttons in each group_id, to switch the others off. */
    radioGroups: Record<string, string[]>;
    t: Texts;
    /** Changes an element's value in the dialog's state (owned by DialogPopUp). */
    set: (id: string, value: unknown) => void;
    /** The player used an element: its handler (if the script has one) runs in the worker. */
    onevent: (id: string) => void;
    /** A closing button: "ok", "cancel" or "other". */
    onclose: (result: string) => void;
    /** An element drawn elsewhere (the OK/Cancel buttons, in the bottom bar). */
    skip?: DialogElement;
  }

  let { element, state, view, radioGroups, t, set, onevent, onclose, skip }: Props = $props();

  const id = $derived(element.item_id ?? '');
  const type = $derived(element.type ?? 'view');
  const hidden = $derived(id !== '' && view.visible[id] === false);
  const disabled = $derived(id !== '' && view.enabled[id] === false);
  const choices = $derived(view.choices?.[id] ?? []);
  const listId = `choices-${Math.random().toString(36).slice(2)}`;
  const label = $derived(typeof element.name === 'string' ? element.name : '');
  const num = (key: string): number => Number(element[key]) || 0;

  /**
   * Acrobat sizes elements in characters of its dialog font (`char_width`) or in points (`width`).
   * A character here is about 0.62em; inputs add their padding. Never wider than the dialog.
   */
  const CHAR_EM = 0.62;
  const INPUTS = ['edit_text', 'popup', 'list_box', 'hier_list_box'];
  /** Acrobat's height of a one-line input, in points. */
  const ONE_LINE = 30;
  const size = $derived.by(() => {
    const parts: string[] = [];
    const extra = INPUTS.includes(type) ? ' + 1.5rem' : '';
    if (num('width')) parts.push(`width: min(${num('width')}px${extra ? ` ${extra}` : ''}, 100%)`);
    else if (num('char_width')) parts.push(`width: min(calc(${num('char_width') * CHAR_EM}em${extra}), 100%)`);
    if (num('height') && (type === 'edit_text' || type.endsWith('list_box'))) parts.push(`height: ${num('height')}px`);
    // A one-line text with a height stands next to inputs in MPMB's tables (a row label, a column's
    // value): it gets an input's height here too, so the rows line up.
    if (num('height') && num('height') <= ONE_LINE && type === 'static_text') parts.push('min-height: 44px');
    return parts.join('; ');
  });
  /** Rows: MPMB lays out its tables as rows (align_row, align_distribute) of columns (views). */
  const ROWS = ['align_row', 'align_distribute', 'align_top'];
  const row = $derived(ROWS.includes(String(element.align_children)));
  const top = $derived(element.align_children === 'align_top');
  const centered = $derived(element.align_children === 'align_center');
  const fill = $derived(element.alignment === 'align_fill');
  const self = $derived(
    element.alignment === 'align_center' ? 'center' : element.alignment === 'align_right' ? 'right' : '',
  );
  const bold = $derived(element.bold === true || element.font === 'heading' || element.font === 'title');
  const small = $derived(element.font === 'palette');
  const red = $derived(id !== '' && view.red[id] === true);

  /** Static text shows what the handlers loaded, or the text in the description. */
  const shownText = $derived.by(() => {
    const loaded = state[id];
    return typeof loaded === 'string' && loaded !== '' ? loaded : label;
  });

  function setCheck(value: boolean) {
    set(id, value);
    if (type === 'radio' && value) {
      const group = String(element.group_id ?? '');
      (radioGroups[group] ?? []).forEach((other) => {
        if (other !== id) set(other, false);
      });
    }
    onevent(id);
  }

  function pick(path: string[]) {
    set(id, selectEntry(state[id], path));
    onevent(id);
  }

  const selectedLabel = (entries: ListEntry[]): string => entries.filter((e) => e.selected)[0]?.label ?? '';

  /** The closing buttons an ok / ok_cancel / ok_cancel_other element stands for, last = main. */
  const closers = $derived.by(() => {
    const name = (key: string, fallback: string) =>
      typeof element[key] === 'string' ? String(element[key]) : fallback;
    const ok = { result: 'ok', label: name('ok_name', t.ok) };
    const cancel = { result: 'cancel', label: name('cancel_name', t.cancel) };
    const other = { result: 'other', label: name('other_name', t.other) };
    if (type === 'ok_cancel') return [cancel, ok];
    if (type === 'ok_cancel_other') return [other, cancel, ok];
    return [ok];
  });

  /** A plain button with Acrobat's own ids works like the closing buttons. */
  const CLOSING_IDS = ['ok', 'cancel', 'other'];
</script>

{#if !hidden && element !== skip}
  {#if type === 'view' || type === 'cluster'}
    {@const children = element.elements ?? []}
    {#if type === 'cluster'}
      <fieldset class="group {self}" class:row class:top class:centered class:fill style={size}>
        {#if label}<legend class:bold>{label}</legend>{/if}
        {#each children as child, i (i)}
          <DialogItem element={child} {state} {view} {radioGroups} {t} {set} {onevent} {onclose} {skip} />
        {/each}
      </fieldset>
    {:else}
      <div class="group {self}" class:row class:top class:centered class:fill style={size}>
        {#each children as child, i (i)}
          <DialogItem element={child} {state} {view} {radioGroups} {t} {set} {onevent} {onclose} {skip} />
        {/each}
      </div>
    {/if}
  {:else if type === 'static_text' || type === 'link_text'}
    <p class="text {self}" class:bold class:small class:red class:fill style={size}>{shownText}</p>
  {:else if type === 'edit_text'}
    {#if element.multiline === true}
      <textarea
        class:fill
        style={size}
        {disabled}
        readonly={element.readonly === true}
        aria-label={label || id}
        value={String(state[id] ?? '')}
        oninput={(e) => set(id, e.currentTarget.value)}
        onchange={() => onevent(id)}></textarea>
    {:else}
      <input
        class:fill
        style={size}
        type={element.password === true ? 'password' : 'text'}
        {disabled}
        readonly={element.readonly === true}
        aria-label={label || id}
        list={choices.length ? listId : undefined}
        value={String(state[id] ?? '')}
        oninput={(e) => set(id, e.currentTarget.value)}
        onchange={() => onevent(id)}
      />
      {#if choices.length}
        <!-- A combo box (PopupEdit): type a name or pick one; the browser filters the list as you type. -->
        <datalist id={listId}>
          {#each choices as choice, i (i)}<option value={choice}></option>{/each}
        </datalist>
      {/if}
    {/if}
  {:else if type === 'check_box' || type === 'radio'}
    <label class="check" class:red class:fill>
      <input
        type={type === 'radio' ? 'radio' : 'checkbox'}
        {disabled}
        checked={state[id] === true}
        onchange={(e) => setCheck(e.currentTarget.checked)}
      />
      <span>{label}</span>
    </label>
  {:else if type === 'button'}
    <button type="button" class:fill {disabled} onclick={() => (CLOSING_IDS.includes(id) ? onclose(id) : onevent(id))}
      >{label || id}</button
    >
  {:else if type === 'popup' || type === 'list_box'}
    {@const entries = listEntries(state[id])}
    <select
      class:fill
      style={size}
      {disabled}
      size={type === 'list_box' ? Math.max(2, Math.min(entries.length, 8)) : undefined}
      aria-label={label || id}
      value={selectedLabel(entries)}
      onchange={(e) => pick([e.currentTarget.value])}
    >
      {#if type === 'popup' && !selectedLabel(entries)}<option value="" disabled></option>{/if}
      {#each entries as entry (entry.label)}
        <option value={entry.label}>{entry.label}</option>
      {/each}
    </select>
  {:else if type === 'hier_list_box'}
    {@const entries = listEntries(state[id])}
    {#snippet tree(list: ListEntry[], at: string[])}
      <ul role={at.length ? 'group' : 'tree'}>
        {#each list as entry (entry.label)}
          <li role="treeitem" aria-selected={entry.selected} aria-expanded={entry.children ? true : undefined}>
            {#if entry.children}
              <span class="branch">{entry.label}</span>
              {@render tree(entry.children, [...at, entry.label])}
            {:else}
              <button
                type="button"
                class="leaf"
                class:selected={entry.selected}
                {disabled}
                onclick={() => pick([...at, entry.label])}>{entry.label}</button
              >
            {/if}
          </li>
        {/each}
      </ul>
    {/snippet}
    <div class="tree" class:fill style={size}>{@render tree(entries, [])}</div>
  {:else if type === 'gap'}
    <div style={`height: ${num('height') || 8}px`}></div>
  {:else if type === 'ok' || type === 'ok_cancel' || type === 'ok_cancel_other'}
    <div class="closers">
      {#each closers as closer, i (closer.result)}
        <button type="button" class:primary={i === closers.length - 1} onclick={() => onclose(closer.result)}>
          {closer.label}
        </button>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
    max-width: 100%;
  }

  /*
   * Rows keep their columns side by side, as in Acrobat. MPMB sizes them for Acrobat's wide dialog
   * windows; here columns may shrink below that size (texts wrap, inputs get narrower), so a dialog fits
   * a 13-inch laptop or an iPad without scrolling sideways.
   */
  .group.row {
    flex-direction: row;
    align-items: center;
  }

  /* A table (see tables.ts): columns start at the top, so their cells line up. */
  .group.row:global(.table) {
    align-items: flex-start;
  }

  /*
   * A table's columns never get narrower than their longest word ("Current", "Constitution"): that
   * would run them into the next column. A table wider than the window (13 columns of ability scores
   * on an iPad in portrait) scrolls instead.
   */
  .group.row:global(.table),
  .group.row:global(.table) :global(.group),
  .group.row:global(.table) :global(.text) {
    min-width: min-content;
  }

  .group.row.top {
    align-items: flex-start;
  }

  .group.centered {
    align-items: center;
  }

  .center {
    align-self: center;
  }

  .right {
    align-self: flex-end;
  }

  /* Shrinks down to the longest word (flex's default minimum), so "Constitution" stays whole. */
  .group.row > :global(*) {
    flex-shrink: 1;
  }

  /* Buttons have a 44 px minimum width that would undo that minimum; keep their words whole too. */
  .group.row > :global(button) {
    min-width: min-content;
  }

  fieldset.group {
    margin: 0;
    padding: 0.5rem 0.75rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
  }

  legend {
    padding: 0 0.25rem;
  }

  .fill {
    flex: 1 1 auto;
  }

  .text {
    margin: 0;
    max-width: 100%;
    white-space: pre-wrap;
    display: flex;
    align-items: center;
  }

  .bold {
    font-weight: 600;
  }

  .small {
    font-size: 0.875rem;
  }

  .red {
    color: var(--danger);
  }

  input[type='text'],
  input[type='password'],
  textarea,
  select {
    min-height: 44px;
    min-width: 3rem;
    max-width: 100%;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--line);
    border-radius: 0.375rem;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  textarea {
    min-height: 6rem;
    resize: vertical;
  }

  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
  }

  .check input {
    width: 1.25rem;
    height: 1.25rem;
    flex: none;
  }

  .tree {
    max-height: 20rem;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 0.375rem;
    padding: 0.25rem;
  }

  .tree ul {
    list-style: none;
    margin: 0;
    padding-left: 1rem;
  }

  .tree > ul {
    padding-left: 0;
  }

  .branch {
    display: block;
    padding: 0.5rem 0.25rem 0;
    font-weight: 600;
  }

  .leaf {
    width: 100%;
    min-height: 44px;
    border: 0;
    text-align: left;
    background: none;
  }

  .leaf.selected {
    background: var(--accent);
    color: var(--on-accent);
  }

  .closers {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
