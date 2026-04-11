import { useState, useEffect, useCallback } from "react";
import { Search, Plus, X, Trash2 } from "lucide-react";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";
import { SkillDetailModal } from "../components/skills/SkillDetailModal";
import { SkillFormModal } from "../components/skills/SkillFormModal";

// ─── Types ─────────────────────────────────────────────────────

interface Skill {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  isSystem: boolean;
  createdAt: string;
}

interface SkillMapping {
  id: string;
  workspaceId: string;
  skillId: string;
  generator: string;
  isActive: boolean;
  skill: { id: string; slug: string; name: string; description: string; category: string };
}

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

// ─── Constants ─────────────────────────────────────────────────

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "strategy", label: "Strategy" },
  { value: "content", label: "Content" },
  { value: "seo", label: "SEO" },
  { value: "conversion", label: "Conversion" },
  { value: "outreach", label: "Outreach" },
  { value: "research", label: "Research" },
  { value: "growth", label: "Growth" },
  { value: "other", label: "Other" },
];

const CATEGORY_COLORS: Record<string, string> = {
  strategy: "bg-violet-50 text-violet-700 border-violet-200",
  content: "bg-blue-50 text-blue-700 border-blue-200",
  seo: "bg-green-50 text-green-700 border-green-200",
  conversion: "bg-amber-50 text-amber-700 border-amber-200",
  outreach: "bg-pink-50 text-pink-700 border-pink-200",
  research: "bg-teal-50 text-teal-700 border-teal-200",
  growth: "bg-orange-50 text-orange-700 border-orange-200",
  other: "bg-gray-100 text-gray-600 border-gray-200",
};

const GENERATORS = [
  { key: "topic" as const, label: "Topic Generator" },
  { key: "content" as const, label: "Content Generator" },
  { key: "campaign" as const, label: "Campaign Generator" },
];

// ─── Page ──────────────────────────────────────────────────────

export function SkillsPage() {
  const { activeWorkspace } = useWorkspace();
  const [tab, setTab] = useState<"library" | "mappings">("library");
  const [toast, setToast] = useState<ToastState>(null);

  // Library state
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  // Detail modal
  const [detailSkillId, setDetailSkillId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Form modal
  const [formOpen, setFormOpen] = useState(false);
  const [editSkill, setEditSkill] = useState<{ id: string; name: string; description: string; category: string; content: string } | null>(null);

  // Mappings state
  const [mappings, setMappings] = useState<SkillMapping[]>([]);
  const [mappingsLoading, setMappingsLoading] = useState(true);

  // Add skill to generator modal
  const [addGeneratorModal, setAddGeneratorModal] = useState<"topic" | "content" | "campaign" | null>(null);
  const [addSearch, setAddSearch] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkActionRunning, setBulkActionRunning] = useState(false);

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
  };

  // ─── Load Skills ───────────────────────────────────────────

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category", categoryFilter);
      const qs = params.toString();
      const data = await api<Skill[]>(`/api/skills${qs ? `?${qs}` : ""}`);
      setSkills(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load skills", "error");
    } finally {
      setSkillsLoading(false);
    }
  }, [search, categoryFilter]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  // ─── Load Mappings ─────────────────────────────────────────

  const loadMappings = useCallback(async () => {
    if (!activeWorkspace) {
      setMappingsLoading(false);
      return;
    }
    setMappingsLoading(true);
    try {
      const data = await api<SkillMapping[]>(`/api/workspaces/${activeWorkspace.id}/skills`);
      setMappings(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load mappings", "error");
    } finally {
      setMappingsLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

  // ─── Handlers ──────────────────────────────────────────────

  const handleMapSkill = async (skillId: string, generator: string) => {
    if (!activeWorkspace) return;
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/skills/map`, {
        method: "POST",
        body: JSON.stringify({ skillId, generator }),
      });
      await loadMappings();
      setAddGeneratorModal(null);
      setAddSearch("");
      showToast("Skill mapped successfully", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to map skill", "error");
    }
  };

  const handleRemoveMapping = async (mappingId: string) => {
    if (!activeWorkspace) return;
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/skills/map/${mappingId}`, {
        method: "DELETE",
      });
      setMappings((prev) => prev.filter((m) => m.id !== mappingId));
      showToast("Skill removed", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to remove mapping", "error");
    }
  };

  const handleDeleteSkill = (skillId: string) => {
    setSkills((prev) => prev.filter((s) => s.id !== skillId));
    setMappings((prev) => prev.filter((m) => m.skillId !== skillId));
    setSelectedIds((prev) => {
      if (!prev.has(skillId)) return prev;
      const next = new Set(prev);
      next.delete(skillId);
      return next;
    });
    showToast("Skill deleted", "success");
  };

  const toggleSelect = (skillId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkActionRunning(true);
    try {
      const ids = Array.from(selectedIds);
      const result = await api<{ deleted: number }>(`/api/skills/bulk`, {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      });
      setSkills((prev) => prev.filter((s) => !selectedIds.has(s.id)));
      setMappings((prev) => prev.filter((m) => !selectedIds.has(m.skillId)));
      showToast(
        `Deleted ${result?.deleted ?? ids.length} skill${(result?.deleted ?? ids.length) > 1 ? "s" : ""}`,
        "success",
      );
      clearSelection();
      setShowBulkDeleteConfirm(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to delete skills", "error");
    } finally {
      setBulkActionRunning(false);
    }
  };

  const handleEditFromDetail = (skill: { id: string; name: string; description: string; category: string; content: string }) => {
    setEditSkill(skill);
    setFormOpen(true);
  };

  // ─── Derived Data ──────────────────────────────────────────

  const getMappingsForGenerator = (generator: string) =>
    mappings.filter((m) => m.generator === generator);

  const getUnmappedSkills = (generator: string) => {
    const mappedIds = new Set(getMappingsForGenerator(generator).map((m) => m.skillId));
    let filtered = skills.filter((s) => !mappedIds.has(s.id));
    if (addSearch) {
      const q = addSearch.toLowerCase();
      filtered = filtered.filter(
        (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
      );
    }
    return filtered;
  };

  // Force to the library tab if there is no workspace, since mappings are workspace-scoped.
  const effectiveTab = !activeWorkspace ? "library" : tab;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black">AI Skills</h1>
          <p className="text-sm text-gray-500 mt-1">
            Browse the skill library and configure which skills power each generator.
          </p>
        </div>
        <Button onClick={() => { setEditSkill(null); setFormOpen(true); }}>
          <Plus size={14} className="mr-1.5" />
          Add Custom Skill
        </Button>
      </div>

      {!activeWorkspace && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          You're browsing the global skill library. Create a workspace to map skills to generators.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab("library")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            effectiveTab === "library"
              ? "border-black text-black"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Skill Library
        </button>
        <button
          type="button"
          onClick={() => activeWorkspace && setTab("mappings")}
          disabled={!activeWorkspace}
          title={!activeWorkspace ? "Create a workspace to configure mappings" : undefined}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            effectiveTab === "mappings"
              ? "border-black text-black"
              : "border-transparent text-gray-500 hover:text-gray-700"
          } ${!activeWorkspace ? "opacity-40 cursor-not-allowed" : ""}`}
        >
          Generator Mappings
        </button>
      </div>

      {/* Tab Content */}
      {effectiveTab === "library" && (
        <div className="space-y-4">
          {/* Search + Filter */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search skills..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black placeholder:text-gray-400"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Skills Grid */}
          {skillsLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : skills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 bg-white border border-gray-200 rounded-xl">
              <p className="text-base font-semibold text-gray-700">No skills found</p>
              <p className="text-sm text-gray-400 mt-1">
                {search || categoryFilter ? "Try adjusting your filters." : "Add a custom skill to get started."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {skills.map((skill) => {
                const catColor = CATEGORY_COLORS[skill.category] ?? CATEGORY_COLORS.other;
                const isSelected = selectedIds.has(skill.id);
                const canSelect = !skill.isSystem;
                return (
                  <div
                    key={skill.id}
                    className={`group relative bg-white border rounded-xl p-4 transition-all space-y-3 ${
                      isSelected
                        ? "border-indigo-400 ring-2 ring-indigo-100"
                        : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                    }`}
                  >
                    {/* Checkbox (custom skills only) */}
                    {canSelect && (
                      <label
                        className={`absolute top-3 left-3 z-10 flex items-center justify-center cursor-pointer ${
                          isSelected || selectedIds.size > 0
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100"
                        } transition-opacity`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleSelect(skill.id)}
                        />
                      </label>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setDetailSkillId(skill.id);
                        setDetailOpen(true);
                      }}
                      className={`w-full text-left space-y-3 ${canSelect ? "pl-7" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 leading-snug">
                          {skill.name}
                        </h3>
                        <span
                          className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                            skill.isSystem
                              ? "bg-gray-100 text-gray-600 border-gray-200"
                              : "bg-indigo-50 text-indigo-700 border-indigo-200"
                          }`}
                        >
                          {skill.isSystem ? "System" : "Custom"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2">{skill.description}</p>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${catColor}`}
                      >
                        {skill.category}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {effectiveTab === "mappings" && (
        <div>
          {mappingsLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {GENERATORS.map((gen) => {
                const genMappings = getMappingsForGenerator(gen.key);
                return (
                  <div key={gen.key} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">{gen.label}</h3>
                      <span className="text-xs text-gray-400">{genMappings.length} skill{genMappings.length !== 1 ? "s" : ""}</span>
                    </div>

                    {/* Mapped skills */}
                    <div className="flex flex-wrap gap-2 min-h-[32px]">
                      {genMappings.length === 0 ? (
                        <p className="text-xs text-gray-400">No skills mapped</p>
                      ) : (
                        genMappings.map((m) => (
                          <span
                            key={m.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                          >
                            {m.skill.name}
                            <button
                              type="button"
                              onClick={() => handleRemoveMapping(m.id)}
                              className="text-indigo-400 hover:text-indigo-700 transition-colors"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))
                      )}
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setAddGeneratorModal(gen.key); setAddSearch(""); }}
                    >
                      <Plus size={12} className="mr-1" />
                      Add Skill
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add Skill to Generator Modal */}
      <Modal
        isOpen={addGeneratorModal !== null}
        onClose={() => { setAddGeneratorModal(null); setAddSearch(""); }}
        title={`Add Skill to ${GENERATORS.find((g) => g.key === addGeneratorModal)?.label ?? "Generator"}`}
        size="md"
      >
        <div className="space-y-4">
          <Input
            placeholder="Search skills..."
            value={addSearch}
            onChange={(e) => setAddSearch(e.target.value)}
          />
          <div className="max-h-72 overflow-y-auto space-y-1">
            {addGeneratorModal && getUnmappedSkills(addGeneratorModal).length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No available skills to add.</p>
            ) : (
              addGeneratorModal &&
              getUnmappedSkills(addGeneratorModal).map((skill) => {
                const catColor = CATEGORY_COLORS[skill.category] ?? CATEGORY_COLORS.other;
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => handleMapSkill(skill.id, addGeneratorModal)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{skill.name}</p>
                      <p className="text-xs text-gray-500 truncate">{skill.description}</p>
                    </div>
                    <span className={`shrink-0 ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${catColor}`}>
                      {skill.category}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      {/* Skill Detail Modal */}
      <SkillDetailModal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        skillId={detailSkillId}
        onEdit={handleEditFromDetail}
        onDelete={handleDeleteSkill}
      />

      {/* Skill Form Modal */}
      <SkillFormModal
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditSkill(null); }}
        editSkill={editSkill}
        onSaved={() => { loadSkills(); loadMappings(); }}
      />

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-gray-900 text-white rounded-xl shadow-2xl border border-gray-800 px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-medium">
            {selectedIds.size} skill{selectedIds.size > 1 ? "s" : ""} selected
          </span>
          <div className="w-px h-5 bg-gray-700" />
          <button
            type="button"
            onClick={() => setShowBulkDeleteConfirm(true)}
            disabled={bulkActionRunning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors"
          >
            <Trash2 size={13} />
            Delete
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={bulkActionRunning}
            className="p-1.5 text-gray-400 hover:text-white rounded disabled:opacity-50 transition-colors"
            title="Clear selection"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Bulk Delete Confirm Modal */}
      {showBulkDeleteConfirm && (
        <Modal
          isOpen
          onClose={() => setShowBulkDeleteConfirm(false)}
          title="Delete Skills"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Delete {selectedIds.size} selected custom skill
              {selectedIds.size > 1 ? "s" : ""}? This will also remove any generator mappings for
              these skills. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowBulkDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleBulkDelete}
                loading={bulkActionRunning}
              >
                Delete {selectedIds.size}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
