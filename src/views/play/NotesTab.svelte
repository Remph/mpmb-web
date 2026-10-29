<!--
  Session notes in the sheet's notes field (Extra.Notes, page 3 of the PDF). Saved when the field
  loses focus, so typing doesn't run MPMB's scripts on every key.
-->
<script lang="ts">
  import type { Texts } from '../../i18n.ts';
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
  const FIELD = 'Extra.Notes';
  const stored = $derived(valueOf(fields, FIELD).replace(/\r/g, '\n'));

  function save(event: Event) {
    const text = (event.currentTarget as HTMLTextAreaElement).value;
    if (text.trim() !== stored) change([{ edit: FIELD, text }]);
  }
</script>

<section class="panel">
  <label for="notes">{t.notes}</label>
  <p class="hint">{t.notesHint}</p>
  <textarea id="notes" rows="16" value={stored} {disabled} onchange={save}></textarea>
</section>

<style>
  .panel {
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  label {
    font-weight: 800;
  }

  .hint {
    margin: 0 0 0.5rem;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    resize: vertical;
  }
</style>
