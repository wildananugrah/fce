import { useState } from "react";
import { Button } from "../ui/Button";

interface BrainVersionEditorProps {
  onSave: (data: BrainVersionData) => Promise<void>;
  initial?: Partial<BrainVersionData>;
}

export interface BrainVersionData {
  personality: string;
  tone: string;
  audiencePersonas: string;
  values: string;
  messagingRules: string;
  vocabularyPreferred: string;
  vocabularyAvoided: string;
}

const labelClass = "block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5";
const inputClass =
  "w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black placeholder:text-gray-400";
const textareaClass = `${inputClass} resize-none`;

export function BrainVersionEditor({ onSave, initial = {} }: BrainVersionEditorProps) {
  const [form, setForm] = useState<BrainVersionData>({
    personality: initial.personality ?? "",
    tone: initial.tone ?? "",
    audiencePersonas: initial.audiencePersonas ?? "",
    values: initial.values ?? "",
    messagingRules: initial.messagingRules ?? "",
    vocabularyPreferred: initial.vocabularyPreferred ?? "",
    vocabularyAvoided: initial.vocabularyAvoided ?? "",
  });
  const [saving, setSaving] = useState(false);

  const set = (field: keyof BrainVersionData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Personality</label>
        <textarea
          className={textareaClass}
          rows={3}
          placeholder="Describe the brand personality..."
          value={form.personality}
          onChange={set("personality")}
        />
      </div>
      <div>
        <label className={labelClass}>Tone</label>
        <input
          type="text"
          className={inputClass}
          placeholder="e.g. Professional, Friendly, Bold"
          value={form.tone}
          onChange={set("tone")}
        />
      </div>
      <div>
        <label className={labelClass}>Audience Personas (JSON)</label>
        <textarea
          className={textareaClass}
          rows={4}
          placeholder='[{"name": "...", "description": "..."}]'
          value={form.audiencePersonas}
          onChange={set("audiencePersonas")}
        />
      </div>
      <div>
        <label className={labelClass}>Values (comma-separated)</label>
        <textarea
          className={textareaClass}
          rows={2}
          placeholder="Innovation, Integrity, Excellence"
          value={form.values}
          onChange={set("values")}
        />
      </div>
      <div>
        <label className={labelClass}>Messaging Rules (JSON)</label>
        <textarea
          className={textareaClass}
          rows={4}
          placeholder='[{"rule": "Always use active voice"}]'
          value={form.messagingRules}
          onChange={set("messagingRules")}
        />
      </div>
      <div>
        <label className={labelClass}>Preferred Vocabulary (comma-separated)</label>
        <textarea
          className={textareaClass}
          rows={2}
          placeholder="innovative, seamless, empowering"
          value={form.vocabularyPreferred}
          onChange={set("vocabularyPreferred")}
        />
      </div>
      <div>
        <label className={labelClass}>Avoided Vocabulary (comma-separated)</label>
        <textarea
          className={textareaClass}
          rows={2}
          placeholder="cheap, basic, ordinary"
          value={form.vocabularyAvoided}
          onChange={set("vocabularyAvoided")}
        />
      </div>
      <div className="pt-2">
        <Button onClick={handleSave} loading={saving}>
          Save Brain Version
        </Button>
      </div>
    </div>
  );
}
