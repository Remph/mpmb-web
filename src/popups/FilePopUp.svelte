<!--
  Acrobat's "Open" window, for MPMB's "Add file" (util.readFileIntoStream): the player picks a script file
  from the computer, or drags one in, and MPMB's own import reads its text. The file stays in this browser.
  The file input sits inside its label, so a tap on the label opens the picker straight from the
  player's tap; Safari opens a file picker only from one.
-->
<script lang="ts">
  import type { Texts } from '../i18n.ts';
  import Modal from './Modal.svelte';

  interface Props {
    t: Texts;
    answer: (text: string | null) => void;
  }

  let { t, answer }: Props = $props();
  let reading = $state(false);
  let failed = $state(false);
  let over = $state(false);

  async function take(file: File | undefined) {
    if (!file || reading) return;
    reading = true;
    failed = false;
    try {
      // As text in UTF-8, as Acrobat's util.stringFromStream reads a stream by default.
      answer(await file.text());
    } catch {
      failed = true;
      reading = false;
    }
  }

  function picked(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    void take(input.files?.[0]);
    // The same file can be picked again after a failed read.
    input.value = '';
  }

  function dropped(event: DragEvent) {
    event.preventDefault();
    over = false;
    void take(event.dataTransfer?.files[0]);
  }

  function dragOver(event: DragEvent) {
    event.preventDefault();
    over = true;
  }
</script>

<Modal title={t.openFileTitle} onescape={() => answer(null)} closeLabel={t.close}>
  <p>{t.openFileMessage}</p>
  <!-- Any file type: MPMB reads scripts without the .js ending too, and checks the content itself. -->
  <label class="drop" class:over ondragover={dragOver} ondragleave={() => (over = false)} ondrop={dropped}>
    <input type="file" disabled={reading} onchange={picked} />
    <b>{reading ? t.openFileReading : t.openFileChoose}</b>
    <small>{t.openFileDrop}</small>
  </label>
  {#if failed}
    <p class="failed" role="alert">{t.openFileFailed}</p>
  {/if}
  {#snippet actions()}
    <button type="button" onclick={() => answer(null)}>{t.cancel}</button>
  {/snippet}
</Modal>

<style>
  p {
    margin: 0 0 0.75rem;
  }

  .drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    min-height: 7rem;
    padding: 1rem;
    border: 2px dashed var(--accent);
    border-radius: 0.75rem;
    color: var(--accent);
    text-align: center;
    cursor: pointer;
  }

  .drop.over,
  .drop:hover {
    background: var(--accent-soft);
  }

  .drop:focus-within {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }

  .drop small {
    color: var(--ink-muted);
  }

  /* Hidden but still focusable and reachable for screen readers; the label is what people tap. */
  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .failed {
    margin: 0.75rem 0 0;
    color: var(--danger);
  }
</style>
