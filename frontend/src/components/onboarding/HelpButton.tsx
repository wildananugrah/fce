import { useSearchParams } from "react-router-dom";
import { HelpCircle } from "lucide-react";

interface HelpButtonProps {
	/** Reserved for future page-specific routing; currently the signal is a URL flag. */
	pageKey: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function HelpButton({ pageKey: _pageKey }: HelpButtonProps) {
	const [searchParams, setSearchParams] = useSearchParams();

	function show() {
		searchParams.set("help", "1");
		setSearchParams(searchParams, { replace: true });
	}

	return (
		<button
			type="button"
			onClick={show}
			aria-label="Show tip for this page"
			title="Show tip"
			className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
		>
			<HelpCircle size={18} />
		</button>
	);
}
