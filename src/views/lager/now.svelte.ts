// The time "Last changed …, just now" is measured against. Date.now() isn't reactive, so without a clock the line
// would say "just now" for as long as the window stays open (review 03).

/** How often the clock moves: "just now" lasts a minute, so it turns into a time within half a minute after. */
const TICK_MS = 30_000;

/** The time now, renewed every half minute while the component that asked for it is on screen. */
export function ticking(): { readonly now: number } {
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), TICK_MS);
    return () => clearInterval(timer);
  });
  return {
    get now() {
      return now;
    },
  };
}
