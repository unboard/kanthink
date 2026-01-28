'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { useEffect } from 'react';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

function MenuBar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap gap-1 border-b border-neutral-200 dark:border-neutral-700 pb-2 mb-3">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`p-1.5 rounded text-sm ${
          editor.isActive('bold')
            ? 'bg-neutral-200 dark:bg-neutral-700'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
        }`}
        title="Bold (Ctrl+B)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
        </svg>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`p-1.5 rounded text-sm ${
          editor.isActive('italic')
            ? 'bg-neutral-200 dark:bg-neutral-700'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
        }`}
        title="Italic (Ctrl+I)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 4h4m-2 0v16m-4 0h8" transform="skewX(-10)" />
        </svg>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`p-1.5 rounded text-sm ${
          editor.isActive('strike')
            ? 'bg-neutral-200 dark:bg-neutral-700'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
        }`}
        title="Strikethrough"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 0a3 3 0 01-3-3V9a3 3 0 013-3h6a3 3 0 013 3v0M9 12a3 3 0 000 6h6a3 3 0 000-6" />
        </svg>
      </button>

      <div className="w-px bg-neutral-200 dark:bg-neutral-700 mx-1" />

      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={`px-2 py-1 rounded text-sm font-medium ${
          editor.isActive('heading', { level: 1 })
            ? 'bg-neutral-200 dark:bg-neutral-700'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
        }`}
        title="Heading 1"
      >
        H1
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`px-2 py-1 rounded text-sm font-medium ${
          editor.isActive('heading', { level: 2 })
            ? 'bg-neutral-200 dark:bg-neutral-700'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
        }`}
        title="Heading 2"
      >
        H2
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={`px-2 py-1 rounded text-sm font-medium ${
          editor.isActive('heading', { level: 3 })
            ? 'bg-neutral-200 dark:bg-neutral-700'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
        }`}
        title="Heading 3"
      >
        H3
      </button>

      <div className="w-px bg-neutral-200 dark:bg-neutral-700 mx-1" />

      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`p-1.5 rounded text-sm ${
          editor.isActive('bulletList')
            ? 'bg-neutral-200 dark:bg-neutral-700'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
        }`}
        title="Bullet List"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`p-1.5 rounded text-sm ${
          editor.isActive('orderedList')
            ? 'bg-neutral-200 dark:bg-neutral-700'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
        }`}
        title="Numbered List"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h10M7 16h10M3 8h.01M3 12h.01M3 16h.01" />
        </svg>
      </button>

      <div className="w-px bg-neutral-200 dark:bg-neutral-700 mx-1" />

      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`p-1.5 rounded text-sm ${
          editor.isActive('blockquote')
            ? 'bg-neutral-200 dark:bg-neutral-700'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
        }`}
        title="Quote"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16h6M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={`p-1.5 rounded text-sm ${
          editor.isActive('codeBlock')
            ? 'bg-neutral-200 dark:bg-neutral-700'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
        }`}
        title="Code Block"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      </button>
    </div>
  );
}

export function RichTextEditor({ content, onChange, placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        // Disable link from StarterKit to avoid duplicate with our custom Link config
        link: false,
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Start writing...',
      }),
      Link.configure({
        openOnClick: false,
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: 'prose prose-neutral dark:prose-invert prose-sm max-w-none focus:outline-none min-h-[200px]',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Update content when it changes externally
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3">
      <MenuBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
