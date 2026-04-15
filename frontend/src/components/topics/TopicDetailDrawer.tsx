import { useState, useEffect } from "react";
import { Drawer } from "../ui/Drawer";
import { Button } from "../ui/Button";
import { api } from "../../services/api";
import { Save, Tag, Layers, Globe, Target, Calendar, Package, FileText } from "lucide-react";

interface Topic {
  id: string;
  title: string;
  description?: string | null;
  pillar?: string | null;
  platform?: string | null;
  format?: string | null;
  objective?: string | null;
  publishDate?: string | null;
  status: string;
  brandId?: string | null;
  products?: Array<{
    id: string;
    product: { id: string; name: string };
  }>;
  brand?: { id: string; name: string } | null;
  createdAt: string;
}

interface TopicDetailDrawerProps {
  isOpen: boolean;
  topic: Topic | null;
  workspaceId: string;
  onClose: () => void;
  onUpdated: (topic: Topic) => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

const PLATFORMS = [
  { value: "", label: "—" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "twitter", label: "Twitter/X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "facebook", label: "Facebook" },
];

const OBJECTIVES = [
  { value: "", label: "—" },
  { value: "awareness", label: "Awareness" },
  { value: "engagement", label: "Engagement" },
  { value: "education", label: "Education" },
  { value: "conversion", label: "Conversion" },
  { value: "retention", label: "Retention" },
];

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

function formatFullDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function TopicDetailDrawer({
  isOpen,
  topic,
  workspaceId,
  onClose,
  onUpdated,
  onToast,
}: TopicDetailDrawerProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pillar, setPillar] = useState("");
  const [platform, setPlatform] = useState("");
  const [format, setFormat] = useState("");
  const [objective, setObjective] = useState("");
  const [publishDate, setPublishDate] = useState("");
  const [status, setStatus] = useState("draft");
  const [saving, setSaving] = useState(false);

  // Reset form whenever a new topic is opened
  useEffect(() => {
    if (!topic) return;
    setTitle(topic.title ?? "");
    setDescription(topic.description ?? "");
    setPillar(topic.pillar ?? "");
    setPlatform(topic.platform ?? "");
    setFormat(topic.format ?? "");
    setObjective(topic.objective ?? "");
    setPublishDate(topic.publishDate ? topic.publishDate.split("T")[0] : "");
    setStatus(topic.status ?? "draft");
  }, [topic]);

  if (!topic) return null;

  const isDirty =
    title !== (topic.title ?? "") ||
    description !== (topic.description ?? "") ||
    pillar !== (topic.pillar ?? "") ||
    platform !== (topic.platform ?? "") ||
    format !== (topic.format ?? "") ||
    objective !== (topic.objective ?? "") ||
    publishDate !== (topic.publishDate ? topic.publishDate.split("T")[0] : "") ||
    status !== topic.status;

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string | null> = {
        title: title.trim(),
        description: description.trim() || null,
        pillar: pillar.trim() || null,
        platform: platform || null,
        format: format.trim() || null,
        objective: objective || null,
        publishDate: publishDate || null,
        status,
      };
      const res = await api<{ data: Topic }>(
        `/api/workspaces/${workspaceId}/topics/${topic.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );
      const updated = (res as any).data ?? res;
      onUpdated({ ...topic, ...updated });
      onToast("Topic updated", "success");
      onClose();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Topic Details"
      subtitle={topic.brand?.name ?? undefined}
    >
      <div className="p-6 space-y-6">
        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="What is this topic about?"
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-y leading-relaxed"
          />
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Pillar */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
              <Tag size={12} />
              Pillar
            </label>
            <input
              type="text"
              value={pillar}
              onChange={(e) => setPillar(e.target.value)}
              placeholder="Content pillar"
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
            />
          </div>

          {/* Format */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
              <Layers size={12} />
              Format
            </label>
            <input
              type="text"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              placeholder="single_image, carousel, reels..."
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
            />
          </div>

          {/* Platform */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
              <Globe size={12} />
              Platform
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Objective */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
              <Target size={12} />
              Objective
            </label>
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
            >
              {OBJECTIVES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Publish Date */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
              <Calendar size={12} />
              Publish Date
            </label>
            <input
              type="date"
              value={publishDate}
              onChange={(e) => setPublishDate(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
            />
          </div>

          {/* Status */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
              <FileText size={12} />
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Products */}
        {topic.products && topic.products.length > 0 && (
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
              <Package size={12} />
              Products
            </label>
            <div className="flex flex-wrap gap-1.5">
              {topic.products.map((tp) => (
                <span
                  key={tp.id}
                  className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700"
                >
                  {tp.product.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Metadata footer */}
        <div className="pt-4 border-t border-gray-100 text-[11px] text-gray-400 space-y-0.5">
          <p>
            <span className="font-medium text-gray-500">Created:</span>{" "}
            {formatFullDate(topic.createdAt)}
          </p>
          <p>
            <span className="font-medium text-gray-500">Topic ID:</span> {topic.id}
          </p>
        </div>

        {/* Save button */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={!isDirty}>
            <Save size={14} className="mr-1.5" />
            Save Changes
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
