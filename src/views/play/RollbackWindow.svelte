<!--
  "Roll back to an earlier save" (Remph picked the plain list, A, 2026-11-08): the open character's restore
  points, the newest first, each with when and why it was taken and the class and hit points it had then, to
  tell them apart. Opened from the sheet menu, in its place.
-->
<script lang="ts">
  import { KEEP_POINTS, pointHp, pointWhen } from '../../store/restore-points.ts';
  import type { PointReason, RestorePoint } from '../../store/restore-points.ts';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import type { Session } from '../../session.svelte.ts';

  interface Props {
    session: Session;
    /** The points, newest first, as the sheet menu read them. */
    points: RestorePoint[];
    onclose: () => void;
    t: Texts;
  }

  let { session, points, onclose, t }: Props = $props();

  const now = new Date();
  const when = (point: RestorePoint): string => pointWhen(point.at, now, t.locale, t.pointToday);

  const REASONS: Record<PointReason, keyof Texts> = {
    opened: 'pointOpened',
    build: 'pointBuild',
    reset: 'pointReset',
    restore: 'pointRestore',
    rollback: 'pointRollback',
  };

  /** The class line and hit points the character had then. */
  function line(point: RestorePoint): string {
    const hp = pointHp(point.data);
    return [point.meta.classes, hp ? fill(t.rollbackHp, hp) : ''].filter(Boolean).join(' · ');
  }

  /** The question comes as a pop-up of its own: this window steps aside first. It says "today" mid-sentence. */
  function rollBack(point: RestorePoint) {
    onclose();
    void session.rollBack(point, pointWhen(point.at, now, t.locale, t.pointTodayInline));
  }
</script>

<Modal title={t.menuRollback} onescape={onclose} closeLabel={t.close} wide>
  <p class="lead">{fill(t.rollbackLead, { count: KEEP_POINTS })}</p>
  {#if points.length}
    <ol class="points">
      {#each points as point (point.at)}
        <li>
          <div class="text">
            <b>{when(point)}</b>
            <span class="why">{t[REASONS[point.reason]]}</span>
            {#if line(point)}<small>{line(point)}</small>{/if}
          </div>
          <button type="button" onclick={() => rollBack(point)}>{t.rollbackButton}</button>
        </li>
      {/each}
    </ol>
  {:else}
    <p class="empty">{t.rollbackEmpty}</p>
  {/if}
</Modal>

<style>
  .lead {
    margin: 0 0 0.75rem;
    color: var(--ink-muted);
  }

  .empty {
    margin: 0;
  }

  .points {
    margin: 0;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--line);
  }

  li:first-child {
    border-top: 0;
  }

  li > button {
    min-height: 44px;
  }

  .text {
    display: grid;
    gap: 0.125rem;
    min-width: 0;
  }

  .why {
    color: var(--accent);
    font-size: 0.9375rem;
    font-weight: 600;
  }

  small {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }
</style>
