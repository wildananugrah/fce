import { useRef, useState } from "react";
import { FileText, X, Upload } from "lucide-react";

const ACCEPTED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

interface FileDropZoneProps {
  selectedFile: File | null;
  onFileSelect: (file: File) => void;
  onClear: () => void;
  maxSizeMB?: number;
  disabled?: boolean;
}

export function FileDropZone({
  selectedFile,
  onFileSelect,
  onClear,
  maxSizeMB = 5,
  disabled = false,
}: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [sizeError, setSizeError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setSizeError("");
    if (!ACCEPTED_MIME.includes(file.type)) return;
    if (file.size > maxSizeMB * 1024 * 1024) {
      setSizeError(`File is too large. Max size is ${maxSizeMB} MB.`);
      return;
    }
    onFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (selectedFile) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-md">
        <FileText size={14} className="text-indigo-500 shrink-0" />
        <span className="text-sm text-indigo-700 flex-1 truncate">{selectedFile.name}</span>
        <button
          type="button"
          onClick={onClear}
          className="text-indigo-400 hover:text-indigo-600"
          aria-label="Remove file"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fileInputRef.current?.click(); } }}
        className={`border-2 border-dashed rounded-lg px-4 py-5 text-center transition-colors ${
          disabled
            ? "opacity-50 cursor-not-allowed border-gray-200"
            : dragging
            ? "border-indigo-400 bg-indigo-50 cursor-pointer"
            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer"
        }`}
      >
        <Upload size={18} className="mx-auto text-gray-400 mb-1.5" />
        <p className="text-xs text-gray-500">Drop a file here, or click to browse</p>
        <p className="text-[10px] text-gray-400 mt-0.5">PDF, DOCX, TXT — Max {maxSizeMB} MB</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>
      {sizeError && (
        <p className="text-xs text-red-500 mt-1">{sizeError}</p>
      )}
    </div>
  );
}
