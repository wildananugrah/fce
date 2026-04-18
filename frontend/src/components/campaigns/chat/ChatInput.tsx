import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { Paperclip, Send, Square } from "lucide-react";
import { AttachmentChips, type PendingAttachment } from "./AttachmentChips";
import { SkillMentionMenu } from "./SkillMentionMenu";
import { useAvailableSkills, type SkillSummary } from "../../../hooks/useAvailableSkills";
import type { ChatAttachment } from "../../../hooks/useChatStream";
import { api } from "../../../services/api";

interface ChatInputProps {
  workspaceId: string;
  campaignId: string;
  onSend: (content: string, attachments: ChatAttachment[], skillIds: string[]) => void;
  onStop?: () => void;
  isStreaming?: boolean;
}

const ACCEPTED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_MENTION_SUGGESTIONS = 8;

// Turn a skill name into the token we insert in the textarea. We keep it
// human-readable (spaces preserved) but strip any whitespace that would break
// our boundary detection. Example: "Brand Strategist" → "@Brand_Strategist".
function nameToToken(name: string): string {
  return `@${name.replace(/\s+/g, "_")}`;
}

export function ChatInput({ workspaceId, campaignId, onSend, onStop, isStreaming }: ChatInputProps) {
  const disabled = isStreaming;
  const [value, setValue] = useState("");
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const [isDragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Map of nameToken → skillId for everything the user has @-mentioned in this
  // draft. We don't filter it down on every keystroke; we recompute the active
  // list at submit time by scanning the final text.
  const mentionsRef = useRef<Map<string, string>>(new Map());

  const { skills } = useAvailableSkills();

  // Mention-picker state
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);

  const anyUploading = items.some((i) => i.uploading);
  const canSend = !disabled && !anyUploading && (value.trim().length > 0 || items.some((i) => i.result));

  const filteredSkills = useMemo(() => {
    if (!query) return skills.slice(0, MAX_MENTION_SUGGESTIONS);
    const q = query.toLowerCase();
    return skills
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.slug.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q),
      )
      .slice(0, MAX_MENTION_SUGGESTIONS);
  }, [query, skills]);

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

  // Look at text up to the caret. If it ends with `@<letters/digits/_>` and
  // the character before the `@` is a whitespace / start-of-string, we're in
  // mention mode. Returns the position of the `@` sign and the query chars.
  const detectMention = (text: string, caret: number): { at: number; query: string } | null => {
    let i = caret - 1;
    while (i >= 0) {
      const ch = text[i];
      if (ch === "@") {
        const before = i === 0 ? " " : text[i - 1];
        if (/\s/.test(before)) {
          return { at: i, query: text.slice(i + 1, caret) };
        }
        return null;
      }
      // stop if we hit anything that can't be part of a mention query
      if (!/[A-Za-z0-9_-]/.test(ch)) return null;
      i--;
    }
    return null;
  };

  const onChangeTextarea = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setValue(next);
    const caret = e.target.selectionStart ?? next.length;
    const mention = detectMention(next, caret);
    if (mention) {
      setMenuOpen(true);
      setQuery(mention.query);
      setMentionStart(mention.at);
      setActiveIndex(0);
    } else {
      setMenuOpen(false);
      setQuery("");
      setMentionStart(null);
    }
  };

  const selectSkill = (skill: SkillSummary) => {
    const ta = textareaRef.current;
    if (!ta || mentionStart === null) return;
    const caret = ta.selectionStart ?? value.length;
    const token = nameToToken(skill.name);
    const before = value.slice(0, mentionStart);
    const after = value.slice(caret);
    // add a trailing space so the user can keep typing after the pill
    const next = `${before}${token} ${after}`;
    mentionsRef.current.set(token, skill.id);
    setValue(next);
    setMenuOpen(false);
    setQuery("");
    setMentionStart(null);
    // restore caret just after the inserted token + space
    requestAnimationFrame(() => {
      const pos = before.length + token.length + 1;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const collectSkillIds = (text: string): string[] => {
    const ids = new Set<string>();
    for (const [token, id] of mentionsRef.current) {
      // whole-word match: preceded by start/whitespace, followed by end/whitespace
      const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^|\\s)${esc}(?=$|\\s)`);
      if (re.test(text)) ids.add(id);
    }
    return Array.from(ids);
  };

  const submit = () => {
    if (!canSend) return;
    const text = value.trim();
    const attachments = items.filter((i) => i.result).map((i) => i.result!);
    const skillIds = collectSkillIds(text);
    onSend(text, attachments, skillIds);
    setValue("");
    setItems([]);
    mentionsRef.current.clear();
    setMenuOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen && filteredSkills.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filteredSkills.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filteredSkills.length) % filteredSkills.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const picked = filteredSkills[activeIndex];
        if (picked) selectSkill(picked);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuOpen(false);
        return;
      }
    }

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
      {menuOpen && filteredSkills.length > 0 && (
        <SkillMentionMenu
          skills={filteredSkills}
          activeIndex={activeIndex}
          onHoverIndex={setActiveIndex}
          onSelect={selectSkill}
          // anchor the menu above the textarea, roughly where the caret sits.
          // the chat column is narrow so we just pin it to the left of the input.
          position={{ left: 36, top: -8 - 220 }}
        />
      )}
      <AttachmentChips items={items} onRemove={(id) => setItems((prev) => prev.filter((i) => i.id !== id))} />
      <div className="flex gap-1.5 items-end p-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="shrink-0 p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded disabled:opacity-50"
          title="Attach file"
        >
          <Paperclip size={14} />
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
          ref={textareaRef}
          value={value}
          onChange={onChangeTextarea}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // close menu on blur — delay so click on a menu item (mousedown) can fire first
            setTimeout(() => setMenuOpen(false), 100);
          }}
          placeholder="Message… (type @ to reference a skill)"
          rows={2}
          disabled={disabled}
          className="flex-1 min-w-0 resize-none px-2.5 py-1.5 text-[12.5px] leading-[1.5] bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50 placeholder:text-gray-400"
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={() => onStop?.()}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-black transition-colors"
            title="Stop generation"
          >
            <Square size={10} className="fill-current" />
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={12} />
            Send
          </button>
        )}
      </div>
    </div>
  );
}
