import type { LibraryItem, MediaProgressStatus } from './types';

/** Reserved tag stored on archived cards for a visible marker. */
export const ARCHIVED_TAG = 'Archived';
export const ARCHIVE_RETENTION_OPTIONS = [0, 7, 30, 90] as const;
export type ArchiveRetentionDays = (typeof ARCHIVE_RETENTION_OPTIONS)[number];

export const ARCHIVE_RETENTION_STORAGE_KEY = '@locus_archived_retention_days';

export function isArchived(item: Pick<LibraryItem, 'archivedAt'>): boolean {
  return typeof item.archivedAt === 'string';
}

export function shouldAskToArchiveAfterCompletion(
  nextStatus: MediaProgressStatus,
  alreadyArchived: boolean
): boolean {
  return nextStatus === 'completed' && !alreadyArchived;
}

export function filterArchivedItems<T extends Pick<LibraryItem, 'archivedAt'>>(
  items: T[],
  showArchived: boolean
): T[] {
  return items.filter((item) => isArchived(item) === showArchived);
}

export function archiveUpdates(
  item: Pick<LibraryItem, 'tags'>,
  archivedAt: string | null
): Pick<LibraryItem, 'archivedAt' | 'tags'> {
  const tags = (item.tags ?? []).filter((tag) => tag !== ARCHIVED_TAG);
  if (archivedAt) return { archivedAt, tags: [...tags, ARCHIVED_TAG] };
  return { archivedAt: undefined, tags: tags.length ? tags : undefined };
}

export function getExpiredArchivedIds(
  items: LibraryItem[],
  retentionDays: ArchiveRetentionDays,
  now = Date.now()
): string[] {
  if (retentionDays === 0) return [];
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  return items
    .filter((item) => {
      if (!item.archivedAt) return false;
      const archivedAt = Date.parse(item.archivedAt);
      return Number.isFinite(archivedAt) && now - archivedAt >= retentionMs;
    })
    .map((item) => item.id);
}

export function getArchiveDaysRemaining(
  archivedAt: string,
  retentionDays: ArchiveRetentionDays,
  now = Date.now()
): number | null {
  if (retentionDays === 0) return null;
  const archivedTime = Date.parse(archivedAt);
  if (!Number.isFinite(archivedTime)) return retentionDays;
  return Math.max(0, Math.ceil((archivedTime + retentionDays * 86400000 - now) / 86400000));
}
