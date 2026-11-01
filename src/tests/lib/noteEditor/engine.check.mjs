// Exercise the real Milkdown/ProseMirror engine, not a native-component mock.
// Run with: bun run test:note-editor
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'https://editor.invalid',
});
for (const name of Object.getOwnPropertyNames(dom.window)) {
  if (!(name in globalThis)) {
    try {
      Object.defineProperty(globalThis, name, {
        value: dom.window[name],
        configurable: true,
        writable: true,
      });
    } catch {}
  }
}
for (const name of [
  'window',
  'document',
  'navigator',
  'Event',
  'CustomEvent',
  'EventTarget',
  'HTMLElement',
  'Element',
  'Node',
  'MutationObserver',
  'File',
  'FileReader',
  'getComputedStyle',
]) {
  Object.defineProperty(globalThis, name, {
    value: dom.window[name],
    configurable: true,
    writable: true,
  });
}
for (const name of ['dispatchEvent', 'addEventListener', 'removeEventListener'])
  globalThis[name] = dom.window[name].bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.ClipboardEvent = class extends dom.window.Event {
  constructor(type, options) {
    super(type, { cancelable: true, bubbles: true });
    this.clipboardData = options.clipboardData;
  }
};
globalThis.DragEvent = class extends dom.window.Event {};
dom.window.Range.prototype.getClientRects = () => [];
dom.window.Range.prototype.getBoundingClientRect = () => ({
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  width: 0,
  height: 0,
});
dom.window.scrollBy = () => {};
const { createNoteEditor } = await import('../../../lib/noteEditor/engine.ts');
const root = document.createElement('div');
const editorScroller = document.createElement('div');
editorScroller.className = 'locus-note-editor';
editorScroller.append(root);
document.body.append(editorScroller);
let imported = 0;
const insertRequests = [];
let errorCount = 0;
let failImport = false;
let nativeClipboard = null;
let clipboardReads = 0;
let releaseImport = null;
const options = {
  root,
  markdown:
    '# Heading\n\nParagraph **bold**.\n\n- [ ] Task\n\n![Photo](images/photo.png)\n\n<script>alert("never")</script>',
  placeholder: 'Write a note',
  onInsert: async (action) => {
    insertRequests.push(action);
  },
  onChange: () => {},
  importImage: async () => {
    if (releaseImport) await releaseImport;
    if (failImport) throw new Error('disk full');
    return `images/paste-${++imported}.png`;
  },
  resolveImage: async () => 'data:image/png;base64,AQI=',
  readClipboardImage: async () => {
    clipboardReads++;
    return nativeClipboard;
  },
  openLink: () => {},
  onError: () => {
    errorCount++;
  },
};
const engine = await createNoteEditor(options);
let engineDestroyed = false;
try {
  assert.equal(
    await engine.command({ method: 'getMarkdown' }),
    options.markdown,
    'opening preserves exact source'
  );
  assert.equal(
    root.querySelectorAll('script').length,
    0,
    'HTML is never executed/rendered as HTML'
  );
  assert.equal(root.textContent.includes('<script>'), true, 'opaque HTML is retained');
  await engine.command({ method: 'focus', start: true });
  await engine.command({ method: 'format', action: 'bold' });
  engine.view.dispatch(engine.view.state.tr.insertText('Hello '));
  let markdown = await engine.command({ method: 'getMarkdown' });
  assert.match(markdown, /\*\*Hello/);
  assert.match(
    markdown,
    /!\[Photo\]\(images\/photo.png\)/,
    'image alt and relative path survive serialization'
  );
  assert.match(markdown, /<script>alert\("never"\)<\/script>/);
  engine.undo();
  assert.equal((await engine.command({ method: 'getMarkdown' })).includes('Hello'), false);
  engine.redo();
  assert.equal((await engine.command({ method: 'getMarkdown' })).includes('Hello'), true);
  await engine.command({ method: 'setMarkdown', markdown: 'Task' });
  await engine.command({ method: 'focus', start: true });
  await engine.command({ method: 'format', action: 'todo' });
  markdown = await engine.command({ method: 'getMarkdown' });
  assert.match(markdown, /[-*] \[ \] Task/);
  await engine.command({ method: 'setMarkdown', markdown: 'Original' });
  await engine.command({ method: 'focus', start: true });
  await engine.command({ method: 'captureSelection' });
  engine.view.dispatch(engine.view.state.tr.insertText('Before '));
  await engine.command({ method: 'insertImage', uri: 'images/picked.png' });
  markdown = await engine.command({ method: 'getMarkdown' });
  assert.ok(
    markdown.indexOf('Before') < markdown.indexOf('images/picked.png'),
    'bookmark follows intervening edits'
  );
  await engine.command({ method: 'setMarkdown', markdown: 'Selection' });
  await engine.command({ method: 'focus', start: true });
  const file = new File([new Uint8Array([1, 2])], 'paste.png', { type: 'image/png' });
  const event = new ClipboardEvent('paste', {
    clipboardData: { files: [file], getData: () => '' },
  });
  engine.view.dom.dispatchEvent(event);
  markdown = await engine.command({ method: 'getMarkdown' });
  assert.match(markdown, /images\/paste-1.png/, 'saving immediately waits for image import');
  assert.equal(errorCount, 0);
  const { TextSelection } = await import('@milkdown/kit/prose/state');
  // A failed import must neither delete the selection nor allow a stale save.
  await engine.command({ method: 'setMarkdown', markdown: 'Keep selected text' });
  engine.view.dispatch(
    engine.view.state.tr.setSelection(TextSelection.create(engine.view.state.doc, 1, 5))
  );
  failImport = true;
  engine.view.dom.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: { files: [file], getData: () => '' } })
  );
  await assert.rejects(engine.command({ method: 'getMarkdown' }), /import failed/i);
  assert.equal(await engine.command({ method: 'getMarkdown' }), 'Keep selected text');
  assert.equal(errorCount, 1);
  failImport = false;
  // Multiple files are stored first, and replace the selection in one transaction.
  let release;
  releaseImport = new Promise((resolve) => {
    release = resolve;
  });
  engine.view.dom.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: { files: [file, file], getData: () => '' } })
  );
  let finished = false;
  const waitingSave = engine.command({ method: 'getMarkdown' }).then((value) => {
    finished = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(finished, false);
  assert.equal(engine.view.state.doc.textContent, 'Keep selected text');
  release();
  markdown = await waitingSave;
  releaseImport = null;
  assert.match(markdown, /images\/paste-2.png/);
  assert.match(markdown, /images\/paste-3.png/);
  assert.equal(markdown.includes('Keep'), false);
  // Empty native paste explicitly calls the bridge; ordinary text never does.
  nativeClipboard = 'data:image/png;base64,AQI=';
  engine.view.dom.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: { files: [], getData: () => '' } })
  );
  markdown = await engine.command({ method: 'getMarkdown' });
  assert.match(markdown, /images\/paste-4.png/);
  assert.equal(clipboardReads, 1);
  engine.view.dom.dispatchEvent(
    new ClipboardEvent('paste', {
      clipboardData: { files: [], getData: (type) => (type === 'text/plain' ? 'Pasted text' : '') },
    })
  );
  markdown = await engine.command({ method: 'getMarkdown' });
  assert.equal(clipboardReads, 1);
  assert.match(markdown, /Pasted text/);
  // The quote control preserves the app's literal-quotation behavior.
  await engine.command({ method: 'setMarkdown', markdown: 'Quote me' });
  await engine.command({ method: 'focus', start: true });
  await engine.command({ method: 'format', action: 'quote' });
  assert.equal((await engine.command({ method: 'getMarkdown' })).trim(), '"Quote me"');
  await engine.command({ method: 'format', action: 'quote' });
  assert.equal((await engine.command({ method: 'getMarkdown' })).trim(), 'Quote me');
  // Existing syntax can normalize only after editing, with no lost content.
  const fixture = readFileSync(new URL('./fixtures/compatibility.md', import.meta.url), 'utf8');
  await engine.command({ method: 'setMarkdown', markdown: fixture });
  assert.equal(await engine.command({ method: 'getMarkdown' }), fixture);
  assert.equal(root.querySelectorAll('script,custom-tag,unknown').length, 0);
  await engine.command({ method: 'focus', start: true });
  engine.view.dispatch(engine.view.state.tr.insertText('Edited '));
  markdown = await engine.command({ method: 'getMarkdown' });
  for (const fragment of [
    'Nested',
    '**bold**',
    '~~strike~~',
    '[ ] Open task',
    '[x] Done task',
    '> Quoted paragraph',
    'images/photo_123.png',
    'Photo alt',
    'Caption',
    'https://example.com/path',
    'images/reference.png',
    'Link title',
    '| Keep',
    'const sample',
    '<custom-tag>Unsupported HTML</custom-tag>',
    '<unknown attribute="value">',
    'Existing footnote text.',
  ]) {
    assert.ok(markdown.includes(fragment), `Missing compatibility fragment: ${fragment}`);
  }
  assert.match(markdown, /[*_]italic[*_]/);
  await engine.command({ method: 'setMarkdown', markdown: '- [ ] Open task\n- [x] Done task' });
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const taskMarker = root.querySelector('.label-wrapper .unchecked');
  assert.ok(
    taskMarker?.querySelector('.note-task-box'),
    'task marker uses the native-style checkbox'
  );
  taskMarker.parentElement.dispatchEvent(
    new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true })
  );
  assert.match(
    await engine.command({ method: 'getMarkdown' }),
    /\[x\] Open task/,
    'styled checkbox still toggles its task'
  );
  assert.match(
    await engine.command({ method: 'getMarkdown' }),
    /\[x\] Done task/,
    'other task stays checked'
  );
  await engine.command({ method: 'setMarkdown', markdown: 'Keep selection' });
  await engine.command({ method: 'focus', start: true });
  engine.view.dispatch(
    engine.view.state.tr.setSelection(TextSelection.create(engine.view.state.doc, 1, 5))
  );
  const beforeBlur = engine.view.state.doc;
  await engine.command({ method: 'blur' });
  assert.equal(engine.view.hasFocus(), false, 'dismissal blurs the actual DOM editor');
  assert.equal(engine.view.state.doc, beforeBlur, 'dismissal does not change the document');
  await engine.command({ method: 'format', action: 'bold' });
  assert.match(
    await engine.command({ method: 'getMarkdown' }),
    /\*\*Keep\*\* selection/,
    'toolbar selection survives dismissal'
  );
  // Slash commands operate on the real selection and share toolbar actions.
  const menu = () => root.querySelector('.note-slash-menu');
  const keydown = (key) =>
    engine.view.dom.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    );
  const startSlash = async (text = '/') => {
    await engine.command({ method: 'setMarkdown', markdown: '' });
    await engine.command({ method: 'focus', start: true });
    engine.view.dispatch(engine.view.state.tr.insertText(text));
  };
  await startSlash();
  assert.equal(menu().hidden, false, 'slash opens menu');
  assert.equal(menu().querySelectorAll('[role="menuitem"]').length, 12);
  assert.equal(menu().querySelectorAll('.note-slash-icon svg').length, 12);
  assert.equal(
    menu().querySelector('[aria-label="Text"] svg').getAttribute('data-lucide'),
    'pilcrow'
  );
  assert.equal(
    menu().querySelector('[aria-label="Insert image"] svg').getAttribute('data-lucide'),
    'image-plus'
  );
  assert.equal(
    menu().querySelector('[aria-label="Add song lyrics"] svg').getAttribute('data-lucide'),
    'eighth-note'
  );
  keydown('ArrowDown');
  assert.equal(
    menu().querySelector('[data-active="true"]').getAttribute('aria-label'),
    'Heading 1'
  );
  keydown('Enter');
  engine.view.dispatch(engine.view.state.tr.insertText('Slash heading'));
  assert.equal((await engine.command({ method: 'getMarkdown' })).trim(), '# Slash heading');
  assert.equal(menu().hidden, true, 'selection closes menu and removes slash');
  await startSlash('/bold');
  assert.equal(menu().querySelectorAll('[role="menuitem"]').length, 1);
  menu().querySelector('button').click();
  engine.view.dispatch(engine.view.state.tr.insertText('Strong'));
  assert.match(await engine.command({ method: 'getMarkdown' }), /\*\*Strong\*\*/);
  await startSlash('/unknown');
  assert.equal(menu().textContent, 'No commands found');
  keydown('Escape');
  assert.equal(menu().hidden, true);
  assert.equal((await engine.command({ method: 'getMarkdown' })).trim(), '/unknown');
  engine.view.dispatch(engine.view.state.tr.insertText('x'));
  assert.equal(menu().hidden, true, 'dismissed query stays dismissed');
  await startSlash('https://example.com/');
  assert.equal(menu().hidden, true, 'URL slash is ordinary text');
  await startSlash('/image');
  keydown('Enter');
  assert.deepEqual(insertRequests, ['image']);
  assert.equal((await engine.command({ method: 'getMarkdown' })).trim(), '');
  await startSlash('/lyrics');
  keydown('Enter');
  assert.deepEqual(insertRequests, ['image', 'lyrics']);
  await startSlash();
  await engine.command({ method: 'blur' });
  assert.equal(menu().hidden, true, 'blur closes menu');
  await engine.command({ method: 'setMarkdown', markdown: 'Selected' });
  await engine.command({ method: 'focus', start: true });
  engine.view.dispatch(
    engine.view.state.tr.setSelection(TextSelection.create(engine.view.state.doc, 1, 5))
  );
  assert.equal(menu().hidden, true, 'selection does not open menu');
  // Long presses select and move real blocks; ordinary taps and early swipes stay native.
  const { noteBlocks, moveNoteBlock, deleteNoteBlock } =
    await import('../../../lib/noteEditor/blocks.ts');
  const { NodeSelection, AllSelection } = await import('@milkdown/kit/prose/state');
  const blockMenu = () => root.querySelector('.note-block-menu');
  const blockDom = (index) => engine.view.nodeDOM(noteBlocks(engine.view.state.doc)[index].from);
  const pointer = (target, type, y = 10, x = 60, id = 1, primary = true) => {
    const event = new dom.window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
    });
    Object.defineProperties(event, { pointerId: { value: id }, isPrimary: { value: primary } });
    target.dispatchEvent(event);
    return event;
  };
  const originalSetTimeout = window.setTimeout;
  const originalClearTimeout = window.clearTimeout;
  const holds = new Map();
  let timerId = -1;
  window.setTimeout = (callback, delay, ...args) => {
    if (delay !== 350) return originalSetTimeout.call(window, callback, delay, ...args);
    const id = timerId--;
    holds.set(id, callback);
    return id;
  };
  window.clearTimeout = (id) => {
    if (holds.has(id)) holds.delete(id);
    else originalClearTimeout.call(window, id);
  };
  const activateHold = () => {
    assert.equal(holds.size, 1, 'one 350 ms activation timer');
    const [id, callback] = [...holds][0];
    holds.delete(id);
    callback();
  };
  const blockAction = (label) => {
    const button = [...blockMenu().querySelectorAll('button')].find(
      (button) => button.textContent === label
    );
    assert.ok(button, `Missing block action: ${label}`);
    button.click();
  };
  const openBlock = (index) => {
    // Keyboard access remains available without a visible handle.
    engine.view.dispatch(
      engine.view.state.tr.setSelection(
        NodeSelection.create(engine.view.state.doc, noteBlocks(engine.view.state.doc)[index].from)
      )
    );
    engine.view.dom.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'F10',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    assert.equal(blockMenu().hidden, false);
  };
  const preview = () => root.querySelector('.note-block-drag-preview');
  const nativeEvent = (type) => {
    const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
    engine.view.dom.dispatchEvent(event);
    return event;
  };
  const touch = (type, x = 60, y = 10, count = 1) => {
    const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      touches: { value: Array.from({ length: count }, () => ({ clientX: x, clientY: y })) },
      changedTouches: { value: [{ clientX: x, clientY: y }] },
    });
    engine.view.dom.dispatchEvent(event);
    return event;
  };
  const assertClean = () => {
    assert.equal(preview(), null);
    assert.equal(root.querySelector('.note-block-drag-source'), null);
    assert.equal(root.classList.contains('note-block-gesture'), false);
    assert.equal(root.querySelector('.note-block-drop-indicator').hidden, true);
    assert.equal(holds.size, 0, 'activation timer is cleared');
    assert.equal(nativeEvent('selectstart').defaultPrevented, false);
    assert.equal(touch('touchmove').defaultPrevented, false, 'normal scrolling remains available');
  };
  try {
    await engine.command({ method: 'setMarkdown', markdown: '' });
    openBlock(0);
    assert.ok(root.querySelector('p.ProseMirror-selectednode'), 'empty blocks can be selected');
    await engine.command({
      method: 'setMarkdown',
      markdown: 'First **bold**\n\nSecond\n\n![Photo](images/block.png)',
    });
    assert.equal(root.querySelector('.note-block-handle'), null, 'visible handles are removed');
    await engine.command({ method: 'focus', start: true });
    const caret = engine.view.state.selection;
    assert.equal(pointer(blockDom(0), 'pointerdown').defaultPrevented, false);
    assert.equal(
      nativeEvent('selectstart').defaultPrevented,
      false,
      'pending holds do not block text selection'
    );
    pointer(blockDom(0), 'pointerup');
    assert.ok(engine.view.state.selection.eq(caret), 'a short tap does not select a block');
    assert.equal(blockMenu().hidden, true);
    assertClean();
    // The next tap stays native and does not even arm a block hold.
    pointer(blockDom(0), 'pointerdown');
    assert.equal(holds.size, 0, 'double tap is reserved for native word selection');
    pointer(blockDom(0), 'pointerup');
    pointer(blockDom(1), 'pointerdown');
    assert.equal(pointer(document.body, 'pointermove', 30, 75).defaultPrevented, false);
    pointer(document.body, 'pointerup', 30, 75);
    assertClean();
    pointer(blockDom(1), 'pointerdown');
    touch('touchmove', 60, 40);
    assertClean();
    pointer(blockDom(1), 'pointerdown');
    editorScroller.dispatchEvent(new dom.window.Event('scroll'));
    assertClean();
    // Hold without motion selects immediately, hides the caret, and opens options on release.
    pointer(blockDom(1), 'pointerdown');
    activateHold();
    assert.ok(engine.view.state.selection instanceof NodeSelection);
    assert.equal(engine.view.state.selection.from, noteBlocks(engine.view.state.doc)[1].from);
    assert.equal(engine.view.dom.getAttribute('data-block-selected'), 'true');
    assert.equal(nativeEvent('contextmenu').defaultPrevented, true);
    assert.equal(preview(), null, 'stationary selection does not float the block');
    touch('touchend', 60, 10, 0); // iOS fallback when no pointerup is delivered.
    assert.equal(blockMenu().hidden, false);
    assertClean();
    const longPressClick = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
    blockDom(1).dispatchEvent(longPressClick);
    assert.equal(
      longPressClick.defaultPrevented,
      true,
      'long press cannot follow a link or reset selection'
    );
    const anchor = blockDom(1);
    const originalAnchorRect = anchor.getBoundingClientRect;
    const originalScrollerRect = editorScroller.getBoundingClientRect;
    const previousViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    const previousScrollTop = editorScroller.scrollTop;
    let anchorTop = 470;
    anchor.getBoundingClientRect = () => ({
      top: anchorTop - editorScroller.scrollTop,
      bottom: anchorTop + 60 - editorScroller.scrollTop,
      left: 32,
      right: 300,
      width: 268,
      height: 60,
    });
    editorScroller.getBoundingClientRect = () => ({
      top: 0,
      bottom: 600,
      left: 0,
      right: 400,
      width: 400,
      height: 600,
    });
    Object.defineProperty(blockMenu(), 'offsetHeight', { configurable: true, value: 180 });
    Object.defineProperty(blockMenu(), 'offsetWidth', { configurable: true, value: 280 });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { offsetTop: 0, offsetLeft: 0, width: 400, height: 600 },
    });
    try {
      editorScroller.scrollTop = 0;
      openBlock(1);
      assert.ok(
        root.classList.contains('note-block-menu-open'),
        'menu elevates the selected block'
      );
      assert.equal(
        editorScroller.scrollTop,
        134,
        'opening near the bottom scrolls the block upward'
      );
      assert.equal(parseFloat(blockMenu().style.top), anchor.getBoundingClientRect().bottom + 16);
      assert.equal(
        parseFloat(blockMenu().style.top) + 180,
        592,
        'menu fits above the viewport edge'
      );
      assert.equal(
        root.style.getPropertyValue('--note-block-menu-space'),
        '204px',
        'last blocks receive space below the menu'
      );
      window.visualViewport.offsetTop = 30;
      window.visualViewport.height = 300;
      window.dispatchEvent(new dom.window.Event('resize'));
      assert.equal(
        parseFloat(blockMenu().style.top) + 180,
        322,
        'keyboard viewport changes reveal the menu below the block'
      );
      editorScroller.scrollTop += 20;
      const userScroll = editorScroller.scrollTop;
      editorScroller.dispatchEvent(new dom.window.Event('scroll'));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      assert.equal(
        editorScroller.scrollTop,
        userScroll,
        'position updates do not fight user scrolling'
      );
      assert.equal(parseFloat(blockMenu().style.top), anchor.getBoundingClientRect().bottom + 16);
      window.visualViewport.offsetTop = 0;
      window.visualViewport.height = 600;
      anchorTop = 10;
      editorScroller.scrollTop = 0;
      openBlock(1);
      assert.equal(editorScroller.scrollTop, 0, 'no scrolling when the menu already fits');
      assert.equal(parseFloat(blockMenu().style.top), 86);
      document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
      assert.equal(root.classList.contains('note-block-menu-open'), false);
      assert.equal(root.style.getPropertyValue('--note-block-menu-space'), '');
    } finally {
      anchor.getBoundingClientRect = originalAnchorRect;
      editorScroller.getBoundingClientRect = originalScrollerRect;
      delete blockMenu().offsetHeight;
      delete blockMenu().offsetWidth;
      if (previousViewport) Object.defineProperty(window, 'visualViewport', previousViewport);
      else delete window.visualViewport;
      editorScroller.scrollTop = previousScrollTop;
    }
    openBlock(0);
    blockAction('Select entire note');
    assert.equal(engine.view.state.selection instanceof AllSelection, true);
    assert.equal(engine.view.state.selection.to, engine.view.state.doc.content.size);
    openBlock(0);
    blockAction('Italic');
    assert.equal(engine.view.state.doc.firstChild.textContent, 'First bold');
    engine.view.state.doc.firstChild.forEach((node) => {
      assert.ok(
        node.marks.some((mark) => mark.type.name === 'emphasis'),
        'format covers the whole block'
      );
    });
    assert.equal(engine.view.state.doc.child(1).textContent, 'Second');
    openBlock(1);
    blockAction('Heading 2');
    assert.equal(engine.view.state.doc.child(1).type.name, 'heading');
    assert.equal(engine.view.state.doc.child(1).attrs.level, 2);
    const beforeMove = engine.view.state.doc;
    const imageNode = beforeMove.lastChild;
    openBlock(2);
    blockAction('Move up');
    assert.ok(engine.view.state.doc.child(1).eq(imageNode), 'media moves with its attributes');
    engine.undo();
    assert.ok(engine.view.state.doc.eq(beforeMove), 'one undo restores the move');
    engine.redo();
    assert.ok(engine.view.state.doc.child(1).eq(imageNode));
    assert.equal(moveNoteBlock(engine.view.state, -1, 0), null);
    assert.equal(moveNoteBlock(engine.view.state, 0, 1), null, 'cannot drop inside a block');
    assert.equal(moveNoteBlock(engine.view.state, 0, 0), null);
    assert.equal(
      moveNoteBlock(engine.view.state, 0, engine.view.state.doc.firstChild.nodeSize),
      null
    );
    assert.equal(moveNoteBlock(engine.view.state, 0, Number.NaN), null);
    await engine.command({
      method: 'setMarkdown',
      markdown: '- [x] One\n- [ ] Two\n  - Child\n\nAfter',
    });
    assert.equal(engine.view.state.doc.childCount, 2, 'nested lists move together as a group');
    const list = engine.view.state.doc.firstChild;
    openBlock(0);
    blockAction('Move down');
    assert.ok(engine.view.state.doc.child(1).eq(list), 'task states and nesting survive');
    openBlock(1);
    blockAction('To-do list');
    const taskList = engine.view.state.doc.child(1);
    taskList.forEach((item) => assert.equal(item.attrs.checked, false));
    assert.ok(taskList.textContent.includes('Child'));
    await engine.command({
      method: 'setMarkdown',
      markdown: '> First quoted\n>\n> Second quoted\n\nOutside',
    });
    openBlock(0);
    blockAction('Heading 3');
    assert.equal(engine.view.state.doc.child(0).type.name, 'heading');
    assert.equal(engine.view.state.doc.child(1).type.name, 'heading');
    assert.equal(engine.view.state.doc.child(2).type.name, 'paragraph');
    assert.equal(engine.view.state.doc.child(2).textContent, 'Outside');
    await engine.command({
      method: 'setMarkdown',
      markdown: 'Before\n\n<script>opaque</script>\n\nAfter',
    });
    const opaque = engine.view.state.doc.child(1);
    openBlock(1);
    blockAction('Move up');
    assert.ok(
      engine.view.state.doc.firstChild.eq(opaque),
      'unknown Markdown is moved without conversion'
    );
    assert.equal(root.querySelectorAll('script').length, 0);

    for (const markdown of [
      'Some **bold text** and a [link](https://example.com)',
      '- Parent\n  - Nested item',
      '![Photo](images/block.png)',
    ]) {
      await engine.command({ method: 'setMarkdown', markdown });
      const target = blockDom(0).querySelector('strong, a, li, img') ?? blockDom(0);
      pointer(target, 'pointerdown');
      activateHold();
      assert.ok(engine.view.state.selection instanceof NodeSelection);
      assert.equal(
        engine.view.state.selection.from,
        0,
        'nested content selects its entire top-level block'
      );
      pointer(document.body, 'pointerup');
      assertClean();
    }

    await engine.command({ method: 'setMarkdown', markdown: 'Drag me\n\nMiddle\n\nLast' });
    const mockRects = () =>
      noteBlocks(engine.view.state.doc).forEach((block, index) => {
        engine.view.nodeDOM(block.from).getBoundingClientRect = () => ({
          top: index * 80,
          bottom: index * 80 + 60,
          left: 40,
          right: 340,
          width: 300,
          height: 60,
        });
      });
    mockRects();
    const beforeDrag = engine.view.state.doc;
    const sourceDom = blockDom(0);
    sourceDom.id = 'source-block';
    pointer(sourceDom, 'pointerdown');
    activateHold();
    pointer(sourceDom, 'lostpointercapture');
    assert.equal(
      root.classList.contains('note-block-gesture'),
      true,
      'transferring implicit touch capture does not cancel the hold'
    );
    assert.equal(nativeEvent('selectstart').defaultPrevented, true);
    assert.equal(nativeEvent('dragstart').defaultPrevented, true);
    assert.equal(pointer(document.body, 'pointermove', 15, 90).defaultPrevented, true);
    assert.ok(preview(), 'activated diagonal movement starts the floating preview');
    assert.equal(preview().getAttribute('aria-hidden'), 'true');
    assert.equal(preview().hasAttribute('inert'), true);
    assert.equal(preview().querySelector('[id]'), null);
    assert.equal(preview().style.width, '300px');
    assert.equal(preview().style.left, '70px');
    assert.equal(preview().style.top, '5px');
    assert.ok(sourceDom.classList.contains('note-block-drag-source'));
    assert.ok(engine.view.state.doc.eq(beforeDrag));
    pointer(document.body, 'pointerup', 15, 90);
    assert.ok(engine.view.state.doc.eq(beforeDrag), 'horizontal movement keeps the order');
    sourceDom.removeAttribute('id');
    assertClean();
    for (const cancellation of [
      'pointercancel',
      'lostpointercapture',
      'touchcancel',
      'Escape',
      'blur',
      'multitouch',
      'new-pointer',
    ]) {
      pointer(blockDom(0), 'pointerdown');
      activateHold();
      pointer(document.body, 'pointermove', 210, 90);
      assert.ok(preview());
      if (cancellation === 'Escape')
        document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
      else if (cancellation === 'blur') window.dispatchEvent(new dom.window.Event('blur'));
      else if (cancellation === 'multitouch') touch('touchstart', 60, 10, 2);
      else if (cancellation === 'new-pointer') pointer(document.body, 'pointerdown');
      else if (cancellation === 'touchcancel') touch('touchcancel', 60, 10, 0);
      else pointer(engine.view.dom, cancellation, 210, 90);
      assertClean();
      assert.ok(engine.view.state.doc.eq(beforeDrag), `${cancellation} does not commit a drag`);
    }
    // Active touch movement is prevented; early swipes above were not.
    pointer(blockDom(0), 'pointerdown');
    activateHold();
    assert.equal(touch('touchmove', 90, 210).defaultPrevented, true);
    touch('touchend', 90, 210, 0);
    assert.equal(engine.view.state.doc.lastChild.textContent, 'Drag me');
    assertClean();
    engine.undo();
    assert.ok(engine.view.state.doc.eq(beforeDrag), 'one undo restores the entire gesture');
    mockRects();
    pointer(blockDom(2), 'pointerdown', 170);
    activateHold();
    pointer(document.body, 'pointermove', -10, -30);
    pointer(document.body, 'pointerup', -10, -30);
    assert.equal(engine.view.state.doc.firstChild.textContent, 'Last');
    assertClean();
    engine.undo();
    for (const index of [0, 1, 0, 2]) {
      engine.view.dispatch(
        engine.view.state.tr.setSelection(TextSelection.create(engine.view.state.doc, 1))
      );
      pointer(blockDom(index), 'pointerdown');
      activateHold();
      pointer(document.body, 'pointerup');
      assert.ok(engine.view.state.selection instanceof NodeSelection);
      assert.equal(engine.view.state.selection.from, noteBlocks(engine.view.state.doc)[index].from);
      editorScroller.scrollTop = 180 + index;
      editorScroller.dispatchEvent(new dom.window.Event('scroll'));
      assert.equal(
        editorScroller.scrollTop,
        180 + index,
        'repeated selection leaves scroll available'
      );
      assertClean();
    }
    const selected = engine.view.state.doc.firstChild;
    openBlock(0);
    blockAction('Select block');
    engine.view.dom.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    assert.ok(engine.view.state.doc.child(1).eq(selected), 'keyboard reordering remains available');
    openBlock(0);
    blockMenu().dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    assert.equal(blockMenu().hidden, true);
    assert.equal(engine.view.hasFocus(), true);
    for (const index of [0, 1, 2]) {
      await engine.command({ method: 'setMarkdown', markdown: 'First\n\n**Middle**\n\nLast' });
      const before = engine.view.state.doc;
      const expected = noteBlocks(before)
        .filter((block) => block.index !== index)
        .map((block) => block.node);
      openBlock(index);
      blockAction('Delete block');
      assert.equal(blockMenu().hidden, true);
      assert.equal(root.classList.contains('note-block-menu-open'), false);
      assert.equal(engine.view.hasFocus(), true);
      assert.equal(engine.view.state.doc.childCount, 2);
      expected.forEach((node, position) =>
        assert.ok(
          engine.view.state.doc.child(position).eq(node),
          'neighbor content and marks survive deletion'
        )
      );
      assert.ok(engine.view.state.selection instanceof TextSelection);
      assert.equal(engine.view.dom.getAttribute('data-block-selected'), 'false');
      const after = engine.view.state.doc;
      engine.undo();
      assert.ok(engine.view.state.doc.eq(before), 'one undo restores the deleted block');
      engine.redo();
      assert.ok(engine.view.state.doc.eq(after), 'redo deletes the same block');
    }
    for (const markdown of [
      'Only **paragraph**',
      '![Photo](images/block.png)',
      '- [x] One\n- [ ] Two\n  - Nested',
      '<script>opaque</script>',
    ]) {
      await engine.command({ method: 'setMarkdown', markdown });
      const before = engine.view.state.doc;
      assert.ok(before.childCount === 1 || before.childCount === 2);
      if (before.childCount === 2) {
        assert.equal(before.lastChild.type.name, 'paragraph');
        assert.equal(before.lastChild.content.size, 0);
      }
      openBlock(0);
      blockAction('Delete block');
      assert.equal(
        engine.view.state.doc.childCount,
        1,
        'deleting the only content block leaves an editable paragraph'
      );
      assert.equal(engine.view.state.doc.firstChild.type.name, 'paragraph');
      assert.equal(engine.view.state.doc.firstChild.content.size, 0);
      assert.ok(engine.view.state.selection instanceof TextSelection);
      assert.equal(engine.view.state.selection.empty, true);
      engine.undo();
      assert.ok(
        engine.view.state.doc.eq(before),
        'undo restores the complete media/list/opaque block'
      );
    }
    for (const invalid of [-1, 1, NaN, Infinity, engine.view.state.doc.content.size])
      assert.equal(
        deleteNoteBlock(engine.view.state, invalid),
        null,
        'invalid or nested positions cannot delete a block'
      );
    pointer(blockDom(0), 'pointerdown');
    await engine.command({ method: 'setMarkdown', markdown: 'Replaced' });
    assertClean();
    pointer(blockDom(0), 'pointerdown');
    const editorElement = engine.view.dom;
    await engine.destroy();
    engineDestroyed = true;
    assert.equal(holds.size, 0, 'destroy clears pending activation');
    assert.equal(root.querySelector('.note-block-menu'), null);
    const afterDestroy = new dom.window.Event('touchmove', { bubbles: true, cancelable: true });
    editorElement.dispatchEvent(afterDestroy);
    assert.equal(afterDestroy.defaultPrevented, false);
  } finally {
    window.setTimeout = originalSetTimeout;
    window.clearTimeout = originalClearTimeout;
  }
  console.log(
    'Real editor checks passed, including long-press selection, scrolling, preview, reordering and cancellation.'
  );
} finally {
  if (!engineDestroyed) await engine.destroy();
  dom.window.close();
}
