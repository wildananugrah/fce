import { File, Image as ImageIcon, Loader2, X } from "lucide-react";
import type { ChatAttachment } from "../../../hooks/useChatStream";

export interface PendingAttachment {
  id: string;
  file: File;
  uploading: boolean;
  error?: string;
  result?: ChatAttachment;
}

export function AttachmentChips({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-3 pt-2">
      {items.map((item) => {
        const isImage = item.file.type.startsWith("image/");
        return (
          <div
            key={item.id}
            className="inline-flex items-center gap-2 px-2 py-1 bg-gray-100 border border-gray-200 rounded text-xs"
          >
            {item.uploading ? (
              <Loader2 size={12} className="animate-spin text-gray-400" />
            ) : isImage ? (
              <ImageIcon size={12} className="text-gray-500" />
            ) : (
              <File size={12} className="text-gray-500" />
            )}
            <span className="max-w-[160px] truncate">{item.file.name}</span>
            {item.error && <span className="text-red-600">· {item.error}</span>}
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="text-gray-400 hover:text-gray-700"
              title="Remove"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
