<!--
  Where is it now (M16): the place chip of a magic item opens this. A tap on a chip moves the item at once; a new
  character goes in the box and Save.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import { IN_LAGER, type Lager, type LagerItem } from '../../lager/lager.ts';
  import PlaceChips from './PlaceChips.svelte';

  interface Props {
    item: LagerItem;
    lager: Lager;
    onpick: (place: string) => void;
    onclose: () => void;
    t: Texts;
  }

  let { item, lager, onpick, onclose, t }: Props = $props();

  const start = untrack(() => item.place || IN_LAGER);
  let place = $state(start);

  function save(): void {
    if (place.trim() && place.trim() !== start) onpick(place.trim());
    else onclose();
  }
</script>

<Modal title={fill(t.lagerPlaceOf, { name: item.name })} onescape={onclose} closeLabel={t.close}>
  <form
    id="lager-place"
    onsubmit={(event) => {
      event.preventDefault();
      save();
    }}
  >
    <PlaceChips bind:value={place} {lager} onpicked={(picked) => (picked === start ? onclose() : onpick(picked))} {t} />
  </form>

  {#snippet actions()}
    <button type="submit" form="lager-place" class="primary">{t.lagerSave}</button>
  {/snippet}
</Modal>
