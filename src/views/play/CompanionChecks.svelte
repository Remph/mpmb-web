<!--
  A companion's abilities, saves and skills (the right column, or the Checks tab when narrow). Shown as
  MPMB worked them out. A tap rolls a save or skill on the dice card (M17); a companion page has no advantage
  marks, so the roll is a straight one and the card offers it again with advantage or disadvantage.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import type { Companion } from '../../play/companions.ts';
  import { bonusOf } from '../../dice/dice.ts';
  import { dice } from '../../play/dice.svelte.ts';

  interface Props {
    companion: Companion;
    t: Texts;
  }

  let { companion, t }: Props = $props();

  function roll(title: string, shown: string, from: HTMLButtonElement) {
    const bonus = bonusOf(shown);
    if (bonus !== null) dice.d20({ title, bonus, mode: 'normal' }, { from });
  }
</script>

<section class="panel" aria-labelledby="companion-abilities-title">
  <h2 id="companion-abilities-title">{t.abilitiesSaves}</h2>
  <table>
    <thead>
      <tr><th></th><th>{t.score}</th><th class="num">{t.modifier}</th><th class="num">{t.save}</th></tr>
    </thead>
    <tbody>
      {#each companion.abilities as a (a.key)}
        <tr>
          <th scope="row">{t[`ability${a.key}`]}</th>
          <td class="score">{a.score}</td>
          <td class="num">{a.modifier}</td>
          <td class="num">
            {#if bonusOf(a.save) === null}
              <span class="prof" class:no={!a.saveProficient} title={a.saveProficient ? t.proficient : undefined}
              ></span>{a.save}
            {:else}
              {@const title = fill(t.saveTitle, { ability: t[`ability${a.key}`] })}
              <button
                type="button"
                class="roll"
                aria-label={fill(t.diceRollLabel, { title, bonus: a.save })}
                onclick={(ev) => roll(title, a.save, ev.currentTarget)}
                ><span class="prof" class:no={!a.saveProficient} title={a.saveProficient ? t.proficient : undefined}
                ></span>{a.save}</button
              >
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

<section class="panel skills-panel" aria-labelledby="companion-skills-title">
  <h2 id="companion-skills-title">{t.skills}</h2>
  <ul class="skills">
    {#each companion.skills as s (s.key)}
      {@const name = t[`skill${s.key}`]}
      <li>
        <button
          type="button"
          class="roll skill"
          aria-label={fill(t.diceRollLabel, { title: name, bonus: s.bonus })}
          disabled={bonusOf(s.bonus) === null}
          onclick={(ev) => roll(name, s.bonus, ev.currentTarget)}
        >
          <span>
            <span class="prof" class:no={s.mark === 'nothing'} class:exp={s.mark === 'expertise'}></span>{name}
          </span>
          <b>{s.bonus}</b>
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .panel {
    margin-bottom: 0.625rem;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 800;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  thead th {
    padding: 0 0.25rem 0.25rem;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 500;
    text-align: left;
  }

  tbody th {
    font-weight: 700;
    text-align: left;
  }

  tbody th,
  td {
    height: 44px;
    padding: 0.125rem 0.25rem;
    border-top: 1px solid var(--line);
  }

  .score {
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }

  .num {
    font-size: 1.125rem;
    font-weight: 800;
    text-align: right;
    white-space: nowrap;
  }

  thead .num {
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .prof {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    margin-right: 0.375rem;
    border-radius: 50%;
    background: var(--accent);
    vertical-align: 0.1rem;
  }

  .prof.no {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--used);
  }

  .prof.exp {
    box-shadow:
      0 0 0 2px var(--accent-soft),
      0 0 0 3.5px var(--accent);
  }

  .skills {
    columns: 2;
    column-gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .skills li {
    display: flex;
    align-items: center;
    min-height: 44px;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
    font-size: 0.9375rem;
    line-height: 1.2;
    break-inside: avoid;
  }

  .skills b {
    font-weight: 800;
  }

  /* The numbers roll (M17): plain text to look at, a 44 px target to tap, like the character's saves and skills. */
  .roll {
    min-height: 44px;
    padding: 0 0.375rem;
    border: 0;
    border-radius: 0.375rem;
    background: none;
    color: inherit;
    font: inherit;
  }

  .roll:not(:disabled):hover,
  .roll:focus-visible {
    background: var(--accent-soft);
  }

  .roll:disabled {
    opacity: 1;
  }

  .skill {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem;
    margin: 0 -0.375rem;
    text-align: left;
  }

  .skills-panel {
    container-type: inline-size;
  }

  @container (max-width: 25rem) {
    .skills li {
      font-size: 0.875rem;
    }
  }

  @container (max-width: 18rem) {
    .skills {
      columns: 1;
    }
  }
</style>
