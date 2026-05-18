import { useState } from "react";
import { Drawer } from "../ui/Drawer";
import { ProductForm, type ProductFormData } from "./ProductForm";
import { CoachMark } from "../onboarding/CoachMark";
import { HelpButton } from "../onboarding/HelpButton";

interface Brand {
  id: string;
  name: string;
  language?: string;
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
  onSubmit: (data: ProductFormData) => Promise<void>;
}

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
  const [busy, setBusy] = useState(false);

  const isCreating = mode !== "edit";

  const guardedClose = () => {
    if (
      busy &&
      !window.confirm(
        "AI is generating product details — close anyway? Your progress will be lost.",
      )
    ) {
      return;
    }
    onClose();
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={guardedClose}
      title={title}
      subtitle={subtitle}
      headerActions={isCreating ? <HelpButton pageKey="product-new" /> : undefined}
    >
      <div className="p-6">
        {isCreating && (
          <CoachMark
            pageKey="product-new"
            title="Create your first product"
            body="Paste a product page URL and click Auto-fill to pre-fill everything. Otherwise, work through the fields manually — you can refine the Product Brain later."
          />
        )}
        <ProductForm
          brands={brands}
          workspaceId={workspaceId}
          mode={mode}
          initial={initial}
          productId={productId}
          brandId={brandId}
          onSubmit={onSubmit}
          onCancel={guardedClose}
          onBusyChange={setBusy}
        />
      </div>
    </Drawer>
  );
}
