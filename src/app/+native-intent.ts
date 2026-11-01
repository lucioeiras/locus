export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const url = new URL(path);

    if (url.hostname === 'expo-sharing') {
      return '/handle-share';
    }

    if (
      url.protocol === 'locus:' &&
      (url.hostname === 'control-add' || url.pathname === '/control-add' || url.hostname === 'add')
    ) {
      const controlItem = url.searchParams.get('controlItem');
      const token = encodeURIComponent(
        url.searchParams.get('controlToken') ?? Date.now().toString()
      );

      const supportedItems = new Set([
        'note',
        'link',
        'book',
        'music',
        'movie',
        'tvshow',
        'game',
        'pdf',
        'image',
      ]);
      const item = controlItem && supportedItems.has(controlItem) ? controlItem : 'all';
      return `/board?controlAddItem=${item}&controlToken=${token}`;
    }
  } catch {
    // Ordinary relative paths are not absolute URLs.
  }
  return path;
}
