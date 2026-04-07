import { useState, useEffect, useRef, useCallback } from "react";
import { api, getAccessToken } from "../../services/api";
import { Badge } from "../ui/Badge";
import { Spinner } from "../ui/Spinner";
import type { BrandDocument, DocumentChunk } from "../../types";

const BASE_URL = import.meta.env.VITE_API_URL || "";

interface DocumentUploadProps {
  workspaceId: string;
  brandId: string;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

function statusBadgeVariant(
  status: string,
): "warning" | "info" | "success" | "danger" | "default" {
  switch (status) {
    case "pending":
      return "warning";
    case "processing":
      return "info";
    case "completed":
      return "success";
    case "failed":
      return "danger";
    default:
      return "default";
  }
}

function fileTypeBadgeVariant(
  fileType: string,
): "info" | "success" | "default" {
  if (fileType.includes("pdf")) return "info";
  if (fileType.includes("word") || fileType.includes("docx")) return "success";
  return "default";
}

function fileTypeLabel(fileType: string): string {
  if (fileType.includes("pdf")) return "PDF";
  if (fileType.includes("word") || fileType.includes("docx")) return "DOCX";
  if (fileType.includes("text") || fileType.includes("txt")) return "TXT";
  return fileType.split("/").pop()?.toUpperCase() ?? fileType;
}

export function DocumentUpload({
  workspaceId,
  brandId,
  onToast,
}: DocumentUploadProps) {
  const [documents, setDocuments] = useState<BrandDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<Record<string, DocumentChunk[]>>({});
  const [loadingChunks, setLoadingChunks] = useState<string | null>(null);
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const data = await api<BrandDocument[]>(
        `/api/workspaces/${workspaceId}/documents/brand/${brandId}`,
      );
      setDocuments(data);
    } catch {
      // silent on poll failures
    } finally {
      setLoading(false);
    }
  }, [workspaceId, brandId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Poll for pending/processing documents
  useEffect(() => {
    const hasPending = documents.some(
      (d) => d.extractionStatus === "pending" || d.extractionStatus === "processing",
    );
    if (hasPending) {
      pollRef.current = setInterval(loadDocuments, 5000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [documents, loadDocuments]);

  const uploadFile = async (file: File) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];
    const extAllowed = [".pdf", ".docx", ".txt"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

    if (!allowed.includes(file.type) && !extAllowed.includes(ext)) {
      onToast("Only PDF, DOCX, and TXT files are supported", "error");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("brandId", brandId);

      const token = getAccessToken();
      const res = await fetch(
        `${BASE_URL}/api/workspaces/${workspaceId}/documents/upload`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }

      onToast(`"${file.name}" uploaded successfully`, "success");
      await loadDocuments();
    } catch (e) {
      onToast(
        e instanceof Error ? e.message : "Failed to upload file",
        "error",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const toggleChunks = async (docId: string) => {
    if (expandedDocId === docId) {
      setExpandedDocId(null);
      return;
    }
    setExpandedDocId(docId);
    if (!chunks[docId]) {
      setLoadingChunks(docId);
      try {
        const data = await api<DocumentChunk[]>(
          `/api/workspaces/${workspaceId}/documents/${docId}/chunks`,
        );
        setChunks((prev) => ({ ...prev, [docId]: data }));
      } catch {
        onToast("Failed to load document chunks", "error");
      } finally {
        setLoadingChunks(null);
      }
    }
  };

  return (
    <div className="space-y-4 pt-2">
      {/* Upload zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-black bg-gray-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={handleFileChange}
          className="hidden"
        />
        <svg
          className="mx-auto h-8 w-8 text-gray-400 mb-2"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 3 3 0 013.438 3.42A3.75 3.75 0 0118 19.5H6.75z"
          />
        </svg>
        <p className="text-sm text-gray-500">
          Drop files here or click to upload
        </p>
        <p className="text-xs text-gray-400 mt-1">PDF, DOCX, TXT</p>
      </div>

      {uploading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Spinner size="sm" />
          <span>Uploading...</span>
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : documents.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          No documents uploaded yet.
        </p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="border border-gray-200 rounded-lg">
              <button
                type="button"
                onClick={() => toggleChunks(doc.id)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 transition-colors rounded-lg"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <svg
                    className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${
                      expandedDocId === doc.id ? "rotate-90" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  <p className="text-sm font-medium text-black truncate">
                    {doc.fileName}
                  </p>
                  <Badge variant={fileTypeBadgeVariant(doc.fileType)}>
                    {fileTypeLabel(doc.fileType)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="text-xs text-gray-400">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </span>
                  <Badge variant={statusBadgeVariant(doc.extractionStatus)}>
                    <span className="flex items-center gap-1">
                      {doc.extractionStatus === "processing" && (
                        <Spinner size="sm" className="h-3 w-3" />
                      )}
                      {doc.extractionStatus}
                    </span>
                  </Badge>
                </div>
              </button>

              {/* Chunks */}
              {expandedDocId === doc.id && (
                <div className="border-t border-gray-200 p-3 space-y-2">
                  {loadingChunks === doc.id ? (
                    <div className="flex justify-center py-4">
                      <Spinner size="sm" />
                    </div>
                  ) : !chunks[doc.id] || chunks[doc.id].length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">
                      {doc.extractionStatus === "completed"
                        ? "No chunks extracted."
                        : "Chunks will appear after extraction completes."}
                    </p>
                  ) : (
                    chunks[doc.id].map((chunk) => (
                      <div
                        key={chunk.id}
                        className="bg-gray-50 rounded p-2 text-xs"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedChunkId(
                              expandedChunkId === chunk.id ? null : chunk.id,
                            )
                          }
                          className="w-full text-left"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="default">
                              #{chunk.chunkIndex}
                            </Badge>
                            {chunk.retrievalTags &&
                              chunk.retrievalTags.length > 0 &&
                              chunk.retrievalTags.map((tag) => (
                                <Badge key={tag} variant="info">
                                  {tag}
                                </Badge>
                              ))}
                          </div>
                          <p className="text-gray-600 whitespace-pre-wrap">
                            {expandedChunkId === chunk.id
                              ? chunk.contentText
                              : chunk.contentText.length > 200
                                ? `${chunk.contentText.slice(0, 200)}...`
                                : chunk.contentText}
                          </p>
                          {chunk.contentText.length > 200 && (
                            <span className="text-gray-400 mt-1 inline-block">
                              {expandedChunkId === chunk.id
                                ? "Show less"
                                : "Show more"}
                            </span>
                          )}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
