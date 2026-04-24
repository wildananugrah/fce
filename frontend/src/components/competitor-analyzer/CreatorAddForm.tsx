import { useState, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface Props {
	onSubmit: (input: { profileUrl?: string; username?: string; niche?: string }) => Promise<void>;
}

/** Detect "looks like a URL" to split the single input into URL vs. username. */
function looksLikeUrl(value: string): boolean {
	return /^(https?:\/\/|tiktok\.com|www\.)/i.test(value.trim());
}

export function CreatorAddForm({ onSubmit }: Props) {
	const [handle, setHandle] = useState("");
	const [niche, setNiche] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		const trimmed = handle.trim().replace(/^@/, "");
		if (!trimmed) {
			setError("Enter a TikTok URL or @username");
			return;
		}
		setSubmitting(true);
		setError("");
		try {
			const input = looksLikeUrl(trimmed)
				? { profileUrl: trimmed }
				: { username: trimmed };
			await onSubmit({
				...input,
				niche: niche.trim() || undefined,
			});
			setHandle("");
			setNiche("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to add creator");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="bg-white border border-gray-200 rounded-xl p-4 space-y-3"
		>
			<div className="flex items-baseline justify-between">
				<p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
					Add a creator
				</p>
				<p className="text-[11px] text-gray-500">
					Paste a TikTok link or @username — we'll figure it out.
				</p>
			</div>
			<div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
				<Input
					label="TikTok URL or @username"
					value={handle}
					onChange={(e) => setHandle(e.target.value)}
					placeholder="https://tiktok.com/@handle   or   @handle"
				/>
				<Input
					label="Niche (optional)"
					value={niche}
					onChange={(e) => setNiche(e.target.value)}
					placeholder="fitness, fashion, …"
				/>
				<Button type="submit" loading={submitting} disabled={!handle.trim()}>
					Add Creator
				</Button>
			</div>
			{error && (
				<p role="alert" className="text-xs text-red-600">
					{error}
				</p>
			)}
		</form>
	);
}
