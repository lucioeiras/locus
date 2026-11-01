import { createSlashIcon } from './slashIcons';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorState } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  filterSlashCommands,
  slashQuery,
  type SlashCommand,
  type SlashAction,
} from './slashCommands';

type Match = { from: number; to: number; query: string };
type MenuState = { match: Match | null; dismissed: number | null; index: number };
const key = new PluginKey<MenuState>('locus-slash-menu');
let menuSequence = 0;

function findMatch(state: EditorState): Match | null {
  const { $from, empty, from } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.type.spec.code) return null;
  const match = slashQuery($from.parent.textBetween(0, $from.parentOffset, '\ufffc', '\ufffc'));
  return match ? { from: $from.start() + match.offset, to: from, query: match.query } : null;
}

export function slashMenu(options: {
  root: HTMLElement;
  commands: SlashCommand[];
  label: string;
  emptyLabel: string;
  run: (action: SlashAction) => void;
}) {
  const menuId = `note-slash-menu-${++menuSequence}`;
  let render = () => {};
  const dismiss = (view: EditorView) => view.dispatch(view.state.tr.setMeta(key, 'dismiss'));
  const choose = (view: EditorView, action: SlashAction) => {
    const match = key.getState(view.state)?.match;
    if (!match) return;
    view.dispatch(view.state.tr.delete(match.from, match.to).setMeta(key, 'dismiss'));
    view.focus();
    options.run(action);
  };
  return new Plugin<MenuState>({
    key,
    state: {
      init: () => ({ match: null, dismissed: null, index: 0 }),
      apply(tr, previous, _old, state) {
        const match = findMatch(state);
        const meta = tr.getMeta(key);
        if (meta === 'dismiss') return { match: null, dismissed: match?.from ?? null, index: 0 };
        const dismissed = previous.dismissed === match?.from ? previous.dismissed : null;
        const active =
          match && dismissed === null && (previous.match || tr.docChanged) ? match : null;
        return {
          match: active,
          dismissed,
          index:
            typeof meta === 'number'
              ? meta
              : previous.match?.query === active?.query
                ? previous.index
                : 0,
        };
      },
    },
    props: {
      attributes(state) {
        const current = key.getState(state);
        const commands = current?.match
          ? filterSlashCommands(options.commands, current.match.query)
          : [];
        return current?.match
          ? {
              'aria-controls': menuId,
              'aria-haspopup': 'menu',
              ...(commands.length
                ? { 'aria-activedescendant': `${menuId}-${current.index % commands.length}` }
                : {}),
            }
          : {};
      },
      handleKeyDown(view, event) {
        const state = key.getState(view.state);
        if (!state?.match || event.isComposing) return false;
        const commands = filterSlashCommands(options.commands, state.match.query);
        if (event.key === 'Escape' || event.key === 'Tab') {
          dismiss(view);
          return event.key === 'Escape';
        }
        if (commands.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          const index =
            (state.index + (event.key === 'ArrowDown' ? 1 : -1) + commands.length) %
            commands.length;
          view.dispatch(view.state.tr.setMeta(key, index));
          return true;
        }
        if (commands.length && event.key === 'Enter') {
          choose(view, commands[state.index % commands.length].action);
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        focus: () => {
          queueMicrotask(render);
          return false;
        },
        blur: (view) => {
          dismiss(view);
          return false;
        },
      },
    },
    view(view) {
      const menu = document.createElement('div');
      menu.id = menuId;
      menu.className = 'note-slash-menu';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', options.label);
      menu.hidden = true;
      options.root.append(menu);
      const position = () => {
        const match = key.getState(view.state)?.match;
        if (!match || menu.hidden) return;
        const coords = view.coordsAtPos(match.to);
        const viewport = window.visualViewport;
        const top = viewport?.offsetTop ?? 0;
        const left = viewport?.offsetLeft ?? 0;
        const height = viewport?.height ?? window.innerHeight;
        const width = viewport?.width ?? window.innerWidth;
        const below = top + height - coords.bottom - 8;
        const above = coords.top - top - 8;
        const useBelow = below >= Math.min(240, above);
        menu.style.maxHeight = `${Math.max(44, Math.min(320, useBelow ? below : above))}px`;
        menu.style.left = `${Math.max(left + 8, Math.min(coords.left, left + width - menu.offsetWidth - 8))}px`;
        menu.style.top = `${useBelow ? coords.bottom + 4 : Math.max(top + 8, coords.top - menu.offsetHeight - 4)}px`;
      };
      render = () => {
        const state = key.getState(view.state);
        menu.hidden = !state?.match || !view.hasFocus();
        menu.replaceChildren();
        if (menu.hidden || !state?.match) return;
        const commands = filterSlashCommands(options.commands, state.match.query);
        commands.forEach((command, index) => {
          const button = document.createElement('button');
          button.id = `${menuId}-${index}`;
          button.type = 'button';
          button.setAttribute('role', 'menuitem');
          button.setAttribute('aria-label', command.label);
          button.tabIndex = -1;
          button.dataset.active = String(index === state.index % commands.length);
          const icon = document.createElement('span');
          icon.className = 'note-slash-icon';
          icon.setAttribute('aria-hidden', 'true');
          icon.append(createSlashIcon(command.icon));
          button.append(icon, document.createTextNode(command.label));
          // Preserve the editor selection and mobile keyboard until activation.
          button.addEventListener('pointerdown', (event) => event.preventDefault());
          button.addEventListener('mousedown', (event) => event.preventDefault());
          button.addEventListener('click', () => choose(view, command.action));
          menu.append(button);
        });
        if (!commands.length) {
          const empty = document.createElement('div');
          empty.className = 'note-slash-empty';
          empty.setAttribute('role', 'status');
          empty.textContent = options.emptyLabel;
          menu.append(empty);
        }
        position();
        menu.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
      };
      const outside = (event: Event) => {
        if (!menu.hidden && event.target instanceof Node && !menu.contains(event.target))
          dismiss(view);
      };
      document.addEventListener('pointerdown', outside);
      window.addEventListener('scroll', position, true);
      window.visualViewport?.addEventListener('resize', position);
      window.visualViewport?.addEventListener('scroll', position);
      return {
        update: render,
        destroy() {
          document.removeEventListener('pointerdown', outside);
          window.removeEventListener('scroll', position, true);
          window.visualViewport?.removeEventListener('resize', position);
          window.visualViewport?.removeEventListener('scroll', position);
          menu.remove();
        },
      };
    },
  });
}
