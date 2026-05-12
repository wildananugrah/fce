import { useState, useEffect, useCallback, useRef } from "react";
import { Upload, Link2, Trash2, Loader2, FileText, Image, Globe, ChevronDown, ChevronRight } from "lucide-react";
import { api, getAccessToken } from "../../services/api";

interface DocumentChunk {
  id: string;
  chunkIndex: number;
  contentText: string;
}

interface ProductDocument {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  sourceType?: string;
  extractionStatus: string;
  createdAt: string;
  chunks?: DocumentChunk[];
}

interface ProductReferencesProps {
  workspaceId: string;
  productId?: string;
  brandId: string;
  onReferenceAdded?: () => void;
}

export function ProductReferences({ workspaceId, productId, brandId, onReferenceAdded }: ProductReferencesProps) {
  const [docs, setDocs] = useState<ProductDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkUrl, setLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDocs = useCallback(async () => {
    try {
      const endpoint = productId
        ? `/api/workspaces/${workspaceId}/documents/product/${productId}`
        : `/api/workspaces/${workspaceId}/documents/brand/${brandId}`;
      const res = await api<{ data: ProductDocument[] }>(endpoint);
      const data = Array.isArray(res) ? res : (res as any).data ?? res;
      setDocs(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [workspaceId, productId, brandId]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  // Poll for extraction status
  useEffect(() => {
    const hasProcessing = docs.some(
      (d) => d.extractionStatus === "pending" || d.extractionStatus === "processing"
    );
    if (hasProcessing) {
      pollRef.current = setInterval(loadDocs, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [docs, loadDocs]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("brandId", brandId);
      if (productId) formData.append("productId", productId);

      const token = getAccessToken();
      const res = await fetch(`/api/workspaces/${workspaceId}/documents/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      await loadDocs();
      if (!productId) onReferenceAdded?.();
    } catch {
      // silent
    } finally {
      setUploading(false);
    }
  };

  const handleAddLink = async () => {
    if (!linkUrl.trim()) return;
    setAddingLink(true);
    try {
      await api(`/api/workspaces/${workspaceId}/documents/link`, {
        method: "POST",
        body: JSON.stringify({ brandId, ...(productId ? { productId } : {}), url: linkUrl.trim() }),
      });
      setLinkUrl("");
      await loadDocs();
      if (!productId) onReferenceAdded?.();
    } catch {
      // silent
    } finally {
      setAddingLink(false);
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      await api(`/api/workspaces/${workspaceId}/documents/${docId}`, {
        method: "DELETE",
      });
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      // silent
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files[0]) handleUpload(files[0]);
  };

  const getStatusBadge = (status: string) => {
    if (status === "completed") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600">Extracted</span>;
    if (status === "processing") return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600"><Loader2 size={10} className="animate-spin" />Processing</span>;
    if (status === "failed") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">Failed</span>;
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">Pending</span>;
  };

  const getDocIcon = (doc: ProductDocument) => {
    if (doc.sourceType === "link") return <Globe size={14} className="text-blue-500" />;
    if (doc.sourceType === "image" || doc.fileType.startsWith("image/")) return <Image size={14} className="text-purple-500" />;
    return <FileText size={14} className="text-gray-500" />;
  };

  return (
    <div className="space-y-6">
      {/* File Upload */}
      <div>
        <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
          Upload Files
        </label>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors"
        >
          {uploading ? (
            <Loader2 size={24} className="mx-auto text-gray-400 animate-spin mb-2" />
          ) : (
            <Upload size={24} className="mx-auto text-gray-400 mb-2" />
          )}
          <p className="text-xs text-gray-500">
            {uploading ? "Uploading..." : "Drop files here or click to upload"}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">
            PDF, DOCX, TXT, JPG, PNG, WebP
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
        </div>
      </div>

      {/* Link Input */}
      <div>
        <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
          Add Link Reference
        </label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="url"
              placeholder="https://example.com/article"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddLink()}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <button
            type="button"
            onClick={handleAddLink}
            disabled={!linkUrl.trim() || addingLink}
            className="px-4 py-2 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {addingLink ? "Adding..." : "Add"}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">
          The link content will be scraped and extracted as reference material.
        </p>
      </div>

      {/* Reference List */}
      <div>
        <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
          References ({docs.length})
        </label>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={18} className="animate-spin text-gray-400" />
          </div>
        ) : docs.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">
            No references yet. Upload files or add links above.
          </p>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div key={doc.id} className="bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  {getDocIcon(doc)}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">
                      {doc.fileName}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {getStatusBadge(doc.extractionStatus)}
                  {doc.chunks && doc.chunks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      {expandedDoc === doc.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(doc.id)}
                    className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {expandedDoc === doc.id && doc.chunks && (
                  <div className="px-3 pb-3 border-t border-gray-200">
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {doc.chunks.slice(0, 5).map((chunk) => (
                        <p key={chunk.id} className="text-[10px] text-gray-500 line-clamp-2">
                          <span className="font-medium text-gray-400">#{chunk.chunkIndex + 1}</span>{" "}
                          {chunk.contentText.slice(0, 150)}...
                        </p>
                      ))}
                      {doc.chunks.length > 5 && (
                        <p className="text-[10px] text-gray-400 italic">
                          +{doc.chunks.length - 5} more chunks
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
