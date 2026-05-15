import { useState } from "react";
import { Loader2, ImagePlus, RefreshCw, X } from "lucide-react";
import { api } from "../../services/api";

interface Section {
  id: string;
  sectionType: string;
  sectionOrder: number;
  contentText: string;
}

// Renders the "Generate image" placeholder for single-image posts whose
// post_image section hasn't been created yet (pre-existing outputs). Calls
// the ensure-and-generate endpoint which lazily creates the section, then
// bubbles the new section up so the parent can swap to a regular
// SectionImageCell for future regenerations.
export function PostImageGenerator({
  workspaceId,
  outputId,
  onSectionCreated,
}: {
  workspaceId: string;
  outputId: string;
  onSectionCreated: (section: Section) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        data: {
          sectionId: string;
          contentText: string;
          imageUrl: string;
          section?: Section;
        };
      }>(`/api/workspaces/${workspaceId}/library/${outputId}/post-image/generate`, {
        method: "POST",
      });
      const data = (res as any).data ?? res;
      const section: Section = data.section ?? {
        id: data.sectionId,
        sectionType: "post_image",
        sectionOrder: 9999,
        contentText: data.contentText,
      };
      onSectionCreated(section);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate image");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={busy}
        className="w-full flex flex-col items-center justify-center gap-1 border border-dashed border-gray-300 rounded text-gray-400 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50/40 disabled:opacity-50 transition-colors"
        style={{ aspectRatio: "1/1" }}
      >
        {busy ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            <span className="text-[10px]">Generating…</span>
          </>
        ) : (
          <>
            <ImagePlus size={16} />
            <span className="text-[10px] font-medium">Generate image</span>
          </>
        )}
      </button>
      {error && <p className="mt-1 text-[10px] text-red-500">{error}</p>}
    </div>
  );
}

interface SectionImageCellProps {
  sectionId: string;
  imageUrl: string;
  label?: string;
  workspaceId: string;
  outputId: string;
  onSectionUpdated: (sectionId: string, contentText: string) => void;
  onError: (message: string) => void;
  // Display options
  aspectRatio?: string; // CSS aspect-ratio value, e.g. "16/9", "1/1", "9/16"
  className?: string;
  square?: boolean; // remove border-radius from the thumbnail
}

// Single button + thumbnail slot used by slide, frame, and post_image
// sections on the Content Generator page. Synchronously POSTs to the
// scene-image endpoint, then calls onSectionUpdated with the patched JSON.
export function SectionImageCell({
  sectionId,
  imageUrl,
  label,
  workspaceId,
  outputId,
  onSectionUpdated,
  onError,
  aspectRatio = "16/9",
  className = "",
  square = false,
}: SectionImageCellProps) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [regeneratedAt, setRegeneratedAt] = useState(0);

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const res = await api<{
        data: { sectionId: string; contentText: string; imageUrl: string };
      }>(
        `/api/workspaces/${workspaceId}/library/${outputId}/sections/${sectionId}/generate-image`,
        { method: "POST" },
      );
      const data = (res as any).data ?? res;
      onSectionUpdated(data.sectionId, data.contentText);
      setRegeneratedAt(Date.now());
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to generate image");
    } finally {
      setBusy(false);
    }
  };

  const bustedImageUrl = imageUrl
    ? regeneratedAt > 0
      ? `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}v=${regeneratedAt}`
      : imageUrl
    : "";

  return (
    <div className={className}>
      {imageUrl ? (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setPreview(true)}
            className={`block w-full border border-gray-200 overflow-hidden hover:border-indigo-400 hover:shadow-sm transition-all ${square ? "rounded-none" : "rounded"}`}
            style={{ aspectRatio }}
            title="Click to view full size"
          >
            <img
              key={bustedImageUrl}
              src={bustedImageUrl}
              alt={label ?? "Reference"}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            {busy ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy}
          className="w-full flex flex-col items-center justify-center gap-1 border border-dashed border-gray-300 rounded text-gray-400 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50/40 disabled:opacity-50 transition-colors"
          style={{ aspectRatio }}
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span className="text-[10px]">Generating…</span>
            </>
          ) : (
            <>
              <ImagePlus size={16} />
              <span className="text-[10px] font-medium">Generate image</span>
            </>
          )}
        </button>
      )}

      {preview && imageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6"
          onClick={() => setPreview(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">{label ?? "Reference Image"}</h3>
              <button
                type="button"
                onClick={() => setPreview(false)}
                className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto">
              <img
                key={bustedImageUrl}
                src={bustedImageUrl}
                alt={label ?? "Reference"}
                className="w-full object-contain bg-gray-50"
              />
              <div className="p-5">
                <a
                  href={bustedImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Open original
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
