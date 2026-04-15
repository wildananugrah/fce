import { useState } from "react";
import { Loader2, ImagePlus, RefreshCw, X } from "lucide-react";
import { api } from "../../services/api";

interface Section {
  id: string;
  sectionType: string;
  sectionOrder: number;
  contentText: string;
}

interface VisualScriptTableProps {
  scenes: Section[];
  workspaceId: string;
  outputId: string;
  getJsonField: (sectionId: string, contentText: string, field: string) => string;
  onJsonFieldChange: (
    sectionId: string,
    contentText: string,
    field: string,
    value: string,
  ) => void;
  onSectionUpdated: (sectionId: string, contentText: string) => void;
  onError: (message: string) => void;
}

// Visual script table for video content types — matches the reference
// layout: Waktu | Visual | Audio/VO | Teks Overlay | Referensi Visual.
// Each row has a "Generate image" button that calls Imagen via the backend
// and updates the row's referenceImageUrl inline.
export function VisualScriptTable({
  scenes,
  workspaceId,
  outputId,
  getJsonField,
  onJsonFieldChange,
  onSectionUpdated,
  onError,
}: VisualScriptTableProps) {
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    imageUrl: string;
    sceneNumber: string;
    visualDirection: string;
    visualReference: string;
  } | null>(null);

  const handleGenerate = async (sectionId: string) => {
    setGeneratingId(sectionId);
    try {
      const res = await api<{
        data: { sectionId: string; contentText: string; imageUrl: string };
      }>(
        `/api/workspaces/${workspaceId}/library/${outputId}/sections/${sectionId}/generate-image`,
        { method: "POST" },
      );
      const data = (res as any).data ?? res;
      onSectionUpdated(data.sectionId, data.contentText);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to generate image");
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide">
        Visual Script ({scenes.length} scenes)
      </label>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left">
              <th
                className="px-2 py-2 font-semibold text-gray-600"
                style={{ width: 180, minWidth: 180 }}
              >
                Waktu
              </th>
              <th className="px-3 py-2 font-semibold text-gray-600 min-w-[200px]">Visual</th>
              <th className="px-3 py-2 font-semibold text-gray-600 min-w-[180px]">
                Audio / VO
              </th>
              <th className="px-3 py-2 font-semibold text-gray-600 min-w-[140px]">
                Teks Overlay
              </th>
              <th className="px-3 py-2 font-semibold text-gray-600 w-[180px]">
                Referensi Visual
              </th>
            </tr>
          </thead>
          <tbody>
            {scenes.map((scene) => {
              const num = getJsonField(scene.id, scene.contentText, "sceneNumber");
              const imageUrl = getJsonField(scene.id, scene.contentText, "referenceImageUrl");
              const busy = generatingId === scene.id;
              return (
                <tr key={scene.id} className="border-b border-gray-100 last:border-0 align-top">
                  <td className="px-2 py-2 align-top" style={{ width: 180, minWidth: 180 }}>
                    <p className="text-[10px] font-semibold text-red-500 whitespace-nowrap mb-1">
                      Scene {num}
                    </p>
                    <input
                      type="text"
                      value={getJsonField(scene.id, scene.contentText, "timeRange")}
                      onChange={(e) =>
                        onJsonFieldChange(
                          scene.id,
                          scene.contentText,
                          "timeRange",
                          e.target.value,
                        )
                      }
                      placeholder="00:00 – 00:03"
                      className="w-full px-1.5 py-1 text-[11px] font-mono tabular-nums bg-gray-50 border border-gray-200 rounded focus:outline-none focus:border-indigo-400"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <textarea
                      value={getJsonField(scene.id, scene.contentText, "visualDirection")}
                      onChange={(e) =>
                        onJsonFieldChange(
                          scene.id,
                          scene.contentText,
                          "visualDirection",
                          e.target.value,
                        )
                      }
                      rows={3}
                      className="w-full px-2 py-1.5 text-[11px] bg-gray-50 border border-gray-200 rounded focus:outline-none focus:border-indigo-400 resize-y"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <textarea
                      value={getJsonField(scene.id, scene.contentText, "voiceover")}
                      onChange={(e) =>
                        onJsonFieldChange(
                          scene.id,
                          scene.contentText,
                          "voiceover",
                          e.target.value,
                        )
                      }
                      rows={3}
                      className="w-full px-2 py-1.5 text-[11px] bg-gray-50 border border-gray-200 rounded focus:outline-none focus:border-indigo-400 resize-y"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <textarea
                      value={getJsonField(scene.id, scene.contentText, "onScreenText")}
                      onChange={(e) =>
                        onJsonFieldChange(
                          scene.id,
                          scene.contentText,
                          "onScreenText",
                          e.target.value,
                        )
                      }
                      rows={3}
                      className="w-full px-2 py-1.5 text-[11px] bg-gray-50 border border-gray-200 rounded focus:outline-none focus:border-indigo-400 resize-y"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {imageUrl ? (
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setPreview({
                              imageUrl,
                              sceneNumber: num,
                              visualDirection: getJsonField(
                                scene.id,
                                scene.contentText,
                                "visualDirection",
                              ),
                              visualReference: getJsonField(
                                scene.id,
                                scene.contentText,
                                "visualReference",
                              ),
                            })
                          }
                          className="block w-full rounded border border-gray-200 overflow-hidden hover:border-indigo-400 hover:shadow-sm transition-all"
                          title="Click to view full size"
                        >
                          <img
                            src={imageUrl}
                            alt={`Scene ${num} reference`}
                            className="w-full aspect-video object-cover"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGenerate(scene.id)}
                          disabled={busy}
                          className="w-full inline-flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                          {busy ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <RefreshCw size={11} />
                          )}
                          {busy ? "Regenerating…" : "Regenerate"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleGenerate(scene.id)}
                        disabled={busy}
                        className="w-full aspect-video flex flex-col items-center justify-center gap-1 border border-dashed border-gray-300 rounded text-gray-400 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50/40 disabled:opacity-50 transition-colors"
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div>
                <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">
                  Scene {preview.sceneNumber}
                </p>
                <h3 className="text-sm font-semibold text-gray-900">Visual Reference</h3>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto">
              <img
                src={preview.imageUrl}
                alt={`Scene ${preview.sceneNumber}`}
                className="w-full object-contain bg-gray-50"
              />
              <div className="p-5 space-y-3">
                {preview.visualDirection && (
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                      Visual Direction
                    </p>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {preview.visualDirection}
                    </p>
                  </div>
                )}
                {preview.visualReference && (
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                      Image Prompt
                    </p>
                    <p className="text-sm text-gray-600 leading-relaxed font-mono">
                      {preview.visualReference}
                    </p>
                  </div>
                )}
                <div className="pt-2">
                  <a
                    href={preview.imageUrl}
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
        </div>
      )}
    </div>
  );
}
