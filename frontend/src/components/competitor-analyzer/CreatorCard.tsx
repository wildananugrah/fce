import { RefreshCw, Trash2 } from "lucide-react";
import type { Creator } from "../../services/competitor-analyzer.api";

interface Props {
	creator: Creator;
	onArchive: (id: string) => Promise<void>;
	onRetryEnrichment: (id: string) => Promise<void>;
}

function formatFollowers(count: number | null): string {
	if (count === null) return "—";
	if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
	return count.toString();
}

export function CreatorCard({ creator, onArchive, onRetryEnrichment }: Props) {
	const isPending = creator.enrichmentStatus === "pending";
	const isFailed = creator.enrichmentStatus === "failed";

	return (
		<div className="bg-white border border-gray-200 rounded-md p-4 flex items-center gap-3">
			<div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden shrink-0">
				{creator.avatarUrl ? (
					<img src={creator.avatarUrl} alt={creator.username} className="w-full h-full object-cover" />
				) : (
					<div className="w-full h-full flex items-center justify-center text-gray-400 text-lg">
						{creator.username.charAt(0).toUpperCase()}
					</div>
				)}
			</div>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium text-gray-900 truncate">@{creator.username}</span>
					{isPending && (
						<span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
							enriching…
						</span>
					)}
					{isFailed && (
						<span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">
							failed
						</span>
					)}
				</div>
				<div className="text-xs text-gray-500 mt-0.5">
					{creator.niche} · {formatFollowers(creator.followerCount)} followers
				</div>
				{isFailed && creator.enrichmentError && (
					<div className="text-[11px] text-red-600 mt-0.5 truncate" title={creator.enrichmentError}>
						{creator.enrichmentError}
					</div>
				)}
			</div>
			<div className="flex items-center gap-1 shrink-0">
				{!isPending && (
					<button
						type="button"
						onClick={() => onRetryEnrichment(creator.id)}
						className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
						title="Refresh profile"
					>
						<RefreshCw size={14} />
					</button>
				)}
				<button
					type="button"
					onClick={() => {
						if (confirm(`Archive creator @${creator.username}?`)) onArchive(creator.id);
					}}
					className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600"
					title="Archive"
				>
					<Trash2 size={14} />
				</button>
			</div>
		</div>
	);
}
