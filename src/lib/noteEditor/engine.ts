import { blockControls, defaultBlockControlLabels, type BlockControlLabels } from './blockControls';
import { slashMenu } from './slashMenu';
import { noteSlashCommands, type SlashCommand } from './slashCommands';
import { CrepeBuilder } from '@milkdown/crepe/builder';
import { cursor } from '@milkdown/crepe/feature/cursor';
import { imageBlock } from '@milkdown/crepe/feature/image-block';
import { listItem } from '@milkdown/crepe/feature/list-item';
import { placeholder, placeholderConfig } from '@milkdown/crepe/feature/placeholder';
import { opaqueBlock, preserveOpaque } from './opaque';
import { editorViewCtx } from '@milkdown/kit/core';
import { remarkImageBlockPlugin } from '@milkdown/kit/component/image-block';
import {
  Plugin,
  PluginKey,
  TextSelection,
  type SelectionBookmark,
} from '@milkdown/kit/prose/state';
import { liftListItem } from '@milkdown/kit/prose/schema-list';
import { undo, redo } from '@milkdown/kit/prose/history';
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  wrapInHeadingCommand,
  turnIntoTextCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark';
import { uploadPlugin } from '@milkdown/kit/plugin/upload';
import { $prose, callCommand, replaceAll } from '@milkdown/kit/utils';
import type { EditorCommand } from './bridge';
import { externalLink, imageFileData, safeImageSource } from './images';
import { NoteEditorSession } from './session';
import type { PickedImageAsset } from '@/lib/library/storage';

export type NoteEditorEngineOptions = {
  root: HTMLElement;
  markdown: string;
  placeholder: string;
  onChange: (markdown: string) => void;
  importImage: (asset: PickedImageAsset) => Promise<string>;
  resolveImage: (uri: string) => Promise<string>;
  readClipboardImage: () => Promise<string | null>;
  openLink: (url: string) => void;
  onError: () => void;
  blockLabels?: BlockControlLabels;
  slashCommands?: SlashCommand[];
  slashMenuLabel?: string;
  slashEmptyLabel?: string;
  onInsert?: (action: 'image' | 'lyrics') => Promise<void>;
};

export async function createNoteEditor(options: NoteEditorEngineOptions) {
  const bookmarks = new PluginKey<Map<string, SelectionBookmark>>('locus-selection');
  let sequence = 0;
  let session: NoteEditorSession | undefined;
  let destroyed = false;
  let failedImport = false;
  const pending = new Set<Promise<void>>();
  const view = () => crepe.editor.ctx.get(editorViewCtx);
  const notify = () => {
    if (!session || destroyed) return;
    const changed = session.change(crepe.getMarkdown());
    if (changed !== undefined) options.onChange(changed);
  };
  const keepVisible = () => {
    if (destroyed) return;
    const editor = view();
    // Keyboard/font/image layout changes should reveal a typing caret, not
    // scroll an entire selected block (or note) into the viewport.
    if (
      !editor.hasFocus() ||
      !(editor.state.selection instanceof TextSelection) ||
      !editor.state.selection.empty
    )
      return;
    editor.dispatch(editor.state.tr.scrollIntoView());
  };
  const capture = (id: string) => {
    const editor = view();
    editor.dispatch(editor.state.tr.setMeta(bookmarks, { capture: id }));
  };
  const restore = (id: string) => {
    const editor = view();
    const bookmark = bookmarks.getState(editor.state)?.get(id);
    if (bookmark) editor.dispatch(editor.state.tr.setSelection(bookmark.resolve(editor.state.doc)));
    editor.dispatch(editor.state.tr.setMeta(bookmarks, { remove: id }));
  };
  const insertImages = (uris: string[], id?: string) => {
    if (destroyed) return;
    if (id) restore(id);
    const editor = view();
    let tr = editor.state.tr;
    for (const uri of uris) {
      if (!safeImageSource(uri)) throw new Error('Invalid image');
      tr = tr.replaceSelectionWith(
        editor.state.schema.nodes.image.create({ src: uri, alt: '', title: '' })
      );
    }
    editor.dispatch(tr.scrollIntoView());
    notify();
  };
  const track = (job: () => Promise<void>) => {
    failedImport = false;
    const promise = job()
      .catch(() => {
        failedImport = true;
        if (!destroyed) options.onError();
      })
      .finally(() => pending.delete(promise));
    pending.add(promise);
    return promise;
  };
  const storeFile = async (file: File) =>
    options.importImage({
      uri: await imageFileData(file),
      mimeType: file.type,
      fileName: file.name,
    });
  const uploadFile = (file: File) => {
    failedImport = false;
    const result = storeFile(file).catch(() => {
      failedImport = true;
      if (!destroyed) options.onError();
      throw new Error('Could not import image');
    });
    const waiting = result
      .then(
        () => undefined,
        () => undefined
      )
      .finally(() => pending.delete(waiting));
    pending.add(waiting);
    return result;
  };
  const importFiles = (files: File[]) => {
    const id = `paste-${++sequence}`;
    capture(id);
    return track(async () => {
      const uris: string[] = [];
      for (const file of files) {
        uris.push(await storeFile(file));
      }
      insertImages(uris, id);
    });
  };
  const ownInput = $prose(
    () =>
      new Plugin({
        key: bookmarks,
        state: {
          init: () => new Map<string, SelectionBookmark>(),
          apply(tr, previous) {
            const next = new Map(
              [...previous].map(([id, bookmark]) => [id, bookmark.map(tr.mapping)])
            );
            const action = tr.getMeta(bookmarks);
            if (action?.capture) next.set(action.capture, tr.selection.getBookmark());
            if (action?.remove) next.delete(action.remove);
            return next;
          },
        },
        props: {
          scrollMargin: { top: 56, right: 8, bottom: 128, left: 8 },
          scrollThreshold: { top: 32, right: 0, bottom: 96, left: 0 },
          handlePaste(_view, event) {
            const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
              file.type.startsWith('image/')
            );
            if (files.length) {
              void importFiles(files);
              return true;
            }
            // Only consult native Clipboard in response to an actual empty paste.
            // Text/HTML paste remains Milkdown's responsibility.
            if (
              !event.clipboardData?.getData('text/plain') &&
              !event.clipboardData?.getData('text/html')
            ) {
              const id = `paste-${++sequence}`;
              capture(id);
              void track(async () => {
                const uri = await options.readClipboardImage();
                if (uri)
                  insertImages([await options.importImage({ uri, mimeType: 'image/png' })], id);
                else restore(id);
              });
              return true;
            }
            return false;
          },
          handleDrop(_view, event) {
            const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
              file.type.startsWith('image/')
            );
            if (!files.length) return false;
            const position = view().posAtCoords({ left: event.clientX, top: event.clientY });
            if (position)
              view().dispatch(
                view().state.tr.setSelection(
                  TextSelection.near(view().state.doc.resolve(position.pos))
                )
              );
            void importFiles(files);
            return true;
          },
          handleClick(_view, _position, event) {
            const target = event.target instanceof Element ? event.target.closest('a') : null;
            if (!target) return false;
            event.preventDefault();
            const url = target.getAttribute('href') ?? '';
            if (externalLink(url)) options.openLink(url);
            return true;
          },
          attributes: {
            role: 'textbox',
            'aria-multiline': 'true',
            'aria-label': options.placeholder,
            'data-testid': 'note-rich-text-input',
          },
          handleDOMEvents: {
            blur: () => {
              capture('toolbar');
              return false;
            },
          },
        },
        view: () => ({
          update: (editor, previous) => {
            if (!editor.state.doc.eq(previous.doc)) queueMicrotask(notify);
          },
        }),
      })
  );
  // Load only the features used by Locus. Besides avoiding extra controls,
  // static feature imports keep the native DOM document in one offline bundle.
  const crepe = new CrepeBuilder({ root: options.root, defaultValue: options.markdown })
    .addFeature(cursor)
    .addFeature(listItem, {
      bulletIcon: '<span>•</span>',
      checkBoxUncheckedIcon:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect class="note-task-box" x="1" y="1" width="22" height="22" rx="5" stroke-width="2"/></svg>',
      checkBoxCheckedIcon:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect class="note-task-box" x="1" y="1" width="22" height="22" rx="5" stroke-width="2"/><path class="note-task-tick" d="m6.67 12 3.33 3.33 7.33-7.33" fill="none" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    })
    .addFeature(placeholder, { text: options.placeholder, mode: 'doc' })
    .addFeature(imageBlock, {
      proxyDomURL: async (uri: string) => {
        if (!safeImageSource(uri)) return '';
        try {
          return await options.resolveImage(uri);
        } catch {
          return '';
        }
      },
      onUpload: uploadFile,
    });
  // Keep ordinary Markdown image alt/title values. Crepe's block transform
  // otherwise interprets the alt text as an aspect ratio and rewrites it.
  await crepe.editor.remove([...remarkImageBlockPlugin, uploadPlugin]);
  crepe.editor
    .use(opaqueBlock)
    .use(preserveOpaque)
    .use(ownInput)
    .use(
      $prose(() =>
        slashMenu({
          root: options.root,
          commands: (options.slashCommands ?? noteSlashCommands((key) => key)).filter(
            ({ action }) => options.onInsert || (action !== 'image' && action !== 'lyrics')
          ),
          label: options.slashMenuLabel ?? 'Formatting and insertion',
          emptyLabel: options.slashEmptyLabel ?? 'No commands found',
          run: (action) => {
            if (action === 'image' || action === 'lyrics') {
              void options.onInsert?.(action).catch(options.onError);
            } else {
              void engine.command({ method: 'format', action }).catch(options.onError);
            }
          },
        })
      )
    );
  crepe.editor.use(
    $prose(() =>
      blockControls({
        root: options.root,
        commands: options.slashCommands ?? noteSlashCommands((key) => key),
        labels: options.blockLabels ?? defaultBlockControlLabels,
        format: (action) => {
          void engine.command({ method: 'format', action }).catch(options.onError);
        },
      })
    )
  );
  await crepe.create();
  session = new NoteEditorSession(options.markdown, crepe.getMarkdown());
  const viewport = window.visualViewport;
  viewport?.addEventListener('resize', keepVisible);
  options.root.addEventListener('load', keepVisible, true);
  document.fonts?.addEventListener('loadingdone', keepVisible);

  const engine = {
    async command(command: EditorCommand): Promise<string> {
      if (destroyed) throw new Error('Editor is unavailable');
      if (command.method === 'getMarkdown') {
        while (pending.size) await Promise.all([...pending]);
        if (failedImport) {
          failedImport = false;
          throw new Error('Image import failed. Please try again.');
        }
        notify();
        return session!.markdown;
      }
      if (command.method === 'setMarkdown') {
        if (command.markdown !== session!.markdown) {
          crepe.editor.action(replaceAll(command.markdown));
          session!.replace(command.markdown, crepe.getMarkdown());
          options.onChange(command.markdown);
        }
      } else if (command.method === 'captureSelection') {
        capture('image');
      } else if (command.method === 'insertImage') {
        insertImages([command.uri], 'image');
      } else if (command.method === 'blur') {
        capture('toolbar');
        view().dom.blur();
      } else if (command.method === 'focus') {
        if (command.start)
          view().dispatch(view().state.tr.setSelection(TextSelection.atStart(view().state.doc)));
        view().focus();
        keepVisible();
      } else if (command.method === 'format') {
        const editor = view();
        if (!editor.hasFocus()) restore('toolbar');
        const action = command.action;
        if (action === 'bold') crepe.editor.action(callCommand(toggleStrongCommand.key));
        else if (action === 'italic') crepe.editor.action(callCommand(toggleEmphasisCommand.key));
        else if (action.startsWith('heading-'))
          crepe.editor.action(callCommand(wrapInHeadingCommand.key, Number(action.slice(-1))));
        else if (action === 'paragraph') {
          liftListItem(editor.state.schema.nodes.list_item)(editor.state, editor.dispatch);
          crepe.editor.action(callCommand(turnIntoTextCommand.key));
        } else if (action === 'bullet' || action === 'numbered' || action === 'todo') {
          const selected = editor.state.selection.$from;
          let listDepth = 0;
          for (let depth = selected.depth; depth > 0; depth--) {
            if (selected.node(depth).type.name === 'list_item') {
              listDepth = depth;
              break;
            }
          }
          if (listDepth) {
            const position = selected.before(listDepth);
            const item = selected.node(listDepth);
            editor.dispatch(
              editor.state.tr.setNodeMarkup(position, undefined, {
                ...item.attrs,
                checked: action === 'todo' ? false : null,
              })
            );
            if (
              action === 'numbered' &&
              selected.node(listDepth - 1).type.name !== 'ordered_list'
            ) {
              editor.dispatch(
                editor.state.tr.setNodeMarkup(
                  selected.before(listDepth - 1),
                  editor.state.schema.nodes.ordered_list
                )
              );
            } else if (
              action !== 'numbered' &&
              selected.node(listDepth - 1).type.name !== 'bullet_list'
            ) {
              editor.dispatch(
                editor.state.tr.setNodeMarkup(
                  selected.before(listDepth - 1),
                  editor.state.schema.nodes.bullet_list
                )
              );
            }
          } else {
            crepe.editor.action(
              callCommand(
                action === 'numbered' ? wrapInOrderedListCommand.key : wrapInBulletListCommand.key
              )
            );
            if (action === 'todo') {
              const { $from } = editor.state.selection;
              const position = $from.before($from.depth - 1);
              const item = editor.state.doc.nodeAt(position);
              if (item?.type.name === 'list_item')
                editor.dispatch(
                  editor.state.tr.setNodeMarkup(position, undefined, {
                    ...item.attrs,
                    checked: false,
                  })
                );
            }
          }
        } else if (action === 'quote') {
          const { from, to, $from } = editor.state.selection;
          const start = from === to ? $from.start() : from;
          const end = from === to ? $from.end() : to;
          const quoted = editor.state.doc.textBetween(start, end, '\n');
          const alreadyQuoted =
            quoted.startsWith('"') && quoted.endsWith('"') && quoted.length >= 2;
          const tr = editor.state.tr;
          if (alreadyQuoted) tr.delete(end - 1, end).delete(start, start + 1);
          else tr.insertText('"', end).insertText('"', start);
          editor.dispatch(tr.scrollIntoView());
        }
        editor.focus();
        notify();
      }
      return '';
    },
    updatePlaceholder(placeholder: string) {
      options.root.querySelector('[role="textbox"]')?.setAttribute('aria-label', placeholder);
      crepe.editor.ctx.update(placeholderConfig.key, (value) => ({ ...value, text: placeholder }));
      view().dispatch(view().state.tr);
    },
    undo() {
      undo(view().state, view().dispatch);
      notify();
    },
    redo() {
      redo(view().state, view().dispatch);
      notify();
    },
    async destroy() {
      destroyed = true;
      viewport?.removeEventListener('resize', keepVisible);
      options.root.removeEventListener('load', keepVisible, true);
      document.fonts?.removeEventListener('loadingdone', keepVisible);
      await crepe.destroy();
    },
    get view() {
      return view();
    },
  };
  return engine;
}
export type NoteEditorEngine = Awaited<ReturnType<typeof createNoteEditor>>;
