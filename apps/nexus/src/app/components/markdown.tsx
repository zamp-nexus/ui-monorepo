import { useEffect, useRef } from 'react';

import { Markdown as MarkdownExtension } from '@tiptap/markdown';
import { TableKit } from '@tiptap/extension-table';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

const escapeRawHtml = (markdown: string) => markdown.replace(/</g, '&lt;').replace(/>/g, '&gt;');

const extensions = [
  StarterKit,
  TableKit,
  TaskList,
  TaskItem.configure({ nested: true }),
  MarkdownExtension.configure({ markedOptions: { gfm: true } }),
];

/**
 * Read-only Markdown rendered by Tiptap.
 *
 * Assistant output is always parsed as Markdown rather than injected HTML.
 * Escaping angle brackets before parsing keeps embedded model-authored HTML
 * literal, even though the Markdown extension can otherwise recognize it.
 */
export const Markdown = ({ children }: { readonly children: string }) => {
  const content = escapeRawHtml(children);
  const renderedContent = useRef(content);
  const editor = useEditor({
    extensions,
    content,
    contentType: 'markdown',
    editable: false,
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor || renderedContent.current === content) return;
    renderedContent.current = content;
    editor.commands.setContent(content, { contentType: 'markdown', emitUpdate: false });
  }, [content, editor]);

  if (!editor) return null;

  return (
    <EditorContent
      editor={editor}
      className="text-sm leading-relaxed text-foreground [&_.tiptap]:outline-none [&_.tiptap>*>:first-child]:mt-0 [&_.tiptap_a]:text-primary [&_.tiptap_a]:underline [&_.tiptap_a]:underline-offset-2 [&_.tiptap_blockquote]:mb-3 [&_.tiptap_blockquote]:border-l-2 [&_.tiptap_blockquote]:border-primary [&_.tiptap_blockquote]:pl-4 [&_.tiptap_blockquote]:text-foreground-muted [&_.tiptap_code]:rounded-sm [&_.tiptap_code]:bg-background-muted [&_.tiptap_code]:px-1.5 [&_.tiptap_code]:py-0.5 [&_.tiptap_code]:font-mono [&_.tiptap_code]:text-[12px] [&_.tiptap_h1]:mb-3 [&_.tiptap_h1]:mt-5 [&_.tiptap_h1]:font-serif [&_.tiptap_h1]:text-2xl [&_.tiptap_h1]:font-normal [&_.tiptap_h2]:mb-3 [&_.tiptap_h2]:mt-5 [&_.tiptap_h2]:font-serif [&_.tiptap_h2]:text-xl [&_.tiptap_h2]:font-normal [&_.tiptap_h3]:mb-2 [&_.tiptap_h3]:mt-5 [&_.tiptap_h3]:font-mono [&_.tiptap_h3]:text-[11px] [&_.tiptap_h3]:font-bold [&_.tiptap_h3]:uppercase [&_.tiptap_h3]:tracking-[0.16em] [&_.tiptap_h3]:text-primary [&_.tiptap_li]:mb-1 [&_.tiptap_ol]:mb-3 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-5 [&_.tiptap_p]:mb-3 [&_.tiptap_p:last-child]:mb-0 [&_.tiptap_pre]:mb-3 [&_.tiptap_pre]:overflow-x-auto [&_.tiptap_pre]:rounded-sm [&_.tiptap_pre]:border [&_.tiptap_pre]:border-border [&_.tiptap_pre]:bg-background-muted [&_.tiptap_pre]:p-3 [&_.tiptap_pre_code]:bg-transparent [&_.tiptap_pre_code]:p-0 [&_.tiptap_table]:mb-3 [&_.tiptap_table]:w-full [&_.tiptap_table]:border-collapse [&_.tiptap_table]:text-left [&_.tiptap_table]:text-[13px] [&_.tiptap_td]:border-b [&_.tiptap_td]:border-border-subtle [&_.tiptap_td]:px-3 [&_.tiptap_td]:py-2 [&_.tiptap_th]:border-b [&_.tiptap_th]:border-border [&_.tiptap_th]:px-3 [&_.tiptap_th]:py-2 [&_.tiptap_th]:font-mono [&_.tiptap_th]:text-[10px] [&_.tiptap_th]:font-semibold [&_.tiptap_th]:uppercase [&_.tiptap_th]:tracking-[0.14em] [&_.tiptap_th]:text-foreground-muted [&_.tiptap_ul]:mb-3 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-5 [&_.tiptap_ul]:marker:text-primary"
    />
  );
};
