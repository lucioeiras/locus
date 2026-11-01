import TabLayout from '@/app/(tabs)/_layout';
import { render } from '@testing-library/react-native';

jest.mock('lucide-react-native', () =>
  Object.fromEntries(
    ['CircleUser', 'Folder', 'LayoutGrid', 'RotateCcw'].map((name) => [
      name,
      (props: object) =>
        jest
          .requireActual('react')
          .createElement(jest.requireActual('react-native').View, { ...props, testID: name }),
    ])
  )
);

let mockFocused = false;
let mockColor = '#ffffff';

jest.mock('expo-router', () => {
  const mockCreateElement = jest.requireActual('react').createElement;
  const { View } = jest.requireActual('react-native');
  return {
    Tabs: Object.assign(
      ({ children }: { children: React.ReactNode }) => mockCreateElement(View, null, children),
      {
        Screen: ({
          options,
        }: {
          options?: {
            tabBarIcon?: (props: { color: string; focused: boolean }) => React.ReactNode;
          };
        }) => options?.tabBarIcon?.({ color: mockColor, focused: mockFocused }) ?? null,
      }
    ),
  };
});
jest.mock('@/components/effects/ProgressiveBlur', () => ({ ProgressiveBlur: () => null }));
jest.mock('@/components/menus/FloatingTabOverlay', () => ({
  FloatingTabOverlayProvider: ({ children }: { children: React.ReactNode }) => children,
}));

it.each([false, true])('renders Lucide tab icons with focused=%s', async (focused) => {
  mockFocused = focused;
  mockColor = focused ? '#ffffff' : '#a1a1aa';
  const view = await render(<TabLayout />);
  for (const name of ['LayoutGrid', 'Folder', 'RotateCcw', 'CircleUser']) {
    const icon = view.getByTestId(name);
    expect(icon.props.size).toBe(28);
    expect(icon.props.color).toBe(mockColor);
    expect(icon.props.strokeWidth).toBe(focused ? 2 : 1.5);
    expect(icon.props.weight).toBeUndefined();
  }
});
