import { fireEvent, render } from '@testing-library/react-native';
import HandleShareScreen from '@/app/handle-share';

jest.mock('@/../modules/locus-library-access/src/LocusLibraryAccessModule', () => ({
  __esModule: true,
  default: { extractEntitiesAndTags: () => [] },
}));

const mockDismissAll = jest.fn();
const mockReplace = jest.fn();
const mockClearSharedPayloads = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    dismissAll: (...args: unknown[]) => mockDismissAll(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));

jest.mock('expo-sharing', () => ({
  useIncomingShare: () => ({
    sharedPayloads: [],
    clearSharedPayloads: mockClearSharedPayloads,
  }),
}));

describe('HandleShareScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears the share and returns to the board after dismissing stacked screens', async () => {
    const { getByText } = await render(<HandleShareScreen />);

    fireEvent.press(getByText('Back to board'));

    expect(mockClearSharedPayloads).toHaveBeenCalledTimes(1);
    expect(mockDismissAll).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/board');
  });
});
