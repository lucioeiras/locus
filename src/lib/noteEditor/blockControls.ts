import { AllSelection, NodeSelection, Plugin, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { liftListItem } from '@milkdown/kit/prose/schema-list';
import {
  blockTextSelection,
  canFormatBlock,
  deleteNoteBlock,
  moveNoteBlock,
  noteBlocks,
  type NoteBlock,
} from './blocks';
import { createSlashIcon, type NoteEditorIcon } from './slashIcons';
import type { SlashCommand } from './slashCommands';
import type { NoteFormattingAction } from '@/components/modals/NoteRichTextInput.types';

export type BlockControlLabels = {
  handle: string;
  menu: string;
  selectBlock: string;
  selectAll: string;
  moveUp: string;
  moveDown: string;
  moved: string;
  deleteBlock: string;
  deleted: string;
};

export const defaultBlockControlLabels: BlockControlLabels = {
  handle: 'Hold a block to select it, then drag to move',
  menu: 'Block options',
  selectBlock: 'Select block',
  selectAll: 'Select entire note',
  moveUp: 'Move up',
  moveDown: 'Move down',
  moved: 'Block moved',
  deleteBlock: 'Delete block',
  deleted: 'Block deleted',
};

export function blockControls(options: {
  root: HTMLElement;
  commands: SlashCommand[];
  labels: BlockControlLabels;
  format: (action: NoteFormattingAction) => void;
}) {
  return new Plugin({
    props: {
      attributes(state) {
        return {
          'data-block-selected': String(state.selection instanceof NodeSelection),
          'aria-description': options.labels.handle,
        };
      },
    },
    view(view) {
      const menu = document.createElement('div');
      menu.className = 'note-slash-menu note-block-menu';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', options.labels.menu);
      menu.hidden = true;
      const indicator = document.createElement('div');
      indicator.className = 'note-block-drop-indicator';
      indicator.hidden = true;
      const status = document.createElement('div');
      status.className = 'note-block-announcement';
      status.setAttribute('role', 'status');
      options.root.append(menu, indicator, status);
      let active: number | null = null;
      let holdTimer = 0;
      let suppressClick = false;
      let lastTap: { from: number; time: number; x: number; y: number } | null = null;
      let frame = 0;
      let scrollFrame = 0;
      let preview: HTMLDivElement | null = null;
      let source: HTMLElement | null = null;
      let drag: {
        from: number;
        pointer: number;
        x: number;
        y: number;
        originX: number;
        originY: number;
        offsetX: number;
        offsetY: number;
        activated: boolean;
        started: boolean;
        boundary: number;
        capture: HTMLElement;
      } | null = null;
      const scroller = options.root.closest<HTMLElement>('.locus-note-editor');
      const preserveScroll = (action: () => void) => {
        const ancestors: { element: HTMLElement; top: number; left: number }[] = [];
        for (
          let element: HTMLElement | null = options.root;
          element;
          element = element.parentElement
        )
          ancestors.push({ element, top: element.scrollTop, left: element.scrollLeft });
        try {
          action();
        } finally {
          // Restore only synchronous focus scrolling. Following scroll/selection
          // events on iOS also undoes the user's own gestures and causes jumps.
          for (const { element, top, left } of ancestors) {
            if (element.scrollTop !== top) element.scrollTop = top;
            if (element.scrollLeft !== left) element.scrollLeft = left;
          }
        }
      };
      const rectFor = (block: NoteBlock) => {
        const dom = view.nodeDOM(block.from);
        return dom instanceof Element ? dom.getBoundingClientRect() : null;
      };
      const closeMenu = () => {
        menu.hidden = true;
        active = null;
        options.root.classList.remove('note-block-menu-open');
        options.root.style.removeProperty('--note-block-menu-space');
      };
      const cancelDrag = () => {
        const current = drag;
        drag = null;
        window.clearTimeout(holdTimer);
        holdTimer = 0;
        cancelAnimationFrame(scrollFrame);
        scrollFrame = 0;
        preview?.remove();
        preview = null;
        source?.classList.remove('note-block-drag-source');
        source = null;
        options.root.classList.remove('note-block-gesture');
        indicator.hidden = true;
        if (current?.capture.hasPointerCapture?.(current.pointer))
          current.capture.releasePointerCapture(current.pointer);
      };
      const positionPreview = () => {
        if (!drag || !preview) return;
        preview.style.left = `${drag.x - drag.offsetX}px`;
        preview.style.top = `${drag.y - drag.offsetY}px`;
      };
      const startDrag = () => {
        if (!drag) return;
        drag.started = true;
        const dom = view.nodeDOM(drag.from);
        if (dom instanceof HTMLElement) {
          const rect = dom.getBoundingClientRect();
          drag.offsetX = drag.originX - rect.left;
          drag.offsetY = drag.originY - rect.top;
          const clone = dom.cloneNode(true) as HTMLElement;
          // Freeze the rendered appearance without relying on editor ancestry.
          const originals = [dom, ...dom.querySelectorAll('*')];
          const copies = [clone, ...clone.querySelectorAll('*')];
          originals.forEach((original, index) => {
            const copy = copies[index];
            copy.removeAttribute('id');
            copy.removeAttribute('contenteditable');
            copy.removeAttribute('autofocus');
            copy.setAttribute('draggable', 'false');
            if (copy instanceof HTMLElement || copy instanceof SVGElement) {
              const style = getComputedStyle(original);
              for (const property of Array.from(style))
                copy.style.setProperty(property, style.getPropertyValue(property));
            }
          });
          clone.style.margin = '0';
          clone.style.width = '100%';
          preview = document.createElement('div');
          preview.className = 'note-block-drag-preview';
          preview.setAttribute('aria-hidden', 'true');
          preview.setAttribute('inert', '');
          preview.setAttribute('contenteditable', 'false');
          preview.style.width = `${rect.width}px`;
          preview.append(clone);
          options.root.append(preview);
          source = dom;
          source.classList.add('note-block-drag-source');
          positionPreview();
        }
        scrollFrame = requestAnimationFrame(tick);
      };
      const move = (from: number, boundary: number) => {
        const tr = moveNoteBlock(view.state, from, boundary);
        if (!tr) return;
        closeMenu();
        view.dispatch(tr);
        status.textContent = '';
        queueMicrotask(() => {
          status.textContent = options.labels.moved;
        });
      };
      const positionMenu = (reveal = false) => {
        if (menu.hidden || active === null) return;
        const block = noteBlocks(view.state.doc).find((block) => block.from === active);
        let rect = block && rectFor(block);
        if (!rect) return closeMenu();
        const viewport = window.visualViewport;
        const top = viewport?.offsetTop ?? 0;
        const left = viewport?.offsetLeft ?? 0;
        const width = viewport?.width ?? window.innerWidth;
        const height = viewport?.height ?? window.innerHeight;
        const scrollRect = scroller?.getBoundingClientRect();
        const visibleTop = Math.max(top, scrollRect?.height ? scrollRect.top : top) + 8;
        const visibleBottom =
          Math.min(top + height, scrollRect?.height ? scrollRect.bottom : top + height) - 8;
        const gap = 16;
        // Reserve room for the selected block as well as the scrollable menu.
        menu.style.maxHeight = `${Math.max(44, Math.min(240, visibleBottom - visibleTop - gap - Math.min(rect.height, 120)))}px`;
        options.root.style.setProperty(
          '--note-block-menu-space',
          `${menu.offsetHeight + gap + 8}px`
        );
        if (reveal && scroller) {
          const overflow = rect.bottom + gap + menu.offsetHeight - visibleBottom;
          if (overflow > 0) {
            scroller.scrollTop += overflow;
            rect = rectFor(block!) ?? rect;
          }
        }
        menu.style.left = `${Math.max(left + 8, Math.min(rect.left, left + width - menu.offsetWidth - 8))}px`;
        // Never clamp upward onto the block: its lower edge is the menu anchor.
        menu.style.top = `${Math.max(visibleTop, rect.bottom + gap)}px`;
      };
      const revealMenu = () => positionMenu(true);
      const layout = () => {
        frame = 0;
        if (drag?.started) updateDrop(drag.y);
        positionMenu();
      };
      const scheduleLayout = () => {
        if (!frame) frame = requestAnimationFrame(layout);
      };
      const selectForFormat = (block: NoteBlock, action: NoteFormattingAction) => {
        view.dispatch(view.state.tr.setSelection(blockTextSelection(view.state, block)));
        if (action === 'paragraph' || action.startsWith('heading-')) {
          if (block.node.type.name.endsWith('_list')) {
            liftListItem(view.state.schema.nodes.list_item)(view.state, view.dispatch);
          } else if (block.node.type.name === 'blockquote') {
            const tr = view.state.tr.replaceWith(block.from, block.to, block.node.content);
            tr.setSelection(
              TextSelection.between(
                tr.doc.resolve(block.from + 1),
                tr.doc.resolve(block.from + block.node.content.size - 1)
              )
            );
            view.dispatch(tr);
          }
        } else if (
          ['bullet', 'numbered', 'todo'].includes(action) &&
          block.node.type.name.endsWith('_list')
        ) {
          const type =
            action === 'numbered'
              ? view.state.schema.nodes.ordered_list
              : view.state.schema.nodes.bullet_list;
          let tr = view.state.tr.setNodeMarkup(block.from, type);
          block.node.forEach((item, offset) => {
            tr = tr.setNodeMarkup(block.from + 1 + offset, undefined, {
              ...item.attrs,
              checked: action === 'todo' ? false : null,
            });
          });
          view.dispatch(tr);
        }
        view.focus();
        options.format(action);
      };
      const openMenu = (block: NoteBlock, keyboard = false) => {
        closeMenu();
        active = block.from;
        preserveScroll(() => {
          view.dispatch(
            view.state.tr.setSelection(NodeSelection.create(view.state.doc, block.from))
          );
        });
        menu.replaceChildren();
        const add = (label: string, icon: NoteEditorIcon, run: () => void, disabled = false) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.setAttribute('role', 'menuitem');
          button.disabled = disabled;
          const visual = document.createElement('span');
          visual.className = 'note-slash-icon';
          visual.append(createSlashIcon(icon));
          button.append(visual, document.createTextNode(label));
          // Pointer menus keep the editor focused and the mobile keyboard open.
          // Keyboard activation still focuses the menu for accessible navigation.
          button.addEventListener('pointerdown', (event) => event.preventDefault());
          button.addEventListener('mousedown', (event) => event.preventDefault());
          button.addEventListener('click', () => {
            closeMenu();
            run();
          });
          menu.append(button);
        };
        add(options.labels.selectBlock, 'square-dashed-text', () => {
          preserveScroll(() => {
            view.dispatch(
              view.state.tr.setSelection(NodeSelection.create(view.state.doc, block.from))
            );
            view.focus();
          });
        });
        add(options.labels.selectAll, 'square-dashed', () => {
          preserveScroll(() => {
            view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
            view.focus();
          });
        });
        const blocks = noteBlocks(view.state.doc);
        add(
          options.labels.moveUp,
          'arrow-up',
          () => move(block.from, blocks[block.index - 1].from),
          block.index === 0
        );
        add(
          options.labels.moveDown,
          'arrow-down',
          () => move(block.from, blocks[block.index + 1].to),
          block.index === blocks.length - 1
        );
        add(options.labels.deleteBlock, 'trash-2', () => {
          const tr = deleteNoteBlock(view.state, block.from);
          if (!tr) return;
          view.dispatch(tr);
          view.focus();
          status.textContent = '';
          queueMicrotask(() => {
            status.textContent = options.labels.deleted;
          });
        });
        if (canFormatBlock(block)) {
          const divider = document.createElement('div');
          divider.className = 'note-block-menu-divider';
          divider.setAttribute('role', 'separator');
          menu.append(divider);
          options.commands
            .filter(({ action }) => action !== 'image' && action !== 'lyrics')
            .forEach((command) => {
              add(command.label, command.icon, () =>
                selectForFormat(block, command.action as NoteFormattingAction)
              );
            });
        }
        menu.hidden = false;
        options.root.classList.add('note-block-menu-open');
        if (keyboard) {
          preserveScroll(() => {
            menu.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
          });
        }
        positionMenu(true);
      };
      const updateDrop = (y: number) => {
        if (!drag?.started) return;
        const blocks = noteBlocks(view.state.doc);
        let boundary = view.state.doc.content.size;
        let line = 0;
        for (const block of blocks) {
          const rect = rectFor(block);
          if (!rect) continue;
          line = rect.bottom;
          if (y < rect.top + rect.height / 2) {
            boundary = block.from;
            line = rect.top;
            break;
          }
        }
        drag.boundary = boundary;
        const rootRect = options.root.getBoundingClientRect();
        indicator.hidden =
          boundary === drag.from ||
          boundary === blocks.find((block) => block.from === drag?.from)?.to;
        indicator.style.top = `${line - rootRect.top}px`;
      };
      const autoScroll = () => {
        if (!drag?.started || !scroller) return;
        const rect = scroller.getBoundingClientRect();
        const viewport = window.visualViewport;
        const top = Math.max(rect.top, viewport?.offsetTop ?? 0);
        const bottom = Math.min(
          rect.bottom,
          (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)
        );
        const delta = drag.y < top + 64 ? -12 : drag.y > bottom - 64 ? 12 : 0;
        if (delta) {
          scroller.scrollTop += delta;
          updateDrop(drag.y);
        }
      };
      const tick = () => {
        autoScroll();
        if (drag?.started) scrollFrame = requestAnimationFrame(tick);
      };
      const blockAt = (target: EventTarget | null) => {
        if (!(target instanceof Node)) return undefined;
        return noteBlocks(view.state.doc).find((block) =>
          view.nodeDOM(block.from)?.contains(target)
        );
      };
      const activate = () => {
        if (!drag) return;
        holdTimer = 0;
        drag.activated = true;
        suppressClick = true;
        options.root.classList.add('note-block-gesture');
        preserveScroll(() => {
          view.dispatch(
            view.state.tr.setSelection(NodeSelection.create(view.state.doc, drag!.from))
          );
        });
        try {
          drag.capture.setPointerCapture?.(drag.pointer);
        } catch {
          // Document and touch listeners still finish the gesture without capture.
        }
      };
      const pointerDown = (event: PointerEvent) => {
        if (!event.isPrimary) {
          cancelDrag();
          return;
        }
        cancelDrag();
        suppressClick = false;
        if (menu.contains(event.target as Node)) return;
        closeMenu();
        if (event.button !== 0 || !view.dom.contains(event.target as Node)) return;
        if (
          event.target instanceof Element &&
          event.target.closest('button, input, textarea, select')
        )
          return;
        const block = blockAt(event.target);
        if (!block) return;
        // Let the second tap reach WebKit's native word selection unchanged.
        if (
          lastTap &&
          lastTap.from === block.from &&
          Date.now() - lastTap.time < 300 &&
          Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 24
        ) {
          lastTap = null;
          return;
        }
        drag = {
          from: block.from,
          pointer: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          originX: event.clientX,
          originY: event.clientY,
          offsetX: 0,
          offsetY: 0,
          activated: false,
          started: false,
          boundary: block.from,
          capture: view.dom,
        };
        holdTimer = window.setTimeout(activate, 350);
      };
      const pointerMove = (event: PointerEvent) => {
        if (!drag || drag.pointer !== event.pointerId) return;
        const distance = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY);
        if (!drag.activated) {
          if (distance > 6) cancelDrag();
          return;
        }
        event.preventDefault();
        drag.x = event.clientX;
        drag.y = event.clientY;
        if (!drag.started && distance > 6) startDrag();
        positionPreview();
        updateDrop(event.clientY);
      };
      const finishGesture = (y: number) => {
        if (!drag) return;
        const current = drag;
        if (current.started) updateDrop(y);
        if (!current.activated)
          lastTap = { from: current.from, time: Date.now(), x: current.x, y: current.y };
        cancelDrag();
        if (current.started) move(current.from, current.boundary);
        else if (current.activated) {
          const block = noteBlocks(view.state.doc).find((block) => block.from === current.from);
          if (block) openMenu(block);
        }
      };
      const pointerUp = (event: PointerEvent) => {
        if (!drag || drag.pointer !== event.pointerId) return;
        if (drag.activated) event.preventDefault();
        finishGesture(event.clientY);
      };
      const pointerCancel = (event: PointerEvent) => {
        if (drag?.pointer === event.pointerId) cancelDrag();
      };
      const lostCapture = (event: PointerEvent) => {
        // Touch initially has implicit capture on the pressed child. Transferring
        // it to the editor emits a bubbling loss on that child, not a cancellation.
        if (drag && event.target === drag.capture) pointerCancel(event);
      };
      const preventNativeGesture = (event: Event) => {
        if (drag?.activated) event.preventDefault();
      };
      const touchMove = (event: TouchEvent) => {
        if (!drag) return;
        if (event.touches.length !== 1) return cancelDrag();
        const touch = event.touches[0];
        const distance = Math.hypot(touch.clientX - drag.originX, touch.clientY - drag.originY);
        if (!drag.activated) {
          if (distance > 6) cancelDrag();
          return;
        }
        // touch-action is decided before the hold activates. Cancel only the
        // active drag's touchmove so early swipes can still scroll on iOS.
        event.preventDefault();
        drag.x = touch.clientX;
        drag.y = touch.clientY;
        if (!drag.started && distance > 6) startDrag();
        positionPreview();
        updateDrop(touch.clientY);
      };
      const touchEnd = (event: TouchEvent) => {
        if (drag && event.touches.length === 0) {
          if (drag.activated) event.preventDefault();
          finishGesture(event.changedTouches[0]?.clientY ?? drag.y);
        }
      };
      const touchStart = (event: TouchEvent) => {
        if (event.touches.length > 1) cancelDrag();
      };
      const click = (event: MouseEvent) => {
        if (!suppressClick || !view.dom.contains(event.target as Node)) return;
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
      };
      const scrolled = () => {
        if (drag && !drag.activated) cancelDrag();
        scheduleLayout();
      };
      const outside = (event: Event) => {
        if (
          event.target instanceof Node &&
          !menu.contains(event.target) &&
          !view.dom.contains(event.target)
        )
          closeMenu();
      };
      const escape = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && (!menu.hidden || drag)) {
          event.preventDefault();
          closeMenu();
          cancelDrag();
          view.focus();
          return;
        }
        if (
          event.target !== view.dom &&
          !(event.target instanceof Node && view.dom.contains(event.target))
        )
          return;
        const selection = view.state.selection;
        const from =
          selection instanceof NodeSelection
            ? selection.from
            : selection.$head.depth > 0
              ? selection.$head.before(1)
              : null;
        const block = noteBlocks(view.state.doc).find((block) => block.from === from);
        if (!block) return;
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          openMenu(block, true);
        } else if (
          selection instanceof NodeSelection &&
          event.altKey &&
          ['ArrowUp', 'ArrowDown'].includes(event.key)
        ) {
          event.preventDefault();
          const target = noteBlocks(view.state.doc)[
            block.index + (event.key === 'ArrowUp' ? -1 : 1)
          ];
          if (target) move(block.from, event.key === 'ArrowUp' ? target.from : target.to);
        }
      };
      const menuKeys = (event: KeyboardEvent) => {
        const buttons = Array.from(
          menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        );
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      };
      menu.addEventListener('keydown', menuKeys);
      document.addEventListener('focusin', outside);
      document.addEventListener('keydown', escape);
      document.addEventListener('pointerdown', pointerDown, true);
      document.addEventListener('pointermove', pointerMove, { capture: true, passive: false });
      document.addEventListener('pointerup', pointerUp, true);
      document.addEventListener('pointercancel', pointerCancel, true);
      document.addEventListener('selectstart', preventNativeGesture, true);
      document.addEventListener('dragstart', preventNativeGesture, true);
      document.addEventListener('touchmove', touchMove, { capture: true, passive: false });
      document.addEventListener('touchstart', touchStart, true);
      document.addEventListener('click', click, true);
      view.dom.addEventListener('contextmenu', preventNativeGesture);
      view.dom.addEventListener('lostpointercapture', lostCapture);
      document.addEventListener('touchend', touchEnd, { capture: true, passive: false });
      document.addEventListener('touchcancel', cancelDrag, true);
      window.addEventListener('blur', cancelDrag);
      window.addEventListener('scroll', scrolled, true);
      window.addEventListener('resize', revealMenu);
      window.visualViewport?.addEventListener('resize', revealMenu);
      window.visualViewport?.addEventListener('scroll', scheduleLayout);
      const observer = new ResizeObserver(scheduleLayout);
      observer.observe(view.dom);
      options.root.addEventListener('load', scheduleLayout, true);
      document.fonts?.addEventListener('loadingdone', scheduleLayout);

      return {
        update(editor: EditorView, previous) {
          if (!editor.state.doc.eq(previous.doc)) {
            closeMenu();
            cancelDrag();
          }
          scheduleLayout();
        },
        destroy() {
          closeMenu();
          cancelDrag();
          cancelAnimationFrame(frame);
          cancelAnimationFrame(scrollFrame);
          observer.disconnect();
          document.removeEventListener('focusin', outside);
          document.removeEventListener('keydown', escape);
          document.removeEventListener('pointerdown', pointerDown, true);
          document.removeEventListener('pointermove', pointerMove, true);
          document.removeEventListener('pointerup', pointerUp, true);
          document.removeEventListener('pointercancel', pointerCancel, true);
          document.removeEventListener('selectstart', preventNativeGesture, true);
          document.removeEventListener('dragstart', preventNativeGesture, true);
          document.removeEventListener('touchmove', touchMove, true);
          document.removeEventListener('touchstart', touchStart, true);
          document.removeEventListener('click', click, true);
          view.dom.removeEventListener('contextmenu', preventNativeGesture);
          view.dom.removeEventListener('lostpointercapture', lostCapture);
          document.removeEventListener('touchend', touchEnd, true);
          document.removeEventListener('touchcancel', cancelDrag, true);
          window.removeEventListener('blur', cancelDrag);
          window.removeEventListener('scroll', scrolled, true);
          window.removeEventListener('resize', revealMenu);
          window.visualViewport?.removeEventListener('resize', revealMenu);
          window.visualViewport?.removeEventListener('scroll', scheduleLayout);
          options.root.removeEventListener('load', scheduleLayout, true);
          document.fonts?.removeEventListener('loadingdone', scheduleLayout);
          menu.remove();
          indicator.remove();
          status.remove();
        },
      };
    },
  });
}
