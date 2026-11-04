<!-- MOCK-UP (M11, not for merging): the line under the top bar after a character was updated. -->
<script lang="ts">
  interface Props {
    onshow: () => void;
    onkeep: () => void;
  }
  let { onshow, onkeep }: Props = $props();
</script>

<div class="update" role="status">
  <span class="icon" aria-hidden="true">↻</span>
  <p><strong>Updated to MPMB's sheet v24.3.0.</strong> 5 entries changed; please check them.</p>
  <div class="buttons">
    <button type="button" class="primary" onclick={onshow}>See what changed</button>
    <button type="button" class="close" aria-label="Keep the update and close this line" onclick={onkeep}>✕</button>
  </div>
</div>

<style>
  .update {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid var(--accent);
    background: var(--accent-soft);
    margin-top: 0.75rem;
  }
  .icon {
    font-weight: 700;
    color: var(--accent);
  }
  p {
    flex: 1;
    min-width: 14rem;
    margin: 0;
  }
  .buttons {
    display: flex;
    gap: 0.5rem;
  }
  .close {
    min-width: 44px;
  }
</style>
