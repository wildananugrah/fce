import { useState, useEffect } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Spinner } from "../components/ui/Spinner";

interface Brand {
  id: string;
  name: string;
  status: string;
}

interface Product {
  id: string;
  name: string;
  status: string;
}

interface KpiCardProps {
  label: string;
  value: string | number;
}

function KpiCard({ label, value }: KpiCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">{label}</p>
      <p className="text-2xl font-bold text-black">{value}</p>
    </div>
  );
}

export function DashboardPage() {
  const { activeWorkspace } = useWorkspace();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeWorkspace) {
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const [b, p] = await Promise.all([
          api<Brand[]>(`/api/workspaces/${activeWorkspace.id}/brands`),
          api<Product[]>(`/api/workspaces/${activeWorkspace.id}/products`),
        ]);
        setBrands(b);
        setProducts(p);
      } catch {
        // silently ignore, counts will just show 0
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeWorkspace]);

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Create a workspace first to view your dashboard.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-black">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">{activeWorkspace.name}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard label="Brands" value={brands.length} />
            <KpiCard label="Products" value={products.length} />
            <KpiCard label="Generations" value={0} />
            <KpiCard label="API Usage" value="$0.00" />
          </div>

          <div>
            <h2 className="text-sm font-semibold text-black mb-3">Recent Generations</h2>
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
              <p className="text-sm text-gray-400">No generations yet. Start generating content to see activity here.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
