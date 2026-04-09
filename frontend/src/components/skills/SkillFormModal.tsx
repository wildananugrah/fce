import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";

interface SkillFormData {
  id?: string;
  name: string;
  description: string;
  category: string;
  content: string;
}

interface SkillFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editSkill?: SkillFormData | null;
  onSaved: () => void;
}

const CATEGORY_OPTIONS = [
  { value: "", label: "Select a category" },
  { value: "strategy", label: "Strategy" },
  { value: "content", label: "Content" },
  { value: "seo", label: "SEO" },
  { value: "conversion", label: "Conversion" },
  { value: "outreach", label: "Outreach" },
  { value: "research", label: "Research" },
  { value: "growth", label: "Growth" },
  { value: "other", label: "Other" },
];

export function SkillFormModal({ isOpen, onClose, editSkill, onSaved }: SkillFormModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen && editSkill) {
      setName(editSkill.name);
      setDescription(editSkill.description);
      setCategory(editSkill.category);
      setContent(editSkill.content);
    } else if (isOpen) {
      setName("");
      setDescription("");
      setCategory("");
      setContent("");
    }
    setError("");
  }, [isOpen, editSkill]);

  const handleSubmit = async () => {
    if (!name.trim() || !description.trim() || !category || !content.trim()) {
      setError("All fields are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = JSON.stringify({ name: name.trim(), description: description.trim(), category, content: content.trim() });
      if (editSkill?.id) {
        await api(`/api/skills/${editSkill.id}`, { method: "PATCH", body });
      } else {
        await api("/api/skills", { method: "POST", body });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save skill");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editSkill?.id ? "Edit Skill" : "Add Custom Skill"} size="lg">
      <div className="space-y-4">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Hook Generator"
        />
        <Input
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of what this skill does"
        />
        <Select
          label="Category"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <div className="w-full">
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
            Content
          </label>
          <textarea
            className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black placeholder:text-gray-400 min-h-[200px] resize-y"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="The skill instructions / prompt content..."
          />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={saving}>
            {editSkill?.id ? "Save Changes" : "Create Skill"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
