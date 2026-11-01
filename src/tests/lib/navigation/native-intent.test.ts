import { redirectSystemPath } from '@/app/+native-intent';

it.each([
  [
    'locus://control-add?controlItem=note&controlToken=one',
    '/board?controlAddItem=note&controlToken=one',
  ],
  [
    'locus:///control-add?controlItem=book&controlToken=two',
    '/board?controlAddItem=book&controlToken=two',
  ],
  [
    'locus://add?controlItem=pdf&controlToken=a%20b',
    '/board?controlAddItem=pdf&controlToken=a%20b',
  ],
  [
    'locus://control-add?controlItem=invalid&controlToken=three',
    '/board?controlAddItem=all&controlToken=three',
  ],
  ['locus://expo-sharing', '/handle-share'],
])('routes the Locus link %s', (path, expected) => {
  expect(redirectSystemPath({ path, initial: true })).toBe(expected);
});

it.each(['/settings', 'invalid url', 'other-app://add?controlItem=note', 'locus://unknown'])(
  'preserves unrelated or invalid paths: %s',
  (path) => {
    expect(redirectSystemPath({ path, initial: false })).toBe(path);
  }
);
