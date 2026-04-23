import { Users } from "lucide-react";

export function CreatorsEmptyState() {
	return (
		<div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-gray-300 rounded-md bg-gray-50/50">
			<Users size={28} className="text-gray-400 mb-2" />
			<p className="text-sm font-medium text-gray-700">No creators yet</p>
			<p className="text-xs text-gray-500 mt-1">Add your first competitor using the form above.</p>
		</div>
	);
}
