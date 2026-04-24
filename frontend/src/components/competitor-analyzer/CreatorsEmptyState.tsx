import { Users } from "lucide-react";

export function CreatorsEmptyState() {
	return (
		<div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-gray-300 rounded-xl bg-gray-50/50">
			<div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-3">
				<Users size={20} className="text-indigo-600" />
			</div>
			<p className="text-sm font-semibold text-gray-800">No creators yet</p>
			<p className="text-xs text-gray-500 mt-1 text-center max-w-sm">
				Add TikTok competitors using the form above. You'll pick from them when you create an
				analysis config in step&nbsp;2.
			</p>
		</div>
	);
}
