"use client";

import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useMemo, useState } from "react";

type LoadedFile = { id: string; title: string; content: string; source: string };
type SaveStatus = "loading" | "clean" | "dirty" | "saving" | "saved" | "error";
type SlashItem = { label: string; hint: string; run: (editor: Editor) => void };

const slashItems: SlashItem[] = [
  { label: "Text", hint: "Plain text", run: (editor) => editor.chain().focus().setParagraph().run() },
  { label: "Heading 1", hint: "Large section heading", run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: "Heading 2", hint: "Medium section heading", run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: "Heading 3", hint: "Small section heading", run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: "Bulleted list", hint: "Create a simple list", run: (editor) => editor.chain().focus().toggleBulletList().run() },
  { label: "Numbered list", hint: "Create an ordered list", run: (editor) => editor.chain().focus().toggleOrderedList().run() },
  { label: "Quote", hint: "Capture a quotation", run: (editor) => editor.chain().focus().toggleBlockquote().run() },
  { label: "Code block", hint: "Write formatted code", run: (editor) => editor.chain().focus().toggleCodeBlock().run() },
  { label: "Divider", hint: "Separate sections", run: (editor) => editor.chain().focus().setHorizontalRule().run() },
  { label: "Table", hint: "Insert a 3 × 3 table", run: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
];

function splitFrontmatter(markdown: string) {
  const match = markdown.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/);
  return { frontmatter: match?.[1] ?? "", body: match ? markdown.slice(match[1].length) : markdown };
}

export function MarkdownPageEditor({ fileId, onClose }: { fileId: string; onClose: () => void }) {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [frontmatter, setFrontmatter] = useState("");
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TableKit,
      Markdown.configure({ markedOptions: { gfm: true } }),
      Placeholder.configure({ placeholder: "Type ‘/’ for commands" }),
    ],
    content: "",
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: { attributes: { class: "notion-prosemirror" } },
    onUpdate: ({ editor: currentEditor }) => {
      setStatus("dirty");
      const { $from } = currentEditor.state.selection;
      const text = $from.parent.isTextblock ? $from.parent.textBetween(0, $from.parentOffset, " ") : "";
      const match = text.match(/^\/(.*)$/);
      setSlashQuery(match ? match[1] : null);
      setSlashIndex(0);
    },
  });

  useEffect(() => {
    let cancelled = false;
    setFile(null);
    setStatus("loading");
    fetch(`/api/memory-file?id=${encodeURIComponent(fileId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not open this memory file.");
        return response.json() as Promise<LoadedFile>;
      })
      .then((loaded) => {
        if (cancelled) return;
        const parsed = splitFrontmatter(loaded.content);
        setFile(loaded);
        setFrontmatter(parsed.frontmatter);
        editor?.commands.setContent(parsed.body, { contentType: "markdown", emitUpdate: false });
        setStatus("clean");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [editor, fileId]);

  const save = useCallback(async () => {
    if (!file || !editor || status === "saving") return;
    setStatus("saving");
    try {
      const body = editor.getMarkdown();
      const response = await fetch("/api/memory-file", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: file.id, content: `${frontmatter}${body}` }),
      });
      setStatus(response.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }, [editor, file, frontmatter, status]);

  const filteredSlashItems = useMemo(() => {
    const query = slashQuery?.trim().toLowerCase() ?? "";
    return slashItems.filter((item) => item.label.toLowerCase().includes(query));
  }, [slashQuery]);

  function runSlashItem(item: SlashItem) {
    if (!editor) return;
    const { $from } = editor.state.selection;
    editor.chain().focus().deleteRange({ from: $from.start(), to: $from.pos }).run();
    item.run(editor);
    setSlashQuery(null);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save();
      return;
    }
    if (slashQuery === null || filteredSlashItems.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSlashIndex((index) => (index + 1) % filteredSlashItems.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSlashIndex((index) => (index - 1 + filteredSlashItems.length) % filteredSlashItems.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      runSlashItem(filteredSlashItems[slashIndex] ?? filteredSlashItems[0]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setSlashQuery(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#191919] text-[#e7e7e5]" role="dialog" aria-modal="true" aria-label="Markdown memory editor" onKeyDown={handleKeyDown}>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-white/8 bg-[#191919]/95 px-4 backdrop-blur sm:px-7">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] uppercase tracking-[0.16em] text-white/35">{file?.source ?? "loading memory"}</p>
          <p className="truncate text-sm font-medium text-white/80">{file?.title ?? "Opening…"}</p>
        </div>
        <span className="hidden text-[11px] text-white/35 sm:inline">{statusLabel(status)}</span>
        <button type="button" onClick={() => void save()} disabled={!file || !editor || status === "saving" || status === "loading"} className="rounded-md bg-[#388f70] px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-[#42a07e] disabled:opacity-40">{status === "saving" ? "Saving…" : "Save"}</button>
        <button type="button" onClick={onClose} aria-label="Close editor" className="grid h-8 w-8 place-items-center rounded-md text-xl text-white/40 transition hover:bg-white/8 hover:text-white">×</button>
      </header>

      <div className="sticky top-14 z-10 border-b border-white/7 bg-[#191919]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[900px] flex-wrap items-center gap-0.5 px-5 py-2 sm:px-12">
          <ToolbarButton label="H1" active={editor?.isActive("heading", { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} />
          <ToolbarButton label="H2" active={editor?.isActive("heading", { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} />
          <ToolbarButton label="B" active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()} className="font-bold" />
          <ToolbarButton label="I" active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()} className="italic" />
          <ToolbarButton label="• List" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
          <ToolbarButton label="1. List" active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
          <ToolbarButton label="Quote" active={editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()} />
          <ToolbarButton label="Code" active={editor?.isActive("codeBlock")} onClick={() => editor?.chain().focus().toggleCodeBlock().run()} />
          <ToolbarButton label="Table" active={editor?.isActive("table")} onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
          {editor?.isActive("table") && <>
            <span className="mx-1 h-4 w-px bg-white/10" />
            <ToolbarButton label="+ Row" onClick={() => editor.chain().focus().addRowAfter().run()} />
            <ToolbarButton label="+ Column" onClick={() => editor.chain().focus().addColumnAfter().run()} />
            <ToolbarButton label="Delete table" onClick={() => editor.chain().focus().deleteTable().run()} />
          </>}
          <span className="ml-auto hidden text-[10px] text-white/25 md:inline">⌘S save · / commands</span>
        </div>
      </div>

      <main className="mx-auto min-h-[calc(100vh-7.5rem)] w-full max-w-[900px] px-6 pb-36 pt-16 sm:px-14 md:px-20">
        {status === "error" && !file ? <p className="rounded-lg bg-red-500/10 p-4 text-sm text-red-200">This memory file could not be opened.</p> : <div className="relative">
          <EditorContent editor={editor} className="notion-editor" />
          {slashQuery !== null && filteredSlashItems.length > 0 && (
            <div className="absolute left-0 top-12 z-30 max-h-80 w-72 overflow-y-auto rounded-lg border border-white/10 bg-[#252525] p-1.5 shadow-2xl" role="listbox" aria-label="Block commands">
              <p className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-white/30">Basic blocks</p>
              {filteredSlashItems.map((item, index) => <button key={item.label} type="button" role="option" aria-selected={index === slashIndex} onMouseDown={(event) => event.preventDefault()} onClick={() => runSlashItem(item)} className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left ${index === slashIndex ? "bg-white/9" : "hover:bg-white/6"}`}>
                <span className="text-sm text-white/85">{item.label}</span><span className="text-[10px] text-white/30">{item.hint}</span>
              </button>)}
            </div>
          )}
        </div>}
      </main>
    </div>
  );
}

function ToolbarButton({ label, active, onClick, className = "" }: { label: string; active?: boolean; onClick: () => void; className?: string }) {
  return <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onClick} className={`rounded-md px-2.5 py-1.5 text-xs transition ${active ? "bg-white/12 text-white" : "text-white/50 hover:bg-white/7 hover:text-white/90"} ${className}`}>{label}</button>;
}

function statusLabel(status: SaveStatus) {
  if (status === "dirty") return "Unsaved changes";
  if (status === "saving") return "Saving…";
  if (status === "saved") return "Saved";
  if (status === "error") return "Save failed";
  return "⌘S to save";
}
