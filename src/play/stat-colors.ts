// The numbers under hit points each have their own colour (tokens `--stat-<kind>` and `--stat-<kind>-soft`
// in app.css), the same on the character's and a companion's column.

/** Which number a stat tile shows; picks its colour pair. */
export type StatKind = 'ac' | 'init' | 'speed' | 'prof' | 'dc' | 'pp';

export const STAT_KINDS: readonly StatKind[] = ['ac', 'init', 'speed', 'prof', 'dc', 'pp'];

/** The tile's colour and its pale wash, for `style:--stat` and `style:--stat-soft`. */
export const statColor = (kind: StatKind): string => `var(--stat-${kind})`;
export const statSoft = (kind: StatKind): string => `var(--stat-${kind}-soft)`;

/** One number under hit points; `initiative` marks the tile that opens the advantage pop-up. */
export interface StatTile {
  label: string;
  value: string;
  kind: StatKind;
  initiative?: boolean;
}

/** The tiles to show: a number the sheet leaves empty gets no tile. */
export const shownTiles = (tiles: StatTile[]): StatTile[] => tiles.filter((tile) => tile.value !== '');
