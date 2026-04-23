import { useRef, useState, type ReactNode } from "react";
import { Save } from "lucide-react";
import { Drawer } from "../ui/Drawer";
import { Button } from "../ui/Button";
import {
  BrandBrainForm,
  type BrandBrainFormHandle,
  type EditBrand,
} from "./BrandBrainForm";

interface NewBrandBrainDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  /** Project the new brand should be assigned to. Ignored for edit. */
  projectId?: string;
  onCreated: () => void;
  editBrand?: EditBrand | null;
}

/**
 * Thin drawer wrapper around BrandBrainForm. All form logic, state, and
 * JSX live in BrandBrainForm — this file owns only the drawer chrome
 * (backdrop, slide-in, close X, title, top Save button) and the
 * headerExtra slot where BrandBrainForm's scraping banner renders.
 */
export function NewBrandBrainDrawer({
  isOpen,
  onClose,
  workspaceId,
  projectId,
  onCreated,
  editBrand,
}: NewBrandBrainDrawerProps) {
  const formRef = useRef<BrandBrainFormHandle>(null);
  const [saving, setSaving] = useState(false);
  const [headerExtra, setHeaderExtra] = useState<ReactNode>(null);
  const isEditMode = !!editBrand;

  if (!isOpen) return null;

  const handleSaved = () => {
    onCreated();
    onClose();
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? editBrand!.name : "New Brand Brain"}
      subtitle={
        isEditMode
          ? "Edit brand DNA and AI configuration."
          : "Define your brand's DNA for AI-powered content generation."
      }
      headerActions={
        <Button onClick={() => formRef.current?.save()} loading={saving} size="sm">
          <Save size={14} className="mr-1.5" />
          {isEditMode ? "Save changes" : "Save brand"}
        </Button>
      }
      headerExtra={
        headerExtra ? (
          <div className="px-6 pt-3 pb-2 border-b border-gray-100">{headerExtra}</div>
        ) : null
      }
    >
      <BrandBrainForm
        ref={formRef}
        workspaceId={workspaceId}
        projectId={projectId}
        editBrand={editBrand}
        onSaved={handleSaved}
        onSavingChange={setSaving}
        renderScrapingBanner={setHeaderExtra}
      />
    </Drawer>
  );
}
