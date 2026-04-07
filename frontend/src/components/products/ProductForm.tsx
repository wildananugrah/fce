import { useState } from "react";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";

interface Brand {
  id: string;
  name: string;
}

interface ProductFormProps {
  brands: Brand[];
  onSubmit: (data: ProductFormData) => Promise<void>;
  onCancel: () => void;
}

export interface ProductFormData {
  brandId: string;
  name: string;
  slug: string;
  type: string;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PRODUCT_TYPES = [
  { value: "", label: "Select type..." },
  { value: "product", label: "Product" },
  { value: "service", label: "Service" },
  { value: "feature", label: "Feature" },
  { value: "campaign", label: "Campaign" },
];

export function ProductForm({ brands, onSubmit, onCancel }: ProductFormProps) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    setSlug(generateSlug(val));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!brandId) {
      setError("Brand is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        brandId,
        name: name.trim(),
        slug: slug || generateSlug(name.trim()),
        type,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create product");
    } finally {
      setLoading(false);
    }
  };

  const brandOptions = brands.map((b) => ({ value: b.id, label: b.name }));

  return (
    <div className="space-y-4">
      {brands.length === 0 ? (
        <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-3">
          You need to create a brand before adding products.
        </p>
      ) : (
        <>
          <Select
            label="Brand"
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            options={brandOptions}
          />
          <Input label="Name" value={name} onChange={handleNameChange} placeholder="Product name" />
          <Input
            label="Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="product-slug"
          />
          <Select
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={PRODUCT_TYPES}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button onClick={handleSubmit} loading={loading}>
              Create Product
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
