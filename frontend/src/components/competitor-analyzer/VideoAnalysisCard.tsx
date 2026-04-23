import { ExternalLink } from "lucide-react";
import type { PipelineContent } from "../../services/competitor-analyzer.api";

function formatNumber(n: number | null): string {
	if (n === null) return "—";
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toString();
}

export function VideoAnalysisCard({ video }: { video: PipelineContent }) {
	const statusBadge = {
		pending: "bg-gray-100 text-gray-700",
		running: "bg-blue-100 text-blue-700 animate-pulse",
		completed: "bg-green-100 text-green-700",
		failed: "bg-red-100 text-red-700",
	}[video.analysisStatus];

	return (
		<div className="border border-gray-200 rounded-md p-3 flex gap-3 bg-white">
			<div className="w-20 h-28 rounded bg-gray-100 overflow-hidden shrink-0">
				{video.thumbnailUrl ? (
					<img
						src={video.thumbnailUrl}
						alt=""
						loading="lazy"
						className="w-full h-full object-cover"
					/>
				) : null}
			</div>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusBadge}`}>
						{video.analysisStatus}
					</span>
					<span className="text-xs text-gray-500">
						{formatNumber(video.viewCount)} views · {formatNumber(video.likeCount)} likes
					</span>
					<a
						href={video.contentUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="ml-auto text-gray-400 hover:text-gray-700"
						title="Open video"
					>
						<ExternalLink size={12} />
					</a>
				</div>
				<p className="text-sm text-gray-900 mt-1 line-clamp-2">{video.caption ?? "—"}</p>
				{video.analysisJson && (
					<div className="mt-2 text-xs text-gray-600 space-y-1">
						<p>
							<span className="font-semibold text-gray-800">Hook:</span> {video.analysisJson.hook}
						</p>
						<p>
							<span className="font-semibold text-gray-800">Why it went viral:</span>{" "}
							{video.analysisJson.whyItWentViral}
						</p>
					</div>
				)}
				{video.analysisError && (
					<p className="text-xs text-red-600 mt-1">Error: {video.analysisError}</p>
				)}
			</div>
		</div>
	);
}
