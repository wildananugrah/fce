import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOnboarding } from "../../hooks/useOnboarding";
import { useWorkspace } from "../../hooks/useWorkspace";

export function WelcomeModal() {
	const { welcomeSeenAt, dismissWelcome } = useOnboarding();
	const { activeWorkspace } = useWorkspace();
	const navigate = useNavigate();
	const [slide, setSlide] = useState(0);

	// Guard: don't render until we know the user is genuinely new AND has a
	// workspace to route into on slide 3.
	if (welcomeSeenAt !== null) return null;
	if (!activeWorkspace) return null;

	const totalSlides = 3;

	async function handleSkip() {
		await dismissWelcome();
	}

	async function handleCreateBrand() {
		await dismissWelcome();
		navigate("/brands/new");
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
			<div className="w-[min(560px,90vw)] rounded-2xl bg-white p-8 shadow-2xl">
				{slide === 0 && (
					<div>
						<h2 className="text-2xl font-semibold text-gray-900">Welcome to FCE 👋</h2>
						<p className="mt-3 text-gray-600">
							You're set up and ready to go. In the next 30 seconds, we'll show you how FCE
							helps you turn your brand into ready-to-post content.
						</p>
					</div>
				)}
				{slide === 1 && (
					<div>
						<h2 className="text-2xl font-semibold text-gray-900">Three steps from idea to post</h2>
						<ol className="mt-4 space-y-3 text-gray-700">
							<li>
								<strong>1. Brand</strong> — the voice, audience, and messaging rules your content
								follows.
							</li>
							<li>
								<strong>2. Product</strong> — a specific thing you want to talk about, inheriting
								the brand.
							</li>
							<li>
								<strong>3. Generate</strong> — pick a product, describe the angle, let AI write +
								design it.
							</li>
						</ol>
					</div>
				)}
				{slide === 2 && (
					<div>
						<h2 className="text-2xl font-semibold text-gray-900">Let's set up your first brand</h2>
						<p className="mt-3 text-gray-600">
							You'll give it a name, describe your audience, and paste any reference links you
							have. Takes about 2 minutes.
						</p>
					</div>
				)}

				<div className="mt-8 flex items-center justify-between">
					<div className="flex gap-1">
						{Array.from({ length: totalSlides }).map((_, i) => (
							<span
								key={i}
								className={`h-1.5 w-6 rounded-full ${
									i === slide ? "bg-indigo-600" : "bg-gray-200"
								}`}
							/>
						))}
					</div>

					<div className="flex items-center gap-2">
						{slide > 0 && (
							<button
								type="button"
								onClick={() => setSlide((s) => Math.max(0, s - 1))}
								className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
							>
								← Back
							</button>
						)}
						<button
							type="button"
							onClick={handleSkip}
							className="rounded-md px-3 py-2 text-sm text-gray-500 hover:bg-gray-100"
						>
							{slide === totalSlides - 1 ? "Skip for now" : "Skip"}
						</button>
						{slide < totalSlides - 1 ? (
							<button
								type="button"
								onClick={() => setSlide((s) => s + 1)}
								className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
							>
								Next →
							</button>
						) : (
							<button
								type="button"
								onClick={handleCreateBrand}
								className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
							>
								Create my first brand →
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
