import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

import { Badge, Button } from '@open-zentra/foundation-design-system';
import { Icon } from '@open-zentra/foundation-icons';

import { parseComposerCommands } from './composer-commands';

interface ChatComposerProps {
  readonly onSend: (message: string) => void;
  readonly disabled: boolean;
  /** Prefilled from a suggestion card. */
  readonly draft: string;
  readonly onDraftChange: (draft: string) => void;
}

const plainTextExtensions = [
  StarterKit.configure({
    blockquote: false,
    bold: false,
    bulletList: false,
    code: false,
    codeBlock: false,
    dropcursor: false,
    gapcursor: false,
    heading: false,
    horizontalRule: false,
    italic: false,
    link: false,
    listItem: false,
    listKeymap: false,
    orderedList: false,
    strike: false,
  }),
];

const isJsdom = typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom');

/**
 * A deliberately plain-text Tiptap editor. Tiptap provides the native caret,
 * selection and IME support; the Chat Session API continues to receive text.
 */
export const ChatComposer = ({ onSend, disabled, draft, onDraftChange }: ChatComposerProps) => {
  const [focused, setFocused] = useState(false);
  const disabledRef = useRef(disabled);
  const onSendRef = useRef(onSend);
  const parsed = useMemo(() => parseComposerCommands(draft), [draft]);
  const hasCommands = Boolean(parsed.datasetHint || parsed.mentions.length > 0 || parsed.skillHint);
  disabledRef.current = disabled;
  onSendRef.current = onSend;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!parsed.text || disabled) return;
    onSend(parsed.text);
  };

  const editor = useEditor({
    extensions: plainTextExtensions,
    content: draft,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        'aria-label': 'Message',
        'aria-multiline': 'true',
        class: 'min-h-6 max-h-48 overflow-y-auto outline-none',
        role: 'textbox',
      },
      handleKeyDown: (_view, event) => {
        if (event.key !== 'Enter' || event.shiftKey) return false;
        event.preventDefault();
        const text = isJsdom
          ? (_view.dom.textContent ?? '')
          : _view.state.doc.textBetween(0, _view.state.doc.content.size, '\n');
        const message = parseComposerCommands(text).text;
        if (message && !disabledRef.current) onSendRef.current(message);
        return true;
      },
      // ProseMirror's selection-scroll routine requires browser layout APIs
      // that jsdom intentionally does not implement. Browsers retain normal
      // selection scrolling; tests use inert geometry only.
      handleScrollToSelection: () => isJsdom,
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onUpdate: ({ editor: nextEditor }) => onDraftChange(nextEditor.getText({ blockSeparator: '\n' })),
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || editor.getText({ blockSeparator: '\n' }) === draft) return;
    editor.commands.setContent(draft, { emitUpdate: false });
  }, [draft, editor]);

  return (
    <form
      className="w-full border-t border-border bg-background px-4 pb-4 pt-3 sm:px-6"
      onSubmit={submit}
      aria-label="Send a message"
    >
      <div
        className={`mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border bg-card p-3 transition-[border-color,box-shadow,transform] duration-200 ease-out motion-reduce:transition-none ${
          focused ? 'border-primary/70 shadow-[var(--focus-ring)]' : 'border-border shadow-[var(--shadow-depth-01)]'
        }`}
      >
        {hasCommands ? (
          <div className="flex flex-wrap items-center gap-2" aria-live="polite">
            {parsed.datasetHint ? (
              <Badge intent="info" size="sm">
                #{parsed.datasetHint}
              </Badge>
            ) : null}
            {parsed.mentions.map((mention) => (
              <Badge
                key={mention}
                intent="secondary"
                size="sm"
                title="Mentions have no effect yet -- there is no notification system to send them to."
              >
                @{mention}
              </Badge>
            ))}
            {parsed.skillHint ? (
              <Badge
                intent="secondary"
                size="sm"
                title="This names a capability directly, but Intake still validates it against your Analytical Scope -- it's a hint, not a bypass."
              >
                /{parsed.skillHint}
              </Badge>
            ) : null}
          </div>
        ) : null}

        <div className="relative text-sm text-foreground">
          {!draft ? (
            <span className="pointer-events-none absolute left-0 top-0 text-foreground-muted">
              {disabled ? 'Working on your question…' : 'Ask anything about your data…'}
            </span>
          ) : null}
          <EditorContent editor={editor} />
        </div>

        <div className="flex items-center gap-1">
          <Button
            className="ml-auto transition-transform duration-150 ease-out active:scale-95 motion-reduce:transition-none"
            type="submit"
            size="sm"
            disabled={disabled || parsed.text.length === 0}
            end={<Icon name="send" size="sm" />}
          >
            Send
          </Button>
        </div>
      </div>
    </form>
  );
};
