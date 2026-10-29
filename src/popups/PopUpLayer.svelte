<!-- Every open pop-up, the newest on top (each is a modal <dialog> in the browser's top layer). -->
<script lang="ts">
  import type { Texts } from '../i18n.ts';
  import AlertPopUp from './AlertPopUp.svelte';
  import ChoicePopUp from './ChoicePopUp.svelte';
  import DialogPopUp from './DialogPopUp.svelte';
  import MenuPopUp from './MenuPopUp.svelte';
  import type { PopUpStack } from './popups.svelte.ts';

  interface Props {
    popUps: PopUpStack;
    t: Texts;
  }

  let { popUps, t }: Props = $props();
</script>

{#each popUps.entries as entry (entry.id)}
  {#if entry.kind === 'alert'}
    <AlertPopUp request={entry.request} {t} answer={(reply) => popUps.answerAlert(entry.id, reply)} />
  {:else if entry.kind === 'menu'}
    <MenuPopUp items={entry.items} {t} answer={(picked) => popUps.answerMenu(entry.id, picked)} />
  {:else if entry.kind === 'choice'}
    <ChoicePopUp choice={entry.choice} answer={(value) => popUps.answerChoice(entry.id, value)} />
  {:else}
    <DialogPopUp
      view={entry.view}
      waiting={entry.resolve !== null}
      {t}
      answer={(reply) => popUps.answerDialog(entry.id, reply)}
    />
  {/if}
{/each}
