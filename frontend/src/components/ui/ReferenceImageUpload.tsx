import { useState, useRef, useCallback } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { getAccessToken } from "../../services/api";

interface ImageRef {
  id: string;
  url: string;
  uploading: boolean;
  preview: string;
}

interface ReferenceImageUploadProps {
  workspaceId: string;
  images: ImageRef[];
  onChange: (images: ImageRef[]) => void;
}

export type { ImageRef };

export function ReferenceImageUpload({ workspaceId, images, onChange }: ReferenceImageUploadProps) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    const id = crypto.randomUUID();
    const preview = URL.createObjectURL(file);
    const placeholder: ImageRef = { id, url: "", uploading: true, preview };

    onChange([...images, placeholder]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/workspaces/${workspaceId}/reference-images/upload`, {
        method: "POST",
        headers: {
          ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        },
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }

      const data = await res.json();

      onChange(
        images
          .concat(placeholder)
          .map((img) => (img.id === id ? { ...img, url: data.url, uploading: false } : img))
      );
    } catch {
      onChange(images.filter((img) => img.id !== id));
    }
  }, [workspaceId, images, onChange]);

  const handleFiles = (files: FileList | File[]) => {
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    const validFiles = Array.from(files).filter((f) => validTypes.includes(f.type));
    for (const file of validFiles) {
      uploadFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleRemove = (id: string) => {
    const img = images.find((i) => i.id === id);
    if (img?.preview) URL.revokeObjectURL(img.preview);
    onChange(images.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragging
            ? "border-indigo-400 bg-indigo-50"
            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
        }`}
      >
        <Upload size={20} className="mx-auto text-gray-400 mb-1.5" />
        <p className="text-xs text-gray-500">Drop images here or click to upload</p>
        <p className="text-[10px] text-gray-400 mt-0.5">JPG, PNG, WebP — Max 5MB each</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* Thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 group">
              <img
                src={img.preview}
                alt=""
                className="w-full h-full object-cover"
              />
              {img.uploading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Loader2 size={16} className="animate-spin text-white" />
                </div>
              )}
              {!img.uploading && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRemove(img.id); }}
                  className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} className="text-white" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
