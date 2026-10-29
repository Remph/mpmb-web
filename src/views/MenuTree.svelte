<!-- MPMB's bookmarks as a menu: groups open in place, entries run their script. -->
<script lang="ts">
  import type { MenuNode } from '../worker/protocol.ts';
  import MenuTree from './MenuTree.svelte';

  interface Props {
    nodes: MenuNode[];
    /** Names from the top of MPMB's bookmarks down to these nodes. */
    path: string[];
    disabled: boolean;
    run: (path: string[]) => void;
  }

  let { nodes, path, disabled, run }: Props = $props();
</script>

<ul>
  {#each nodes as node, i (i)}
    <li>
      {#if node.children.length}
        <details>
          <summary>{node.name.trim()}</summary>
          {#if node.action}
            <button type="button" {disabled} onclick={() => run([...path, node.name])}>{node.name.trim()}</button>
          {/if}
          <MenuTree nodes={node.children} path={[...path, node.name]} {disabled} {run} />
        </details>
      {:else if node.action}
        <button type="button" {disabled} onclick={() => run([...path, node.name])}>{node.name.trim()}</button>
      {:else}
        <span>{node.name.trim()}</span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0 0 0 1rem;
  }

  summary {
    display: flex;
    align-items: center;
    min-height: 44px;
    cursor: pointer;
    font-weight: 600;
  }

  summary::before {
    content: '▸';
    width: 1.25rem;
    color: var(--ink-muted);
  }

  details[open] > summary::before {
    content: '▾';
  }

  button {
    min-height: 44px;
    width: 100%;
    border: 0;
    border-radius: 0.375rem;
    background: none;
    color: var(--accent);
    font: inherit;
    text-align: left;
    padding: 0 0.5rem 0 1.25rem;
    cursor: pointer;
  }

  button:not(:disabled):hover {
    background: var(--hover);
  }

  button:disabled {
    color: var(--ink-muted);
    cursor: default;
  }

  span {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding-left: 1.25rem;
    color: var(--ink-muted);
  }
</style>
