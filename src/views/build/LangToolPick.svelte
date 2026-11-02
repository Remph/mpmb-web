<!--
  Adding or changing a language or a tool on the "Skills & languages" step: the 2024 rules' languages
  (or MPMB's tool list, add-on scripts included) as buttons, plus a field for any other name. What the
  character knows already is left out.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import type { LangToolKind } from '../../build/proficiencies.ts';

  interface Props {
    kind: LangToolKind;
    groups: { title: string; names: string[] }[];
    /** Names already on the sheet. */
    known: string[];
    ontake: (name: string) => void;
    onclose: () => void;
    t: Texts;
  }

  let { kind, groups, known, ontake, onclose, t }: Props = $props();
  let typed = $state('');
  const isKnown = (name: string): boolean => known.some((k) => k.toLowerCase() === name.toLowerCase());
  const shown = $derived(groups.map((g) => ({ ...g, names: g.names.filter((n) => !isKnown(n)) })));

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const name = typed.trim();
    if (name) ontake(name);
  }
</script>

<Modal title={kind === 'Language' ? t.skillsAddLanguage : t.skillsAddTool} onescape={onclose} closeLabel={t.close} wide>
  <p class="line">{kind === 'Language' ? t.skillsLanguageLine : t.skillsToolLine}</p>
  {#each shown as group (group.title)}
    {#if group.names.length}
      <h3>{group.title}</h3>
      <div class="chips">
        {#each group.names as name (name)}
          <button type="button" onclick={() => ontake(name)}>{name}</button>
        {/each}
      </div>
    {/if}
  {/each}
  <h3>{t.skillsOtherName}</h3>
  <form class="own" onsubmit={submit}>
    <input
      type="text"
      bind:value={typed}
      aria-label={t.skillsOtherName}
      placeholder={kind === 'Language' ? t.skillsTypeLanguage : t.skillsTypeTool}
    />
    <button type="submit" class="primary" disabled={!typed.trim()}
      >{fill(t.skillsTake, { name: typed.trim() || '…' })}</button
    >
  </form>
</Modal>

<style>
  .line {
    margin: 0 0 0.5rem;
    color: var(--ink-muted);
  }

  h3 {
    margin: 0.75rem 0 0.375rem;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .own {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  input {
    flex: 1 1 14rem;
    min-width: 0;
    min-height: 44px;
    padding: 0 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }
</style>
