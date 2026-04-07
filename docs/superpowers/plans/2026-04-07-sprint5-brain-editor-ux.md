# Sprint 5: 3-Panel Brain Editor & UX Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign brand and product detail views from modal-based to dedicated page routes with 3-panel layout (section nav + editor + context panel). Replace raw JSON textareas with structured form inputs.

**Architecture:** New page routes `/brands/:id` and `/products/:id`. Each brand has 10 sections, each product has 11 sections. Section data maps to brain version fields. Right panel shows version info and recommendations.

**Tech Stack:** React 19, React Router 7, Tailwind CSS 4, TypeScript

**Prerequisite:** Sprints 1-4 completed.

---

## Task 1: Add Brand and Product Detail Routes

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/pages/BrandDetailPage.tsx`
- Create: `frontend/src/pages/ProductDetailPage.tsx`

- [ ] **Step 1: Add routes to App.tsx**

In `frontend/src/App.tsx`, add these routes inside the protected routes section:

```tsx
<Route path="/brands/:id" element={<BrandDetailPage />} />
<Route path="/products/:id" element={<ProductDetailPage />} />
```

Add imports:

```typescript
import { BrandDetailPage } from "./pages/BrandDetailPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
```

- [ ] **Step 2: Create BrandDetailPage skeleton**

Create `frontend/src/pages/BrandDetailPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";

const BRAND_SECTIONS = [
	{ key: "overview", label: "Overview" },
	{ key: "identity", label: "Identity" },
	{ key: "tone", label: "Tone of Voice" },
	{ key: "audience", label: "Audience Persona" },
	{ key: "messaging", label: "Messaging Rules" },
	{ key: "vocabulary", label: "Vocabulary" },
	{ key: "visual", label: "Visual Direction" },
	{ key: "cultural", label: "Cultural Relevance" },
	{ key: "documents", label: "Documents" },
	{ key: "versions", label: "Brain Versions" },
];

export function BrandDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { activeWorkspace } = useWorkspace();
	const [brand, setBrand] = useState<any>(null);
	const [activeBrain, setActiveBrain] = useState<any>(null);
	const [activeSection, setActiveSection] = useState("overview");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

	// Editable fields
	const [name, setName] = useState("");
	const [category, setCategory] = useState("");
	const [websiteUrl, setWebsiteUrl] = useState("");
	const [personality, setPersonality] = useState("");
	const [tone, setTone] = useState("");
	const [audiencePersonas, setAudiencePersonas] = useState<{ name: string; description: string }[]>([]);
	const [values, setValues] = useState<string[]>([]);
	const [messagingDo, setMessagingDo] = useState<string[]>([]);
	const [messagingDont, setMessagingDont] = useState<string[]>([]);
	const [vocabPreferred, setVocabPreferred] = useState<string[]>([]);
	const [vocabAvoided, setVocabAvoided] = useState<string[]>([]);
	const [visualNotes, setVisualNotes] = useState("");
	const [culturalNotes, setCulturalNotes] = useState("");

	useEffect(() => {
		if (!activeWorkspace || !id) return;
		setLoading(true);
		api<any>(`/api/workspaces/${activeWorkspace.id}/brands/${id}`)
			.then((data) => {
				setBrand(data);
				setName(data.name || "");
				setCategory(data.category || "");
				setWebsiteUrl(data.websiteUrl || "");

				const brain = data.brainVersions?.find((v: any) => v.isActive);
				if (brain) {
					setActiveBrain(brain);
					setPersonality(brain.personality || "");
					setTone(brain.tone || "");
					setAudiencePersonas(
						Array.isArray(brain.audiencePersonas) ? brain.audiencePersonas : [],
					);
					setValues(Array.isArray(brain.values) ? brain.values : []);
					setMessagingDo(
						brain.messagingRules?.do || [],
					);
					setMessagingDont(
						brain.messagingRules?.dont || [],
					);
					const vocab = brain.vocabulary || {};
					setVocabPreferred(Array.isArray(vocab.preferred) ? vocab.preferred : []);
					setVocabAvoided(Array.isArray(vocab.avoided) ? vocab.avoided : []);
					setVisualNotes(
						typeof brain.vocabulary === "object" ? "" : "",
					);
				}
			})
			.catch(() => navigate("/brands"))
			.finally(() => setLoading(false));
	}, [activeWorkspace, id]);

	const handleSaveBrand = async () => {
		if (!activeWorkspace || !id) return;
		setSaving(true);
		try {
			await api(`/api/workspaces/${activeWorkspace.id}/brands/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, category, websiteUrl }),
			});
			setToast({ message: "Brand updated", type: "success" });
		} catch {
			setToast({ message: "Failed to update brand", type: "error" });
		} finally {
			setSaving(false);
		}
	};

	const handleSaveBrainVersion = async () => {
		if (!activeWorkspace || !id) return;
		setSaving(true);
		try {
			await api(`/api/workspaces/${activeWorkspace.id}/brands/${id}/brain-versions`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					personality,
					tone,
					audiencePersonas,
					values,
					messagingRules: { do: messagingDo, dont: messagingDont },
					vocabulary: { preferred: vocabPreferred, avoided: vocabAvoided },
				}),
			});
			setToast({ message: "Brain version saved", type: "success" });
		} catch {
			setToast({ message: "Failed to save brain version", type: "error" });
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center h-64">
				<Spinner size="lg" />
			</div>
		);
	}

	const renderArrayEditor = (
		items: string[],
		setItems: (items: string[]) => void,
		placeholder: string,
	) => (
		<div className="space-y-2">
			{items.map((item, idx) => (
				<div key={idx} className="flex gap-2">
					<input
						className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-black"
						value={item}
						onChange={(e) => {
							const updated = [...items];
							updated[idx] = e.target.value;
							setItems(updated);
						}}
					/>
					<button
						onClick={() => setItems(items.filter((_, i) => i !== idx))}
						className="text-xs text-red-500 hover:text-red-700 px-2"
					>
						Remove
					</button>
				</div>
			))}
			<button
				onClick={() => setItems([...items, ""])}
				className="text-xs text-blue-600 hover:text-blue-800"
			>
				+ Add item
			</button>
		</div>
	);

	return (
		<div className="flex h-full">
			{/* Left: Section Nav */}
			<div className="w-48 border-r border-gray-200 p-4 space-y-1">
				<button onClick={() => navigate("/brands")} className="text-xs text-gray-400 hover:text-black mb-4 block">
					&larr; Back to Brands
				</button>
				{BRAND_SECTIONS.map((section) => (
					<button
						key={section.key}
						onClick={() => setActiveSection(section.key)}
						className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
							activeSection === section.key
								? "bg-black text-white"
								: "text-gray-600 hover:bg-gray-100"
						}`}
					>
						{section.label}
					</button>
				))}
			</div>

			{/* Center: Editor */}
			<div className="flex-1 p-6 overflow-y-auto">
				<div className="max-w-2xl">
					<h1 className="text-xl font-semibold mb-6">{brand?.name || "Brand Detail"}</h1>

					{activeSection === "overview" && (
						<div className="space-y-4">
							<Input label="Brand Name" value={name} onChange={(e) => setName(e.target.value)} />
							<Input label="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
							<Input label="Website URL" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
							<Button onClick={handleSaveBrand} loading={saving}>Save Overview</Button>
						</div>
					)}

					{activeSection === "identity" && (
						<div className="space-y-4">
							<div>
								<label className="text-xs font-medium text-gray-700">Personality</label>
								<textarea
									className="w-full mt-1 border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-black"
									rows={4}
									value={personality}
									onChange={(e) => setPersonality(e.target.value)}
									placeholder="Describe the brand's personality..."
								/>
							</div>
							<Button onClick={handleSaveBrainVersion} loading={saving}>Save Brain Version</Button>
						</div>
					)}

					{activeSection === "tone" && (
						<div className="space-y-4">
							<div>
								<label className="text-xs font-medium text-gray-700">Tone of Voice</label>
								<textarea
									className="w-full mt-1 border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-black"
									rows={4}
									value={tone}
									onChange={(e) => setTone(e.target.value)}
									placeholder="Describe the brand's tone of voice..."
								/>
							</div>
							<Button onClick={handleSaveBrainVersion} loading={saving}>Save Brain Version</Button>
						</div>
					)}

					{activeSection === "audience" && (
						<div className="space-y-4">
							<h3 className="text-sm font-medium">Audience Personas</h3>
							{audiencePersonas.map((persona, idx) => (
								<div key={idx} className="border border-gray-100 rounded-lg p-3 space-y-2">
									<Input
										label="Persona Name"
										value={persona.name}
										onChange={(e) => {
											const updated = [...audiencePersonas];
											updated[idx] = { ...updated[idx], name: e.target.value };
											setAudiencePersonas(updated);
										}}
									/>
									<div>
										<label className="text-xs font-medium text-gray-700">Description</label>
										<textarea
											className="w-full mt-1 border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-black"
											rows={2}
											value={persona.description}
											onChange={(e) => {
												const updated = [...audiencePersonas];
												updated[idx] = { ...updated[idx], description: e.target.value };
												setAudiencePersonas(updated);
											}}
										/>
									</div>
									<button
										onClick={() => setAudiencePersonas(audiencePersonas.filter((_, i) => i !== idx))}
										className="text-xs text-red-500"
									>
										Remove persona
									</button>
								</div>
							))}
							<button
								onClick={() => setAudiencePersonas([...audiencePersonas, { name: "", description: "" }])}
								className="text-xs text-blue-600"
							>
								+ Add persona
							</button>
							<Button onClick={handleSaveBrainVersion} loading={saving}>Save Brain Version</Button>
						</div>
					)}

					{activeSection === "messaging" && (
						<div className="space-y-4">
							<div>
								<h3 className="text-sm font-medium mb-2">Do's</h3>
								{renderArrayEditor(messagingDo, setMessagingDo, "Add a messaging do...")}
							</div>
							<div>
								<h3 className="text-sm font-medium mb-2">Don'ts</h3>
								{renderArrayEditor(messagingDont, setMessagingDont, "Add a messaging don't...")}
							</div>
							<Button onClick={handleSaveBrainVersion} loading={saving}>Save Brain Version</Button>
						</div>
					)}

					{activeSection === "vocabulary" && (
						<div className="space-y-4">
							<div>
								<h3 className="text-sm font-medium mb-2">Preferred Words</h3>
								{renderArrayEditor(vocabPreferred, setVocabPreferred, "Add preferred word...")}
							</div>
							<div>
								<h3 className="text-sm font-medium mb-2">Words to Avoid</h3>
								{renderArrayEditor(vocabAvoided, setVocabAvoided, "Add word to avoid...")}
							</div>
							<Button onClick={handleSaveBrainVersion} loading={saving}>Save Brain Version</Button>
						</div>
					)}

					{activeSection === "visual" && (
						<div className="space-y-4">
							<div>
								<label className="text-xs font-medium text-gray-700">Visual Direction Notes</label>
								<textarea
									className="w-full mt-1 border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-black"
									rows={6}
									value={visualNotes}
									onChange={(e) => setVisualNotes(e.target.value)}
									placeholder="Describe visual direction: mood, colors, style, composition..."
								/>
							</div>
							<Button onClick={handleSaveBrainVersion} loading={saving}>Save Brain Version</Button>
						</div>
					)}

					{activeSection === "cultural" && (
						<div className="space-y-4">
							<div>
								<label className="text-xs font-medium text-gray-700">Cultural Relevance Notes</label>
								<textarea
									className="w-full mt-1 border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-black"
									rows={6}
									value={culturalNotes}
									onChange={(e) => setCulturalNotes(e.target.value)}
									placeholder="Market context, cultural notes, local considerations..."
								/>
							</div>
							<Button onClick={handleSaveBrainVersion} loading={saving}>Save Brain Version</Button>
						</div>
					)}

					{activeSection === "versions" && (
						<div className="space-y-3">
							<h3 className="text-sm font-medium">Brain Version History</h3>
							{brand?.brainVersions?.map((v: any) => (
								<div key={v.id} className="border border-gray-100 rounded-lg p-3 flex items-center justify-between">
									<div>
										<span className="text-sm font-medium">Version {v.version}</span>
										<span className="text-xs text-gray-400 ml-2">
											{new Date(v.createdAt).toLocaleDateString()}
										</span>
									</div>
									<Badge variant={v.isActive ? "success" : "default"}>
										{v.isActive ? "Active" : "Inactive"}
									</Badge>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Right: Context Panel */}
			<div className="w-64 border-l border-gray-200 p-4 space-y-4">
				<div>
					<h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</h3>
					<Badge variant={brand?.status === "active" ? "success" : "default"} className="mt-1">
						{brand?.status}
					</Badge>
				</div>
				<div>
					<h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Active Version</h3>
					<p className="text-sm mt-1">{activeBrain ? `v${activeBrain.version}` : "None"}</p>
				</div>
				<div>
					<h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Versions</h3>
					<p className="text-sm mt-1">{brand?.brainVersions?.length || 0}</p>
				</div>
				<div>
					<h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created</h3>
					<p className="text-sm mt-1">
						{brand?.createdAt ? new Date(brand.createdAt).toLocaleDateString() : "-"}
					</p>
				</div>
			</div>

			{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
		</div>
	);
}
```

- [ ] **Step 3: Create ProductDetailPage**

Create `frontend/src/pages/ProductDetailPage.tsx` following the same 3-panel pattern but with product-specific sections:

```tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";

const PRODUCT_SECTIONS = [
	{ key: "overview", label: "Overview" },
	{ key: "usp", label: "USP & RTB" },
	{ key: "benefits", label: "Benefits" },
	{ key: "audience", label: "Audience Fit" },
	{ key: "claims", label: "Claims & Disclaimers" },
	{ key: "angles", label: "Content Angles" },
	{ key: "versions", label: "Brain Versions" },
];

export function ProductDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { activeWorkspace } = useWorkspace();
	const [product, setProduct] = useState<any>(null);
	const [activeBrain, setActiveBrain] = useState<any>(null);
	const [activeSection, setActiveSection] = useState("overview");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

	const [name, setName] = useState("");
	const [type, setType] = useState("");
	const [usp, setUsp] = useState("");
	const [rtb, setRtb] = useState("");
	const [functionalBenefits, setFunctionalBenefits] = useState<string[]>([]);
	const [emotionalBenefits, setEmotionalBenefits] = useState<string[]>([]);
	const [targetAudience, setTargetAudience] = useState("");
	const [claims, setClaims] = useState<string[]>([]);
	const [disclaimers, setDisclaimers] = useState<string[]>([]);

	useEffect(() => {
		if (!activeWorkspace || !id) return;
		setLoading(true);
		api<any>(`/api/workspaces/${activeWorkspace.id}/products/${id}`)
			.then((data) => {
				setProduct(data);
				setName(data.name || "");
				setType(data.type || "");

				const brain = data.brainVersions?.find((v: any) => v.isActive);
				if (brain) {
					setActiveBrain(brain);
					setUsp(brain.usp || "");
					setRtb(brain.rtb || "");
					setFunctionalBenefits(Array.isArray(brain.functionalBenefits) ? brain.functionalBenefits : []);
					setEmotionalBenefits(Array.isArray(brain.emotionalBenefits) ? brain.emotionalBenefits : []);
					setTargetAudience(brain.targetAudience || "");
					setClaims(Array.isArray(brain.claims) ? brain.claims : []);
					setDisclaimers(Array.isArray(brain.disclaimers) ? brain.disclaimers : []);
				}
			})
			.catch(() => navigate("/products"))
			.finally(() => setLoading(false));
	}, [activeWorkspace, id]);

	const handleSaveProduct = async () => {
		if (!activeWorkspace || !id) return;
		setSaving(true);
		try {
			await api(`/api/workspaces/${activeWorkspace.id}/products/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, type }),
			});
			setToast({ message: "Product updated", type: "success" });
		} catch {
			setToast({ message: "Failed to update", type: "error" });
		} finally {
			setSaving(false);
		}
	};

	const handleSaveBrainVersion = async () => {
		if (!activeWorkspace || !id) return;
		setSaving(true);
		try {
			await api(`/api/workspaces/${activeWorkspace.id}/products/${id}/brain-versions`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					usp,
					rtb,
					functionalBenefits,
					emotionalBenefits,
					targetAudience,
					claims,
					disclaimers,
				}),
			});
			setToast({ message: "Brain version saved", type: "success" });
		} catch {
			setToast({ message: "Failed to save", type: "error" });
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
	}

	const renderArrayEditor = (items: string[], setItems: (items: string[]) => void) => (
		<div className="space-y-2">
			{items.map((item, idx) => (
				<div key={idx} className="flex gap-2">
					<input
						className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-black"
						value={item}
						onChange={(e) => {
							const updated = [...items];
							updated[idx] = e.target.value;
							setItems(updated);
						}}
					/>
					<button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-xs text-red-500 px-2">Remove</button>
				</div>
			))}
			<button onClick={() => setItems([...items, ""])} className="text-xs text-blue-600">+ Add item</button>
		</div>
	);

	return (
		<div className="flex h-full">
			<div className="w-48 border-r border-gray-200 p-4 space-y-1">
				<button onClick={() => navigate("/products")} className="text-xs text-gray-400 hover:text-black mb-4 block">&larr; Back to Products</button>
				{PRODUCT_SECTIONS.map((section) => (
					<button
						key={section.key}
						onClick={() => setActiveSection(section.key)}
						className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${activeSection === section.key ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"}`}
					>
						{section.label}
					</button>
				))}
			</div>

			<div className="flex-1 p-6 overflow-y-auto">
				<div className="max-w-2xl">
					<h1 className="text-xl font-semibold mb-6">{product?.name || "Product Detail"}</h1>

					{activeSection === "overview" && (
						<div className="space-y-4">
							<Input label="Product Name" value={name} onChange={(e) => setName(e.target.value)} />
							<Input label="Type" value={type} onChange={(e) => setType(e.target.value)} />
							<Button onClick={handleSaveProduct} loading={saving}>Save Overview</Button>
						</div>
					)}

					{activeSection === "usp" && (
						<div className="space-y-4">
							<div>
								<label className="text-xs font-medium text-gray-700">Unique Selling Proposition</label>
								<textarea className="w-full mt-1 border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-black" rows={4} value={usp} onChange={(e) => setUsp(e.target.value)} />
							</div>
							<div>
								<label className="text-xs font-medium text-gray-700">Reason to Believe</label>
								<textarea className="w-full mt-1 border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-black" rows={4} value={rtb} onChange={(e) => setRtb(e.target.value)} />
							</div>
							<Button onClick={handleSaveBrainVersion} loading={saving}>Save Brain Version</Button>
						</div>
					)}

					{activeSection === "benefits" && (
						<div className="space-y-4">
							<div>
								<h3 className="text-sm font-medium mb-2">Functional Benefits</h3>
								{renderArrayEditor(functionalBenefits, setFunctionalBenefits)}
							</div>
							<div>
								<h3 className="text-sm font-medium mb-2">Emotional Benefits</h3>
								{renderArrayEditor(emotionalBenefits, setEmotionalBenefits)}
							</div>
							<Button onClick={handleSaveBrainVersion} loading={saving}>Save Brain Version</Button>
						</div>
					)}

					{activeSection === "audience" && (
						<div className="space-y-4">
							<div>
								<label className="text-xs font-medium text-gray-700">Target Audience</label>
								<textarea className="w-full mt-1 border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-black" rows={4} value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} />
							</div>
							<Button onClick={handleSaveBrainVersion} loading={saving}>Save Brain Version</Button>
						</div>
					)}

					{activeSection === "claims" && (
						<div className="space-y-4">
							<div>
								<h3 className="text-sm font-medium mb-2">Key Claims</h3>
								{renderArrayEditor(claims, setClaims)}
							</div>
							<div>
								<h3 className="text-sm font-medium mb-2">Mandatory Disclaimers</h3>
								{renderArrayEditor(disclaimers, setDisclaimers)}
							</div>
							<Button onClick={handleSaveBrainVersion} loading={saving}>Save Brain Version</Button>
						</div>
					)}

					{activeSection === "angles" && (
						<p className="text-sm text-gray-400">Content angles will be available in a future update.</p>
					)}

					{activeSection === "versions" && (
						<div className="space-y-3">
							<h3 className="text-sm font-medium">Brain Version History</h3>
							{product?.brainVersions?.map((v: any) => (
								<div key={v.id} className="border border-gray-100 rounded-lg p-3 flex items-center justify-between">
									<div>
										<span className="text-sm font-medium">Version {v.version}</span>
										<span className="text-xs text-gray-400 ml-2">{new Date(v.createdAt).toLocaleDateString()}</span>
									</div>
									<Badge variant={v.isActive ? "success" : "default"}>{v.isActive ? "Active" : "Inactive"}</Badge>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			<div className="w-64 border-l border-gray-200 p-4 space-y-4">
				<div>
					<h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</h3>
					<Badge variant={product?.status === "active" ? "success" : "default"} className="mt-1">{product?.status}</Badge>
				</div>
				<div>
					<h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Brand</h3>
					<p className="text-sm mt-1">{product?.brand?.name || "-"}</p>
				</div>
				<div>
					<h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Active Version</h3>
					<p className="text-sm mt-1">{activeBrain ? `v${activeBrain.version}` : "None"}</p>
				</div>
				<div>
					<h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created</h3>
					<p className="text-sm mt-1">{product?.createdAt ? new Date(product.createdAt).toLocaleDateString() : "-"}</p>
				</div>
			</div>

			{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
		</div>
	);
}
```

- [ ] **Step 4: Build frontend**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add frontend/src/App.tsx \
        frontend/src/pages/BrandDetailPage.tsx \
        frontend/src/pages/ProductDetailPage.tsx
git commit -m "feat: add 3-panel brand and product detail pages with structured editors"
```

---

## Task 2: Update BrandsPage and ProductsPage to Navigate to Detail Pages

**Files:**
- Modify: `frontend/src/pages/BrandsPage.tsx`
- Modify: `frontend/src/pages/ProductsPage.tsx`

- [ ] **Step 1: Update BrandsPage to link to detail page**

In `frontend/src/pages/BrandsPage.tsx`, update the brand card/row click handler to navigate to `/brands/:id` instead of opening a modal:

```typescript
import { useNavigate } from "react-router-dom";

// Inside the component:
const navigate = useNavigate();

// Update the onRowClick or card click:
onClick={() => navigate(`/brands/${brand.id}`)}
```

Keep the create brand modal but remove the detail modal view (or keep it as fallback).

- [ ] **Step 2: Update ProductsPage similarly**

In `frontend/src/pages/ProductsPage.tsx`, update product click to navigate to `/products/:id`.

- [ ] **Step 3: Build frontend**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add frontend/src/pages/BrandsPage.tsx \
        frontend/src/pages/ProductsPage.tsx
git commit -m "feat: link brand and product list pages to 3-panel detail pages"
```

---

## Task 3: Final Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test`
Expected: All tests PASS

- [ ] **Step 2: Run frontend build**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Type check**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run typecheck`
Expected: No errors
