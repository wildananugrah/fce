import { useState } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import { Toast } from "../ui/Toast";
import type { OutputSection } from "../../types";

interface SectionViewerProps {
	sections: OutputSection[];
	workspaceId: string;
	outputId: string;
	onSectionUpdated: () => void;
}

const SECTION_LABELS: Record<string, string> = {
	hook: "Hooks",
	caption: "Caption",
	cta: "CTA",
	hashtag: "Hashtags",
	visual_direction: "Visual Direction",
	rationale: "Rationale",
};

const SECTION_ORDER = ["hook", "caption", "cta", "hashtag", "visual_direction", "rationale"];

export function SectionViewer({ sections, workspaceId, outputId, onSectionUpdated }: SectionViewerProps) {
	const [activeTab, setActiveTab] = useState(SECTION_ORDER[0]);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editText, setEditText] = useState("");
	const [saving, setSaving] = useState(false);
	const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

	const groupedSections: Record<string, OutputSection[]> = {};
	for (const section of sections) {
		if (!groupedSections[section.sectionType]) {
			groupedSections[section.sectionType] = [];
		}
		groupedSections[section.sectionType].push(section);
	}

	const availableTabs = SECTION_ORDER.filter((type) => groupedSections[type]?.length > 0);

	const handleEdit = (section: OutputSection) => {
		setEditingId(section.id);
		setEditText(section.contentText);
	};

	const handleSave = async (sectionId: string) => {
		setSaving(true);
		try {
			await api(`/api/workspaces/${workspaceId}/library/${outputId}/sections/${sectionId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ contentText: editText }),
			});
			setEditingId(null);
			setToast({ message: "Section updated", type: "success" });
			onSectionUpdated();
		} catch {
			setToast({ message: "Failed to update section", type: "error" });
		} finally {
			setSaving(false);
		}
	};

	if (sections.length === 0) {
		return <p className="text-xs text-gray-400">No sections available for this output.</p>;
	}

	return (
		<div>
			<div className="flex gap-1 border-b border-gray-200 mb-4">
				{availableTabs.map((type) => (
					<button
						key={type}
						onClick={() => setActiveTab(type)}
						className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
							activeTab === type
								? "border-black text-black"
								: "border-transparent text-gray-500 hover:text-gray-700"
						}`}
					>
						{SECTION_LABELS[type] || type}
					</button>
				))}
			</div>

			<div className="space-y-3">
				{(groupedSections[activeTab] || []).map((section, idx) => (
					<div key={section.id} className="border border-gray-100 rounded-lg p-3">
						{(groupedSections[activeTab] || []).length > 1 && (
							<p className="text-xs text-gray-400 mb-2">Option {idx + 1}</p>
						)}

						{editingId === section.id ? (
							<div>
								<textarea
									className="w-full border border-gray-300 rounded p-2 text-sm min-h-[100px] focus:outline-none focus:border-black"
									value={editText}
									onChange={(e) => setEditText(e.target.value)}
								/>
								<div className="flex gap-2 mt-2">
									<Button size="sm" onClick={() => handleSave(section.id)} loading={saving}>
										Save
									</Button>
									<Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
										Cancel
									</Button>
								</div>
							</div>
						) : (
							<div>
								<p className="text-sm whitespace-pre-wrap">{section.contentText}</p>
								<button
									onClick={() => handleEdit(section)}
									className="text-xs text-gray-400 hover:text-black mt-2"
								>
									Edit
								</button>
							</div>
						)}
					</div>
				))}
			</div>

			{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
		</div>
	);
}
