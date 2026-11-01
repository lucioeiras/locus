export type PinnedDropTarget = { type: 'remove' } | { type: 'reorder'; index: number };

export const PINNED_DROP_ANIMATION_DURATION = 160;

export function schedulePinnedRemoval(onRemove: (itemId: string) => void, itemId: string) {
  setTimeout(onRemove, PINNED_DROP_ANIMATION_DURATION + 40, itemId);
}

export function schedulePinnedReorder(
  onReorder: (itemId: string, targetIndex: number) => void | Promise<void>,
  itemId: string,
  targetIndex: number
) {
  setTimeout(onReorder, PINNED_DROP_ANIMATION_DURATION + 40, itemId, targetIndex);
}

export function getPinnedDropTarget(
  touch: { x: number; y: number },
  container: { x: number; y: number; width: number; height: number },
  index: number
): PinnedDropTarget {
  const isOutside =
    touch.x < container.x ||
    touch.x > container.x + container.width ||
    touch.y < container.y ||
    touch.y > container.y + container.height;

  return isOutside ? { type: 'remove' } : { type: 'reorder', index };
}
