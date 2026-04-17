import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { Paperclip, Send } from "lucide-react";
import { AttachmentChips, type PendingAttachment } from "./AttachmentChips";
import type { ChatAttachment } from "../../../hooks/useChatStream";
import { api } from "../../../services/api";

interface ChatInputProps {
  workspaceId: string;
  campaignId: string;
  onSend: (content: string, attachments: ChatAttachment[]) => void;
  disabled?: boolean;
}

const ACCEPTED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

export function ChatInput({ workspaceId, campaignId, onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const [isDragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const anyUploading = items.some((i) => i.uploading);
  const canSend = !disabled && !anyUploading && (value.trim().length > 0 || items.some((i) => i.result));

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    for (const file of arr) {
      if (!ACCEPTED.includes(file.type)) continue;
      if (file.size > MAX_BYTES) continue;
      const id = crypto.randomUUID();
      setItems((prev) => [...prev, { id, file, uploading: true }]);
      uploadOne(id, file);
    }
  };

  const uploadOne = async (id: string, file: File) => {
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await api<ChatAttachment>(
        `/api/workspaces/${workspaceId}/campaigns/${campaignId}/chat/upload`,
        { method: "POST", body: form },
      );
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, uploading: false, result: data } : i)),
      );
    } catch (e) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, uploading: false, error: e instanceof Error ? e.message : "Upload failed" } : i,
        ),
      );
    }
  };

  const submit = () => {
    if (!canSend) return;
    const attachments = items.filter((i) => i.result).map((i) => i.result!);
    onSend(value.trim(), attachments);
    setValue("");
    setItems([]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  const onDragEnter = (e: DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragOver = (e: DragEvent) => { e.preventDefault(); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`border-t border-gray-200 bg-white relative ${isDragOver ? "bg-indigo-50" : ""}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragOver && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-indigo-700 font-medium pointer-events-none bg-indigo-50/90 border-2 border-dashed border-indigo-400 rounded">
          Drop PDF or image to attach
        </div>
      )}
      <AttachmentChips items={items} onRemove={(id) => setItems((prev) => prev.filter((i) => i.id !== id))} />
      <div className="flex gap-2 items-end p-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="shrink-0 p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded disabled:opacity-50"
          title="Attach file"
        >
          <Paperclip size={16} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          multiple
          className="hidden"
          onChange={onFileInput}
        />
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message… (Enter to send, Shift+Enter for new line)"
          rows={2}
          disabled={disabled}
          className="flex-1 resize-none px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={14} />
          Send
        </button>
      </div>
    </div>
  );
}
