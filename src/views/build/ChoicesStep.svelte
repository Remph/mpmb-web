<!--
  Build step 6: the choices (M6, as drawn). On one side what the class features, the species and the feats
  let the player choose, grouped by whose choice it is, each with what is chosen and whether something is
  still open; on the other the options of the choice in view. A tap on an option picks it right away,
  through MPMB's own menu (the app answers it in the player's place), so MPMB applies it as after a pick
  in the PDF. Where several may be chosen (invocations), a second tap on a chosen one takes it back.
-->
<script lang="ts">
  import { choiceNamed } from '../../build/choose-link.ts';
  import type { BuilderInfo } from '../../engine/builder.ts';
  import type { Choice, ChoiceOption } from '../../engine/choices.ts';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';

  interface Props {
    info: BuilderInfo;
    /** The feature the player came from (its "Choose Feature" note in the play view), if any. */
    wanted: string | null;
    disabled: boolean;
    pick: (field: string, answer: string) => Promise<void>;
    t: Texts;
  }

  let { info, wanted, disabled, pick, t }: Props = $props();

  /** From this many options a search field helps (weapon masteries: about 50). */
  const SEARCH_FROM = 12;
  /** Options whose top is below this share of the window's height are out of easy view. */
  const LOW = 0.6;

  const choices = $derived(info.choices);
  let selectedId = $state('');
  let query = $state('');
  let pending = $state('');
  let detailCard: HTMLElement | undefined = $state();

  // The choice in view: the one the player tapped, else the feature's they came from, else the first
  // still open, else the first.
  const selected = $derived(
    choices.filter((c) => c.id === selectedId)[0] ??
      (wanted ? choiceNamed(choices, wanted) : null) ??
      choices.filter((c) => c.open)[0] ??
      choices[0],
  );
  const firstOpen = $derived(choices.filter((c) => c.open)[0]?.id);

  /** Consecutive choices of the same class, species or feat, under its name. */
  const groups = $derived(
    choices.reduce<{ owner: string; choices: Choice[] }[]>((list, choice) => {
      const owner = choice.owner || t.buildChoiceBonus;
      const last = list[list.length - 1];
      if (last && last.owner === owner) last.choices.push(choice);
      else list.push({ owner, choices: [choice] });
      return list;
    }, []),
  );

  const titleOf = (choice: Choice): string => {
    if (choice.kind === 'species') return t.buildChoiceVariant;
    if (choice.kind === 'feat') return t.buildChoiceType;
    return choice.name;
  };

  function statusOf(choice: Choice): string {
    if (!choice.many) return choice.chosen[0] ?? t.buildNotChosen;
    if (choice.allowed === null) return fill(t.buildChosenCount, { n: String(choice.selected) });
    return fill(t.buildChosenOf, { n: String(choice.selected), of: String(choice.allowed) });
  }

  const howMany = (choice: Choice): string => {
    if (!choice.many) return t.buildChooseOne;
    return choice.allowed === null ? t.buildChooseAny : fill(t.buildChooseN, { n: String(choice.allowed) });
  };

  const sections = $derived(
    (selected?.sections ?? [])
      .map((s) => ({
        heading: s.heading,
        options: s.options.filter((o) =>
          `${o.label} ${o.description}`.toLowerCase().includes(query.trim().toLowerCase()),
        ),
      }))
      .filter((s) => s.options.length),
  );
  const optionCount = $derived((selected?.sections ?? []).reduce((n, s) => n + s.options.length, 0));

  function show(choice: Choice) {
    selectedId = choice.id;
    query = '';
    optionsIntoView('smooth');
  }

  /** Upright on an iPad the options sit below the list: brings them into view when they start low. */
  function optionsIntoView(behavior: ScrollBehavior) {
    if (detailCard && detailCard.getBoundingClientRect().top > window.innerHeight * LOW) {
      detailCard.scrollIntoView({ behavior, block: 'start' });
    }
  }

  // Coming from a feature's "Choose Feature" link: its options come into view once, as after "Choose".
  let broughtIntoView = false;
  $effect(() => {
    if (broughtIntoView || !wanted || !detailCard || !choiceNamed(choices, wanted)) return;
    broughtIntoView = true;
    optionsIntoView('instant');
  });

  /** A chosen option of a one-of choice is already on the sheet; MPMB's menu does nothing for it. */
  const canTap = (choice: Choice, option: ChoiceOption): boolean => option.enabled && (choice.many || !option.chosen);

  async function tap(choice: Choice, option: ChoiceOption) {
    if (pending || !canTap(choice, option)) return;
    selectedId = choice.id;
    pending = option.value;
    try {
      await pick(choice.field, option.value);
    } finally {
      pending = '';
    }
  }
</script>

<div class="split">
  <section class="card">
    <h2>{t.buildChoices}</h2>
    <p class="line">{t.buildChoicesLine}</p>
    {#each groups as group, g (g)}
      <p class="group">{group.owner}</p>
      {#each group.choices as choice (choice.id)}
        <div class="choice" class:on={choice.id === selected?.id}>
          <div class="text">
            <b>{titleOf(choice)}</b>
            <small class:open={choice.open}>{statusOf(choice)}</small>
          </div>
          <button
            type="button"
            class:primary={choice.id === firstOpen}
            aria-pressed={choice.id === selected?.id}
            onclick={() => show(choice)}>{choice.open ? t.buildChoose : t.buildChange}</button
          >
        </div>
      {/each}
    {:else}
      <p class="none">{t.buildNoChoices}</p>
    {/each}
  </section>

  {#if selected}
    <section class="card detail" bind:this={detailCard} aria-label={titleOf(selected)}>
      <h3>
        {titleOf(selected)} <small>· {selected.owner || t.buildChoiceBonus} · {howMany(selected)}</small>
      </h3>
      {#if selected.many}
        <p class="count" class:open={selected.open}>
          {selected.chosen.length
            ? fill(t.buildChosenList, { count: statusOf(selected), names: selected.chosen.join(', ') })
            : statusOf(selected)}
        </p>
      {/if}
      {#if optionCount >= SEARCH_FROM}
        <input
          class="search"
          type="search"
          bind:value={query}
          placeholder={t.buildSearchOptions}
          aria-label={t.buildSearchOptions}
        />
      {/if}
      {#each sections as section, s (s)}
        {#if section.heading}<p class="heading">{section.heading}</p>{/if}
        <ul>
          {#each section.options as option (option.value)}
            <li>
              <button
                type="button"
                class="option"
                class:chosen={option.chosen}
                class:many={selected.many}
                aria-pressed={option.chosen}
                aria-busy={pending === option.value}
                disabled={disabled || Boolean(pending) || !option.enabled}
                title={selected.many && option.chosen ? fill(t.buildTakeBack, { name: option.label }) : undefined}
                onclick={() => selected && tap(selected, option)}
              >
                <span class="mark" aria-hidden="true"></span>
                <span class="text">
                  <span class="label" lang="en">{option.label}</span>
                  {#if option.description}<small lang="en">{option.description}</small>{/if}
                </span>
                {#if option.source}<span class="source">{option.source}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="none">{t.buildNothingFound}</p>
      {/each}
      {#if !t.locale.startsWith('en')}<p class="note">{t.buildEnglishNote}</p>{/if}
    </section>
  {/if}
</div>

<style>
  .split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    gap: 0.75rem;
    align-items: start;
  }

  .card {
    min-width: 0;
    padding: 1rem 1.25rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
  }

  .line {
    margin: 0.125rem 0 0.75rem;
    color: var(--ink-muted);
  }

  .group {
    margin: 1rem 0 0;
    padding-bottom: 0.375rem;
    border-bottom: 1px solid var(--line);
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 0;
    border-top: 1px solid var(--line);
  }

  .group + .choice {
    border-top: 0;
  }

  .choice .text {
    display: grid;
    flex: 1;
    min-width: 0;
    line-height: 1.3;
  }

  .choice small {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  small.open,
  .count.open {
    color: var(--danger);
    font-weight: 700;
  }

  .choice button {
    flex: none;
    min-width: 6.5rem;
  }

  .choice.on button:not(.primary) {
    border-color: var(--accent);
    color: var(--accent);
  }

  .none,
  .note {
    margin: 0.5rem 0 0;
    color: var(--ink-muted);
  }

  .note {
    font-size: 0.875rem;
  }

  h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 800;
  }

  h3 small {
    color: var(--ink-muted);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .count {
    margin: 0.25rem 0 0;
    font-size: 0.875rem;
  }

  .search {
    width: 100%;
    min-height: 44px;
    margin-top: 0.75rem;
    padding: 0 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  .heading {
    margin: 1rem 0 0.375rem;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 700;
  }

  ul {
    display: grid;
    gap: 0.375rem;
    margin: 0.75rem 0 0;
    padding: 0;
    list-style: none;
  }

  .heading + ul {
    margin-top: 0;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: 48px;
    padding: 0.375rem 0.75rem;
    text-align: left;
  }

  .option.chosen {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .option[aria-busy='true'] {
    border-style: dashed;
    border-color: var(--accent);
  }

  /* A round mark where one is chosen, a square one where several are: as radio buttons and checkboxes. */
  .mark {
    flex: none;
    width: 1.125rem;
    height: 1.125rem;
    border: 2px solid var(--ink-muted);
    border-radius: 50%;
  }

  .option.many .mark {
    border-radius: 0.25rem;
  }

  .option.chosen .mark {
    border-color: var(--accent);
    background: var(--accent);
    box-shadow: inset 0 0 0 3px var(--accent-soft);
  }

  .option .text {
    display: grid;
    flex: 1;
    min-width: 0;
    line-height: 1.3;
  }

  /* MPMB's descriptions run long; two lines tell the options apart, the sheet has the full text. */
  .option small {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  .source {
    flex: none;
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  /* Below 1000 px the rail leaves too little room for two columns (iPad upright: about 560 px). */
  @media (max-width: 999px) {
    .split {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
