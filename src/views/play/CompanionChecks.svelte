<!--
  A companion's abilities, saves and skills (the right column, or the Checks tab when narrow). Shown as
  MPMB worked them out; a companion page has no advantage marks, so these are not buttons.
-->
<script lang="ts">
  import type { Texts } from '../../i18n.ts';
  import type { Companion } from '../../play/companions.ts';

  interface Props {
    companion: Companion;
    t: Texts;
  }

  let { companion, t }: Props = $props();
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
            <span class="prof" class:no={!a.saveProficient} title={a.saveProficient ? t.proficient : undefined}
            ></span>{a.save}
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
      <li>
        <span>
          <span class="prof" class:no={s.mark === 'nothing'} class:exp={s.mark === 'expertise'}></span>{t[
            `skill${s.key}`
          ]}
        </span>
        <b>{s.bonus}</b>
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
    justify-content: space-between;
    gap: 0.25rem;
    min-height: 44px;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
    font-size: 0.9375rem;
    line-height: 1.2;
    break-inside: avoid;
  }

  .skills b {
    font-weight: 800;
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
