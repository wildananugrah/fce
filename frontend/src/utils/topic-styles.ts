// Shared visual mappings for topic rows so Planner + Topic Library look the
// same (and stay the same when format/status taxonomies grow).

export function getFormatStyle(format?: string | null): { className: string; icon: string } {
  if (!format) return { className: "bg-gray-100 text-gray-600", icon: "" };
  const f = format.toLowerCase();
  if (f.includes("carousel")) return { className: "bg-blue-50 text-blue-700", icon: "🎠" };
  if (f.includes("reel") || f.includes("video") || f.includes("short"))
    return { className: "bg-red-50 text-red-700", icon: "🎬" };
  if (f.includes("story")) return { className: "bg-purple-50 text-purple-700", icon: "📱" };
  if (f.includes("single") || f.includes("image"))
    return { className: "bg-indigo-50 text-indigo-700", icon: "🖼️" };
  if (f.includes("thread")) return { className: "bg-amber-50 text-amber-700", icon: "📝" };
  return { className: "bg-gray-100 text-gray-600", icon: "" };
}

export function getStatusColor(status: string): string {
  if (status === "approved") return "bg-green-50 text-green-700 border-green-200";
  if (status === "published") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "scheduled") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "archived") return "bg-gray-100 text-gray-500 border-gray-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}
