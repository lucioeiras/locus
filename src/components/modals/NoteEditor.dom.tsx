'use dom';

import { useEffect, useRef, useState, type Ref } from 'react';
import { useDOMImperativeHandle, type DOMImperativeFactory } from 'expo/dom';
import type { DOMProps } from 'expo/dom';
import { Asset } from 'expo-asset';
import { NOTE_EDITOR_TYPOGRAPHY } from '@/lib/noteTypography';
import type { EditorFontSources } from '@/lib/noteEditor/fonts';
import type { BlockControlLabels } from '@/lib/noteEditor/blockControls';
import type { SlashCommand } from '@/lib/noteEditor/slashCommands';
import type { NoteEditorEngine } from '@/lib/noteEditor/engine';
import type { EditorRequest, EditorResult } from '@/lib/noteEditor/bridge';
import type { PickedImageAsset } from '@/lib/library/storage';
import '@milkdown/crepe/theme/common/prosemirror.css';
import '@milkdown/crepe/theme/common/reset.css';
import '@milkdown/crepe/theme/common/cursor.css';
import '@milkdown/crepe/theme/common/image-block.css';
import '@milkdown/crepe/theme/common/list-item.css';
import '@milkdown/crepe/theme/common/placeholder.css';
import './NoteEditor.css';

const regularFont = Asset.fromModule(
  require('@expo-google-fonts/instrument-sans/400Regular/InstrumentSans_400Regular.ttf')
).uri;
const mediumFont = Asset.fromModule(
  require('@expo-google-fonts/instrument-sans/500Medium/InstrumentSans_500Medium.ttf')
).uri;
const semiboldFont = Asset.fromModule(
  require('@expo-google-fonts/instrument-sans/600SemiBold/InstrumentSans_600SemiBold.ttf')
).uri;
const boldFont = Asset.fromModule(
  require('@expo-google-fonts/instrument-sans/700Bold/InstrumentSans_700Bold.ttf')
).uri;
const italicFont = Asset.fromModule(
  require('@expo-google-fonts/instrument-sans/400Regular_Italic/InstrumentSans_400Regular_Italic.ttf')
).uri;

export type NoteEditorDOMHandle = {
  focus(...args: Parameters<DOMImperativeFactory[string]>): void;
};

export type NoteEditorDOMProps = {
  ref?: Ref<NoteEditorDOMHandle>;
  dom?: DOMProps;
  value: string;
  request: EditorRequest | null;
  colors: {
    background: string;
    surface: string;
    foreground: string;
    muted: string;
    border: string;
    link: string;
    strong: string;
    secondary: string;
    bright: string;
    inverse: string;
  };
  placeholder: string;
  blockLabels: BlockControlLabels;
  slashCommands: SlashCommand[];
  slashMenuLabel: string;
  slashEmptyLabel: string;
  onInsert: (action: 'image' | 'lyrics') => Promise<void>;
  onReady: () => Promise<void>;
  onLoadFonts: () => Promise<EditorFontSources | null>;
  onChange: (markdown: string) => Promise<void>;
  onResult: (result: EditorResult) => Promise<void>;
  onImportImage: (asset: PickedImageAsset) => Promise<string>;
  onResolveImage: (uri: string) => Promise<string>;
  onReadClipboardImage: () => Promise<string | null>;
  onOpenLink: (url: string) => Promise<void>;
  onError: () => Promise<void>;
};

export default function NoteEditorDOM({ ref, ...props }: NoteEditorDOMProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<NoteEditorEngine | null>(null);
  const latest = useRef(props);
  useDOMImperativeHandle<NoteEditorDOMHandle>(
    ref ?? null,
    () => ({
      focus(...args: Parameters<DOMImperativeFactory[string]>) {
        const [id, start] = args;
        if (typeof id !== 'number' || typeof start !== 'boolean') return;
        // Focus in the native evaluateJavaScript call stack instead of waiting
        // for the asynchronous React render/effect that handles document commands.
        const engine = engineRef.current;
        if (!engine) {
          void latest.current.onResult({ id, error: 'Editor is not ready' });
          return;
        }
        void engine.command({ method: 'focus', start }).then(
          (value) => latest.current.onResult({ id, value }),
          () => latest.current.onResult({ id, error: 'Editor could not be focused' })
        );
      },
    }),
    []
  );
  useEffect(() => {
    latest.current = props;
  });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const lastRequest = useRef(0);
  const [fonts, setFonts] = useState<EditorFontSources>({
    regular: regularFont,
    medium: mediumFont,
    semibold: semiboldFont,
    bold: boldFont,
    italic: italicFont,
  });
  useEffect(() => {
    let disposed = false;
    void latest.current
      .onLoadFonts()
      .then((sources) => {
        if (!disposed && sources) setFonts(sources);
      })
      .catch(() => {
        if (!disposed) void latest.current.onError();
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const root = rootRef.current!;
    // The editor uses browser globals. Keep its synchronous bundle offline,
    // but initialize the module only on the client (Expo Router also does SSR).
    /* eslint-disable @typescript-eslint/no-require-imports -- Browser-only module, bundled synchronously for native offline use. */
    const { createNoteEditor } =
      require('@/lib/noteEditor/engine') as typeof import('@/lib/noteEditor/engine');
    /* eslint-enable @typescript-eslint/no-require-imports */
    void createNoteEditor({
      root,
      markdown: latest.current.value,
      blockLabels: latest.current.blockLabels,
      slashCommands: latest.current.slashCommands,
      slashMenuLabel: latest.current.slashMenuLabel,
      slashEmptyLabel: latest.current.slashEmptyLabel,
      onInsert: (action) => latest.current.onInsert(action),
      placeholder: latest.current.placeholder,
      onChange: (markdown) => {
        void latest.current.onChange(markdown);
      },
      importImage: (asset) => latest.current.onImportImage(asset),
      resolveImage: (uri) => latest.current.onResolveImage(uri),
      readClipboardImage: () => latest.current.onReadClipboardImage(),
      openLink: (url) => {
        void latest.current.onOpenLink(url);
      },
      onError: () => {
        void latest.current.onError();
      },
    })
      .then(async (engine) => {
        if (disposed) {
          await engine.destroy();
          return;
        }
        engineRef.current = engine;
        setReady(true);
        // Keep the native themed cover until the browser has committed and
        // painted the editor. Do not hide the WebView itself: it needs focus.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        if (!disposed) await latest.current.onReady();
      })
      .catch(() => {
        if (!disposed) {
          setFailed(true);
          void latest.current.onError();
        }
      });
    return () => {
      disposed = true;
      void engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !props.request || lastRequest.current === props.request.id) return;
    const { id, command } = props.request;
    lastRequest.current = id;
    void engineRef.current!.command(command).then(
      (value) => latest.current.onResult({ id, value }),
      () => latest.current.onResult({ id, error: 'Editor operation failed. Please try again.' })
    );
  }, [props.request, ready]);

  useEffect(() => {
    if (!ready) return;
    // The host's value is a recovery snapshot, not a controlled editor value.
    // Explicit setMarkdown commands handle external replacements; do not echo
    // potentially delayed snapshots back into an actively edited document.
    engineRef.current?.updatePlaceholder(props.placeholder);
  }, [props.placeholder, ready]);

  const { colors } = props;
  return (
    <div
      className="locus-note-editor"
      style={
        {
          ...NOTE_EDITOR_TYPOGRAPHY,
          '--note-strong': colors.strong,
          '--note-secondary': colors.secondary,
          '--note-bright': colors.bright,
          '--note-inverse': colors.inverse,
          '--note-background': colors.background,
          '--note-surface': colors.surface,
          '--note-foreground': colors.foreground,
          '--note-muted': colors.muted,
          '--note-border': colors.border,
          '--note-link': colors.link,
        } as React.CSSProperties
      }
    >
      <style>{`@font-face{font-family:InstrumentSans;src:url(${JSON.stringify(fonts.regular)});font-weight:400;font-display:swap}
        @font-face{font-family:InstrumentSans;src:url(${JSON.stringify(fonts.bold)});font-weight:700;font-display:swap}
        @font-face{font-family:InstrumentSans;src:url(${JSON.stringify(fonts.medium)});font-weight:500;font-display:swap}
        @font-face{font-family:InstrumentSans;src:url(${JSON.stringify(fonts.semibold)});font-weight:600;font-display:swap}
        @font-face{font-family:InstrumentSans;src:url(${JSON.stringify(fonts.italic)});font-style:italic;font-display:swap}`}</style>
      {!ready && (
        <div role="status" className="note-editor-status">
          {failed ? props.placeholder : '…'}
        </div>
      )}
      <div ref={rootRef} className="note-editor-root" />
    </div>
  );
}
