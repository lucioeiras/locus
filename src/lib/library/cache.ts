import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { parseItem } from './parse';
import type { LibraryItem, LibraryItemType } from './types';
import { ARCHIVED_TAG } from './archive';

/**
 * Metadata stored in SQLite cache for fast retrieval, tag aggregation,
 * full-text search, and filtering without having to parse JSON for each card.
 */
export type CachedItemRow = {
  id: string;
  source_id: string;
  mtime: number;
  type: LibraryItemType;
  title: string | null;
  text: string | null;
  url: string | null;
  created_at: string;
  updated_at: string;
  tags_json: string | null;
  raw_json: string;
};

export type CachedItem = {
  id: string;
  sourceId: string;
  mtime: number;
  item: LibraryItem;
};

export type ItemIndexFilter = {
  type?: LibraryItemType;
  tag?: string;
  searchQuery?: string;
};

const DB_NAME = 'locus_library_cache.db';
let cachedDb: SQLiteDatabase | null = null;

export function getCacheDatabase(): SQLiteDatabase {
  if (cachedDb) return cachedDb;

  const db = openDatabaseSync(DB_NAME);

  // Set WAL mode and pragmatic performance settings
  db.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS items_cache (
      id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      text TEXT,
      note TEXT,
      url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      tags_json TEXT,
      raw_json TEXT NOT NULL,
      PRIMARY KEY (source_id, id)
    );

    CREATE INDEX IF NOT EXISTS idx_items_cache_source_created 
      ON items_cache (source_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS item_tags (
      source_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (source_id, item_id, tag),
      FOREIGN KEY (source_id, item_id) REFERENCES items_cache (source_id, id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_item_tags_source_tag 
      ON item_tags (source_id, tag);
  `);

  // Ensure note column exists for existing tables created before note column was added
  const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(items_cache)');
  if (!columns.some((c) => c.name === 'note')) {
    try {
      db.execSync('ALTER TABLE items_cache ADD COLUMN note TEXT;');
    } catch {
      // ignore
    }
  }

  cachedDb = db;
  return db;
}

/**
 * Returns a map of item ID -> last known mtime in SQLite for this source.
 * This lets us compare directory entries against the cache in O(1) per file.
 */
export function getCachedMtimes(sourceId: string): Map<string, number> {
  const db = getCacheDatabase();
  const rows = db.getAllSync<{ id: string; mtime: number }>(
    'SELECT id, mtime FROM items_cache WHERE source_id = ?',
    [sourceId]
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.id, row.mtime);
  }
  return map;
}

/**
 * Reads all cached items for a given library source from SQLite, sorted by createdAt descending.
 */
export function getAllCachedItems(sourceId: string): {
  items: LibraryItem[];
  corruptIds: string[];
} {
  const db = getCacheDatabase();
  const rows = db.getAllSync<CachedItemRow>(
    'SELECT * FROM items_cache WHERE source_id = ? ORDER BY created_at DESC',
    [sourceId]
  );

  const items: LibraryItem[] = [];
  const corruptIds: string[] = [];

  for (const row of rows) {
    try {
      const parsed = parseItem(JSON.parse(row.raw_json));
      items.push(parsed);
    } catch {
      corruptIds.push(row.id);
    }
  }

  return { items, corruptIds };
}

/**
 * Upserts a batch of parsed items into the SQLite cache along with their mtime and indexed fields.
 */
export function upsertCachedItems(
  sourceId: string,
  entries: { id: string; mtime: number; rawJson: string; item: LibraryItem }[]
): void {
  if (entries.length === 0) return;
  const db = getCacheDatabase();

  db.withTransactionSync(() => {
    const itemStmt = db.prepareSync(`
      INSERT OR REPLACE INTO items_cache (
        id, source_id, mtime, type, title, text, note, url, created_at, updated_at, tags_json, raw_json
      ) VALUES (
        $id, $source_id, $mtime, $type, $title, $text, $note, $url, $created_at, $updated_at, $tags_json, $raw_json
      )
    `);

    const deleteTagsStmt = db.prepareSync(`
      DELETE FROM item_tags WHERE source_id = $source_id AND item_id = $item_id
    `);

    const insertTagStmt = db.prepareSync(`
      INSERT OR IGNORE INTO item_tags (source_id, item_id, tag) VALUES ($source_id, $item_id, $tag)
    `);

    try {
      for (const entry of entries) {
        const item = entry.item;
        const title =
          'title' in item && typeof item.title === 'string'
            ? item.title
            : 'siteTitle' in item && typeof item.siteTitle === 'string'
              ? item.siteTitle
              : 'author' in item && typeof item.author === 'string'
                ? item.author
                : null;

        let text: string | null = null;
        if ('text' in item && typeof item.text === 'string') {
          text = item.text;
        } else if (item.type === 'book') {
          const parts: string[] = [];
          if (item.authors?.length) parts.push(item.authors.join(', '));
          if (item.isbn) parts.push(item.isbn);
          if (item.description) parts.push(item.description);
          if (item.publisher) parts.push(item.publisher);
          text = parts.length > 0 ? parts.join(' · ') : null;
        } else if (item.type === 'music') {
          const parts: string[] = [];
          if (item.artist) parts.push(item.artist);
          if (item.album) parts.push(item.album);
          if (item.genre) parts.push(item.genre);
          text = parts.length > 0 ? parts.join(' · ') : null;
        } else if (item.type === 'movie') {
          const parts: string[] = [];
          if (item.director) parts.push(`Direção: ${item.director}`);
          if (item.genres?.length) parts.push(item.genres.join(', '));
          if (item.releaseYear) parts.push(item.releaseYear);
          if (item.overview) parts.push(item.overview);
          text = parts.length > 0 ? parts.join(' · ') : null;
        } else if (item.type === 'tvshow') {
          const parts: string[] = [];
          if (item.genres?.length) parts.push(item.genres.join(', '));
          if (item.releaseYear) parts.push(item.releaseYear);
          if (item.overview) parts.push(item.overview);
          text = parts.length > 0 ? parts.join(' · ') : null;
        } else if (item.type === 'game') {
          const parts: string[] = [];
          if (item.platforms?.length) parts.push(item.platforms.join(', '));
          if (item.genres?.length) parts.push(item.genres.join(', '));
          if (item.releaseYear) parts.push(item.releaseYear);
          if (item.developers?.length) parts.push(item.developers.join(', '));
          if (item.description) parts.push(item.description);
          text = parts.length > 0 ? parts.join(' · ') : null;
        } else if ('description' in item && typeof item.description === 'string') {
          text = item.description;
        } else if ('subreddit' in item && typeof item.subreddit === 'string') {
          text = item.subreddit;
        }

        const note = 'note' in item && typeof item.note === 'string' ? item.note : null;
        const url =
          'url' in item && typeof item.url === 'string'
            ? item.url
            : item.type === 'music'
              ? item.externalUrl || item.previewUrl || null
              : item.type === 'game'
                ? item.website || null
                : null;
        const tags = Array.isArray(item.tags) ? item.tags : [];
        const tagsJson = tags.length > 0 ? JSON.stringify(tags) : null;

        itemStmt.executeSync({
          $id: entry.id,
          $source_id: sourceId,
          $mtime: entry.mtime,
          $type: item.type,
          $title: title,
          $text: text,
          $note: note,
          $url: url,
          $created_at: item.createdAt,
          $updated_at: item.updatedAt,
          $tags_json: tagsJson,
          $raw_json: entry.rawJson,
        });

        deleteTagsStmt.executeSync({
          $source_id: sourceId,
          $item_id: entry.id,
        });

        for (const tag of tags) {
          if (!tag) continue;
          insertTagStmt.executeSync({
            $source_id: sourceId,
            $item_id: entry.id,
            $tag: tag,
          });
        }
      }
    } finally {
      itemStmt.finalizeSync();
      deleteTagsStmt.finalizeSync();
      insertTagStmt.finalizeSync();
    }
  });
}

/**
 * Removes cached entries from SQLite for items that no longer exist on disk.
 */
export function removeCachedItems(sourceId: string, itemIds: string[]): void {
  if (itemIds.length === 0) return;
  const db = getCacheDatabase();

  db.withTransactionSync(() => {
    const delItemStmt = db.prepareSync(
      'DELETE FROM items_cache WHERE source_id = $source_id AND id = $id'
    );
    const delTagStmt = db.prepareSync(
      'DELETE FROM item_tags WHERE source_id = $source_id AND item_id = $id'
    );

    try {
      for (const id of itemIds) {
        delItemStmt.executeSync({ $source_id: sourceId, $id: id });
        delTagStmt.executeSync({ $source_id: sourceId, $id: id });
      }
    } finally {
      delItemStmt.finalizeSync();
      delTagStmt.finalizeSync();
    }
  });
}

/**
 * Clears all cached items for a given source.
 */
export function clearSourceCache(sourceId: string): void {
  const db = getCacheDatabase();
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM item_tags WHERE source_id = ?', [sourceId]);
    db.runSync('DELETE FROM items_cache WHERE source_id = ?', [sourceId]);
  });
}

/**
 * Returns all distinct tags for a source, optionally with item counts.
 */
export function getDistinctTags(sourceId: string): { tag: string; count: number }[] {
  const db = getCacheDatabase();
  return db
    .getAllSync<{ tag: string; count: number }>(
      `SELECT tag, COUNT(*) as count
     FROM item_tags 
     WHERE source_id = ? 
     GROUP BY tag 
     ORDER BY count DESC, tag ASC`,
      [sourceId]
    )
    .filter((row) => row.tag !== ARCHIVED_TAG);
}

/**
 * Fast search and filter over the cached index.
 * Matches title, text content (notes, quotes, reddit, tweets), personal notes,
 * URLs, authors, subreddits, and tags.
 */
export function searchCachedItems(sourceId: string, options: ItemIndexFilter): LibraryItem[] {
  const db = getCacheDatabase();
  const conditions: string[] = ['c.source_id = ?'];
  const params: (string | number)[] = [sourceId];

  if (options.type) {
    conditions.push('c.type = ?');
    params.push(options.type);
  }

  if (options.tag) {
    conditions.push(`EXISTS (
      SELECT 1 FROM item_tags t 
      WHERE t.source_id = c.source_id 
        AND t.item_id = c.id 
        AND t.tag = ?
    )`);
    params.push(options.tag);
  }

  if (options.searchQuery && options.searchQuery.trim()) {
    const pattern = `%${options.searchQuery.trim().toLowerCase()}%`;
    conditions.push(`(
      LOWER(c.title) LIKE ? OR 
      LOWER(c.text) LIKE ? OR 
      LOWER(c.note) LIKE ? OR 
      LOWER(c.url) LIKE ? OR 
      EXISTS (
        SELECT 1 FROM item_tags t 
        WHERE t.source_id = c.source_id 
          AND t.item_id = c.id 
          AND LOWER(t.tag) LIKE ?
      )
    )`);
    params.push(pattern, pattern, pattern, pattern, pattern);
  }

  const query = `
    SELECT c.* 
    FROM items_cache c 
    WHERE ${conditions.join(' AND ')} 
    ORDER BY c.created_at DESC
  `;

  const rows = db.getAllSync<CachedItemRow>(query, params);
  const items: LibraryItem[] = [];

  for (const row of rows) {
    try {
      items.push(parseItem(JSON.parse(row.raw_json)));
    } catch {
      // ignore
    }
  }

  return items;
}
