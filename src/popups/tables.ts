// MPMB builds its dialog tables (ability scores, class selection) as a row of columns, each column a
// stack of cells. Acrobat lines the cells up because every one has a fixed height in points. Here
// texts wrap and inputs are 44 px tall, so a two-line header in one column pushes its cells below
// those of the next. This action gives the n-th cell of every column the height of the tallest one.

/** A column's cells. A column that starts with a row of columns stands for those columns. */
function leafColumns(column: Element): Element[] {
  if (column.matches('.group.row')) return [...column.children].flatMap(leafColumns);
  const first = column.firstElementChild;
  if (column.matches('.group') && first?.matches('.group.row')) return leafColumns(first);
  return column.matches('.group') ? [column] : [];
}

/** Marks the rows between a column and its table, so their columns align at the top as well. */
function markRows(element: Element | null, table: Element): void {
  if (!element || element === table) return;
  if (element.matches('.group.row')) element.classList.add('table');
  markRows(element.parentElement, table);
}

/** A row is a table when at least three of its columns have three or more cells. */
const MIN_TABLE = 3;

function alignRow(row: HTMLElement): void {
  const columns = leafColumns(row);
  if (columns.filter((c) => c.children.length >= MIN_TABLE).length < MIN_TABLE) return;
  row.classList.add('table');
  // Inner rows (the names and base scores) must start their columns at the top too.
  columns.forEach((column) => markRows(column.parentElement, row));
  const depth = Math.max(...columns.map((c) => c.children.length));
  Array.from({ length: depth }, (_, i) =>
    columns.map((c) => c.children[i]).filter((cell) => cell instanceof HTMLElement),
  ).forEach((cells) => {
    cells.forEach((cell) => cell.style.removeProperty('min-height'));
    const tallest = Math.max(...cells.map((cell) => cell.getBoundingClientRect().height));
    cells.forEach((cell) => cell.style.setProperty('min-height', `${tallest}px`));
  });
}

function alignAll(node: HTMLElement): void {
  const rows = [...node.querySelectorAll<HTMLElement>('.group.row')];
  // The outermost table wins: an inner row is part of it (the ability names and base scores).
  // Document order puts outer rows first, so the check sees the tables found so far.
  rows.forEach((row) => {
    if (!rows.some((other) => other !== row && other.contains(row) && other.classList.contains('table'))) alignRow(row);
  });
}

/** Svelte action: keeps the tables in a dialog aligned while it changes or the window resizes. */
export function alignTables(node: HTMLElement): { destroy(): void } {
  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => alignAll(node));
  };
  const resize = new ResizeObserver(schedule);
  resize.observe(node);
  // Only content changes: the min-heights set here are attribute changes and don't come back here.
  const mutations = new MutationObserver(schedule);
  mutations.observe(node, { childList: true, subtree: true, characterData: true });
  schedule();
  return {
    destroy() {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
    },
  };
}
