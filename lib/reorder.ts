type ReorderItem = { id: number; sort_order: number };

export function reorder<T extends { id: number }>(
  items: T[],
  index: number,
  direction: -1 | 1,
): ReorderItem[] | null {
  const target = index + direction;
  if (target < 0 || target >= items.length) return null;
  const next = items.slice();
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next.map((item, i) => ({ id: item.id, sort_order: i }));
}
