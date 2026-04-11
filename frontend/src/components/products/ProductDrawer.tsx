import { useState } from "react";
import { Drawer } from "../ui/Drawer";
import { ProductForm, type ProductFormData } from "./ProductForm";
import { ProductReferences } from "./ProductReferences";
import { Package, FileText } from "lucide-react";

interface Brand {
  id: string;
  name: string;
}

interface ProductDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  brands: Brand[];
  workspaceId: string;
  mode?: "create" | "edit";
  initial?: ProductFormData;
  productId?: string;
  brandId?: string;
  onSubmit: (data: ProductFormData) => void;
}

const TABS = [
  { key: "details", label: "Details", icon: Package },
  { key: "references", label: "References", icon: FileText },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ProductDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  brands,
  workspaceId,
  mode,
  initial,
  productId,
  brandId,
  onSubmit,
}: ProductDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("details");

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle}>
      <div className="flex h-full">
        {/* Sidebar tabs */}
        <div className="w-40 border-r border-gray-200 py-2 shrink-0">
          {TABS.map((tab) => {
            if (tab.key === "references" && mode !== "edit") return null;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                  activeTab === tab.key
                    ? "bg-gray-100 text-black font-medium border-r-2 border-black"
                    : "text-gray-500 hover:text-black hover:bg-gray-50"
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "details" && (
            <ProductForm
              brands={brands}
              workspaceId={workspaceId}
              mode={mode}
              initial={initial}
              onSubmit={onSubmit}
              onCancel={onClose}
            />
          )}
          {activeTab === "references" && productId && brandId && (
            <ProductReferences
              workspaceId={workspaceId}
              productId={productId}
              brandId={brandId}
            />
          )}
        </div>
      </div>
    </Drawer>
  );
}
