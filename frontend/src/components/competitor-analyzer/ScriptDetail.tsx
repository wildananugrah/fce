import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { PipelineScript } from "../../services/competitor-analyzer.api";

export function ScriptDetail({ script }: { script: PipelineScript }) {
	const [copied, setCopied] = useState(false);
	const text = [
		script.title ? `Title: ${script.title}` : "",
		`Hook: ${script.hook ?? ""}`,
		`Body: ${script.body ?? ""}`,
		script.broll?.length
			? `B-roll:\n${script.broll.map((b) => `- ${b.scene}: ${b.description}`).join("\n")}`
			: "",
		`CTA: ${script.cta ?? ""}`,
	]
		.filter(Boolean)
		.join("\n\n");

	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			/* ignore */
		}
	}

	return (
		<div className="bg-white border border-gray-200 rounded-md p-4 space-y-2">
			<div className="flex items-center justify-between">
				<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
					Script {script.scriptNumber}
					{script.title && <span className="text-gray-700 normal-case"> · {script.title}</span>}
				</p>
				<button
					type="button"
					onClick={copyToClipboard}
					className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
				>
					{copied ? <Check size={12} /> : <Copy size={12} />}
					{copied ? "Copied" : "Copy"}
				</button>
			</div>
			{script.hook && (
				<p className="text-sm">
					<span className="font-semibold text-gray-800">Hook:</span> {script.hook}
				</p>
			)}
			{script.body && (
				<p className="text-sm text-gray-800 whitespace-pre-wrap">{script.body}</p>
			)}
			{script.broll && script.broll.length > 0 && (
				<div className="text-sm text-gray-700 mt-2">
					<p className="font-semibold text-gray-800">B-roll</p>
					<ul className="list-disc pl-5 space-y-0.5">
						{script.broll.map((b, i) => (
							<li key={i}>
								<span className="text-gray-500">{b.scene}</span> — {b.description}
							</li>
						))}
					</ul>
				</div>
			)}
			{script.cta && (
				<p className="text-sm">
					<span className="font-semibold text-gray-800">CTA:</span> {script.cta}
				</p>
			)}
		</div>
	);
}
