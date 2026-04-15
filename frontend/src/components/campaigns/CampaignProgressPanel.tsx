import { Check, Loader2, AlertCircle } from "lucide-react";

type Stage = "extracting" | "summarizing" | "planning" | "topics";

interface CampaignProgressPanelProps {
  status: string;
  currentStage: Stage | null;
  errorMessage?: string | null;
  onRetry?: () => void;
}

const STAGES: { key: Stage; label: string }[] = [
  { key: "extracting", label: "Uploading & extracting PDF" },
  { key: "summarizing", label: "Writing summary" },
  { key: "planning", label: "Building campaign plan" },
  { key: "topics", label: "Generating topics" },
];

const STAGE_ORDER: Record<Stage, number> = {
  extracting: 0,
  summarizing: 1,
  planning: 2,
  topics: 3,
};

export function CampaignProgressPanel({
  status,
  currentStage,
  errorMessage,
  onRetry,
}: CampaignProgressPanelProps) {
  const failed = status === "failed";
  const currentIndex = currentStage ? STAGE_ORDER[currentStage] : -1;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">
          {failed ? "Generation failed" : "Generating your campaign"}
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          {failed
            ? "One of the stages hit an error. You can delete this campaign and try again."
            : "This takes around a minute. You can browse away and come back."}
        </p>
      </div>

      <ul className="space-y-2">
        {STAGES.map((stage, i) => {
          const done = !failed && i < currentIndex;
          const active = !failed && i === currentIndex;
          const pending = !failed && i > currentIndex;
          const broke = failed && currentStage === stage.key;
          return (
            <li key={stage.key} className="flex items-center gap-3 text-sm">
              <span className="w-5 h-5 flex items-center justify-center">
                {done && <Check size={16} className="text-green-600" />}
                {active && <Loader2 size={16} className="text-indigo-600 animate-spin" />}
                {broke && <AlertCircle size={16} className="text-red-600" />}
                {pending && <span className="w-2 h-2 rounded-full bg-gray-300" />}
              </span>
              <span
                className={
                  done
                    ? "text-gray-900"
                    : active
                      ? "text-indigo-700 font-medium"
                      : broke
                        ? "text-red-700 font-medium"
                        : "text-gray-400"
                }
              >
                {stage.label}
              </span>
            </li>
          );
        })}
      </ul>

      {failed && errorMessage && (
        <div className="bg-red-50 border border-red-100 rounded-md px-3 py-2 text-xs text-red-700">
          {errorMessage}
        </div>
      )}

      {failed && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm text-indigo-600 hover:underline"
        >
          Delete and try again →
        </button>
      )}
    </div>
  );
}
