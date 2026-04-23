import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { Creator } from "../../services/competitor-analyzer.api";

interface Props {
	creators: Creator[];
	selectedIds: string[];
	onSave: (creatorIds: string[]) => Promise<void>;
}

export function ConfigCreatorPicker({ creators, selectedIds, onSave }: Props) {
	const [local, setLocal] = useState(new Set(selectedIds));
	const [nicheFilter, setNicheFilter] = useState("");
	const [saving, setSaving] = useState(false);

	const filtered = useMemo(() => {
		const q = nicheFilter.toLowerCase().trim();
		if (!q) return creators;
		return creators.filter(
			(c) =>
				(c.niche?.toLowerCase().includes(q) ?? false) ||
				c.username.toLowerCase().includes(q),
		);
	}, [creators, nicheFilter]);

	function toggle(id: string) {
		const next = new Set(local);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		setLocal(next);
	}

	async function handleSave() {
		setSaving(true);
		try {
			await onSave(Array.from(local));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
			<div className="flex items-center justify-between gap-3">
				<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
					Linked creators ({local.size})
				</p>
				<div className="w-56">
					<Input
						placeholder="Filter by niche or username"
						value={nicheFilter}
						onChange={(e) => setNicheFilter(e.target.value)}
					/>
				</div>
			</div>

			{filtered.length === 0 ? (
				<p className="text-sm text-gray-500 py-4 text-center">No creators match.</p>
			) : (
				<div className="max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded">
					{filtered.map((creator) => {
						const selected = local.has(creator.id);
						return (
							<label
								key={creator.id}
								className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
							>
								<input
									type="checkbox"
									checked={selected}
									onChange={() => toggle(creator.id)}
									className="w-4 h-4 rounded border-gray-300 text-indigo-600"
								/>
								<div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden shrink-0">
									{creator.avatarUrl && (
										<img src={creator.avatarUrl} alt="" className="w-full h-full object-cover" />
									)}
								</div>
								<div className="flex-1 min-w-0">
									<div className="text-sm text-gray-900 truncate">@{creator.username}</div>
									<div className="text-xs text-gray-500">{creator.niche ?? "—"}</div>
								</div>
							</label>
						);
					})}
				</div>
			)}

			<div className="flex justify-end">
				<Button onClick={handleSave} loading={saving} disabled={local.size === 0 && selectedIds.length === 0}>
					Save creator list
				</Button>
			</div>
		</div>
	);
}
