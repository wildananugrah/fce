import { useState, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface Props {
	onSubmit: (input: { profileUrl: string; username: string; niche: string }) => Promise<void>;
}

export function CreatorAddForm({ onSubmit }: Props) {
	const [profileUrl, setProfileUrl] = useState("");
	const [username, setUsername] = useState("");
	const [niche, setNiche] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (!profileUrl.trim() || !username.trim() || !niche.trim()) {
			setError("All fields required");
			return;
		}
		setSubmitting(true);
		setError("");
		try {
			await onSubmit({
				profileUrl: profileUrl.trim(),
				username: username.trim().replace(/^@/, ""),
				niche: niche.trim(),
			});
			setProfileUrl("");
			setUsername("");
			setNiche("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to add creator");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
			<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Add a creator</p>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
				<Input
					label="TikTok URL"
					value={profileUrl}
					onChange={(e) => setProfileUrl(e.target.value)}
					placeholder="https://tiktok.com/@handle"
				/>
				<Input
					label="Username"
					value={username}
					onChange={(e) => setUsername(e.target.value)}
					placeholder="handle"
				/>
				<Input
					label="Niche"
					value={niche}
					onChange={(e) => setNiche(e.target.value)}
					placeholder="fitness, fashion, …"
				/>
			</div>
			{error && <p className="text-xs text-red-500">{error}</p>}
			<div className="flex justify-end">
				<Button type="submit" loading={submitting}>
					Add Creator
				</Button>
			</div>
		</form>
	);
}
