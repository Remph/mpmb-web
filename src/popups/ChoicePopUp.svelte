<!-- One of the app's own questions (delete, restore, replace on import). -->
<script lang="ts">
  import type { Texts } from '../i18n.ts';
  import type { Choice } from './popups.svelte.ts';
  import Modal from './Modal.svelte';

  interface Props {
    choice: Choice<string>;
    t: Texts;
    answer: (value: string) => void;
  }

  let { choice, t, answer }: Props = $props();
</script>

<Modal title={choice.title} onescape={() => answer(choice.cancel)} closeLabel={t.close}>
  <p class="message">{choice.message}</p>
  {#if choice.lines?.length}
    <ul>
      {#each choice.lines as line, i (i)}
        <li>{line}</li>
      {/each}
    </ul>
  {/if}
  {#snippet actions()}
    {#each choice.buttons as button (button.value)}
      <button
        type="button"
        class:primary={button.primary}
        class:danger={button.danger}
        onclick={() => answer(button.value)}
      >
        {button.label}
      </button>
    {/each}
  {/snippet}
</Modal>

<style>
  .message {
    margin: 0;
  }

  ul {
    margin: 0.75rem 0 0;
    padding-left: 1.25rem;
  }

  /* A line can be one long word: the web address of the link question must show in full, so that
     nothing (a look-alike host, data in the query) hides past the dialog's edge. */
  li {
    overflow-wrap: anywhere;
  }
</style>
