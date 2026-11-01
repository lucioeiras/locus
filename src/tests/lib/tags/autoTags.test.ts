import {
  generateAutoTags,
  isGibberishOrMachineId,
  matchExistingTag,
  normalizeTag,
} from '@/lib/tags/autoTags';

jest.mock('@/../modules/locus-library-access/src/LocusLibraryAccessModule', () => ({
  __esModule: true,
  default: { extractEntitiesAndTags: () => [] },
}));

describe('automatic tags', () => {
  it('normalizes tags and matches spelling variants to existing names', () => {
    expect(normalizeTag('  ##React Native!  ')).toBe('react-native');
    expect(matchExistingTag('reactnative', ['React Native'])).toBe('React Native');
    expect(matchExistingTag('tutorials', ['tutorial'])).toBe('tutorial');
    expect(matchExistingTag('gardening', ['cinema'])).toBeNull();
  });

  it('filters identifiers and file names from human tags', () => {
    expect(isGibberishOrMachineId('IMG_2048')).toBe(true);
    expect(isGibberishOrMachineId('a91f2')).toBe(true);
    expect(isGibberishOrMachineId('gardening')).toBe(false);
  });

  it('suggests media tags, prefers existing user tags, and excludes current tags', () => {
    expect(generateAutoTags({ type: 'book' })).toEqual(expect.arrayContaining(['book', 'reading']));
    expect(
      generateAutoTags({ title: 'React Native layouts', existingTags: ['React Native'] })
    ).toContain('React Native');
    expect(generateAutoTags({ type: 'book', currentTags: ['book', 'reading'] })).toEqual([]);
  });
});
