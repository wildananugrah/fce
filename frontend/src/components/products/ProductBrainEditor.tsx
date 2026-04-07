import { useState } from "react";
import { Button } from "../ui/Button";

export interface ProductBrainData {
  usp: string;
  rtb: string;
  functionalBenefits: string;
  emotionalBenefits: string;
  targetAudience: string;
  claims: string;
  disclaimers: string;
}

interface ProductBrainEditorProps {
  onSave: (data: ProductBrainData) => Promise<void>;
  initial?: Partial<ProductBrainData>;
}

const labelClass = "block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5";
const textareaClass =
  "w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black placeholder:text-gray-400 resize-none";

export function ProductBrainEditor({ onSave, initial = {} }: ProductBrainEditorProps) {
  const [form, setForm] = useState<ProductBrainData>({
    usp: initial.usp ?? "",
    rtb: initial.rtb ?? "",
    functionalBenefits: initial.functionalBenefits ?? "",
    emotionalBenefits: initial.emotionalBenefits ?? "",
    targetAudience: initial.targetAudience ?? "",
    claims: initial.claims ?? "",
    disclaimers: initial.disclaimers ?? "",
  });
  const [saving, setSaving] = useState(false);

  const set = (field: keyof ProductBrainData) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
        <label className={labelClass}>USP (Unique Selling Proposition)</label>
        <textarea
          className={textareaClass}
          rows={3}
          placeholder="What makes this product unique..."
          value={form.usp}
          onChange={set("usp")}
        />
      </div>
      <div>
        <label className={labelClass}>RTB (Reason to Believe)</label>
        <textarea
          className={textareaClass}
          rows={3}
          placeholder="Why customers should believe your claims..."
          value={form.rtb}
          onChange={set("rtb")}
        />
      </div>
      <div>
        <label className={labelClass}>Functional Benefits</label>
        <textarea
          className={textareaClass}
          rows={3}
          placeholder="Practical benefits the product provides..."
          value={form.functionalBenefits}
          onChange={set("functionalBenefits")}
        />
      </div>
      <div>
        <label className={labelClass}>Emotional Benefits</label>
        <textarea
          className={textareaClass}
          rows={3}
          placeholder="How the product makes customers feel..."
          value={form.emotionalBenefits}
          onChange={set("emotionalBenefits")}
        />
      </div>
      <div>
        <label className={labelClass}>Target Audience</label>
        <textarea
          className={textareaClass}
          rows={3}
          placeholder="Who is this product for..."
          value={form.targetAudience}
          onChange={set("targetAudience")}
        />
      </div>
      <div>
        <label className={labelClass}>Claims</label>
        <textarea
          className={textareaClass}
          rows={2}
          placeholder="Marketing claims..."
          value={form.claims}
          onChange={set("claims")}
        />
      </div>
      <div>
        <label className={labelClass}>Disclaimers</label>
        <textarea
          className={textareaClass}
          rows={2}
          placeholder="Legal disclaimers..."
          value={form.disclaimers}
          onChange={set("disclaimers")}
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
