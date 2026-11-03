<!--
  "Fill MPMB PDF" from the sheet menu (M10): the player picks their own blank copy of MPMB's sheet (the
  app doesn't ship it), the open character goes into it, and the filled PDF downloads, to go on in
  Acrobat. Picking the file is the one action; the download starts by itself when the PDF is ready.
-->
<script lang="ts">
  import { SHEET_ID } from '../../engine/sheet-id.ts';
  import type { Texts } from '../../i18n.ts';
  import { fill } from '../../i18n.ts';
  import { MPMB_DOWNLOAD, MPMB_PATREON } from '../../mpmb-links.ts';
  import Modal from '../../popups/Modal.svelte';
  import type { Session } from '../../session.svelte.ts';

  interface Props {
    session: Session;
    /** The character's name, for the progress line. */
    name: string;
    onclose: () => void;
    t: Texts;
  }

  let { session, name, onclose, t }: Props = $props();

  type Phase =
    | { step: 'pick' }
    | { step: 'working' }
    | { step: 'done'; pdf: Blob; file: string }
    | { step: 'failed'; reason: string };
  let phase = $state<Phase>({ step: 'pick' });
  let input: HTMLInputElement | undefined = $state();

  async function picked(target: HTMLInputElement) {
    const file = target.files?.[0];
    // Cleared, so that picking the same file again works again.
    target.value = '';
    if (!file) return;
    phase = { step: 'working' };
    try {
      const { pdf, name: fileName } = await session.fillPdf(file);
      session.download(pdf, fileName);
      phase = { step: 'done', pdf, file: fileName };
    } catch (err) {
      phase = { step: 'failed', reason: err instanceof Error ? err.message : String(err) };
    }
  }
</script>

<Modal title={t.fillPdfTitle} onescape={onclose} closeLabel={t.close}>
  <p>{fill(t.fillPdfIntro, { version: SHEET_ID.version })}</p>
  <!-- MPMB's condition for this site: point people to the official sheet (see mpmb-links.ts). -->
  <p class="muted">
    {t.fillPdfGet} <a href={MPMB_DOWNLOAD} target="_blank" rel="noopener">{t.mpmbWebsite}</a>
    {t.fillPdfOr} <a href={MPMB_PATREON} target="_blank" rel="noopener">{t.mpmbPatreon}</a>.
  </p>

  <div class="status" aria-live="polite">
    {#if phase.step === 'working'}
      <p class="working">{fill(t.fillPdfWorking, { name: name || t.unnamed })}</p>
    {:else if phase.step === 'done'}
      <p class="done">{fill(t.fillPdfDone, { file: phase.file })}</p>
      <p>{t.fillPdfAcrobat}</p>
    {:else if phase.step === 'failed'}
      <p class="failed" role="alert">{fill(t.fillPdfFailed, { reason: phase.reason })}</p>
    {:else}
      <p class="muted">{t.fillPdfAcrobat}</p>
    {/if}
  </div>

  <input bind:this={input} type="file" accept=".pdf,application/pdf" hidden onchange={(e) => picked(e.currentTarget)} />

  {#snippet actions()}
    {#if phase.step === 'done'}
      {@const done = phase}
      <button type="button" onclick={() => input?.click()}>{t.fillPdfOther}</button>
      <button type="button" onclick={() => session.download(done.pdf, done.file)}>{t.fillPdfAgain}</button>
      <button type="button" class="primary" onclick={onclose}>{t.close}</button>
    {:else}
      <button type="button" onclick={onclose}>{t.cancel}</button>
      <button type="button" class="primary" disabled={phase.step === 'working'} onclick={() => input?.click()}
        >{phase.step === 'failed' ? t.fillPdfOther : t.fillPdfChoose}</button
      >
    {/if}
  {/snippet}
</Modal>

<style>
  p {
    margin: 0 0 0.75rem;
  }

  .muted {
    color: var(--ink-muted);
  }

  .status {
    min-height: 2.75rem;
  }

  .working {
    font-weight: 600;
  }

  .done {
    font-weight: 600;
    color: var(--ok);
  }

  .failed {
    color: var(--danger);
  }
</style>
