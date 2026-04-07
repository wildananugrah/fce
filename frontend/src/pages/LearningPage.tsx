import {
  Rocket,
  BarChart2,
  Zap,
  Brain,
  Package,
} from "lucide-react";

interface LearningCard {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}

const CARDS: LearningCard[] = [
  {
    icon: <Rocket className="w-5 h-5" />,
    title: "Getting Started",
    description:
      "Learn how to create your first workspace, add a brand, set up a product, and generate your first piece of content with FCE Dashboard.",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: <BarChart2 className="w-5 h-5" />,
    title: "Content Frameworks",
    description:
      "Understand the proven copywriting frameworks built into the generator: AIDA (Attention, Interest, Desire, Action), PAS (Problem, Agitate, Solve), and BAB (Before, After, Bridge).",
    color: "bg-purple-50 text-purple-600",
  },
  {
    icon: <Zap className="w-5 h-5" />,
    title: "Hook Types",
    description:
      "Discover when to use each hook type — curiosity hooks, pain point hooks, bold statement hooks, story hooks, and more — to maximise engagement for your audience.",
    color: "bg-amber-50 text-amber-600",
  },
  {
    icon: <Brain className="w-5 h-5" />,
    title: "Brand Brain",
    description:
      "Set up your Brand Brain to define your brand's personality, tone of voice, audience personas, values, and vocabulary. This context guides every generation.",
    color: "bg-green-50 text-green-600",
  },
  {
    icon: <Package className="w-5 h-5" />,
    title: "Product Brain",
    description:
      "Configure your Product Brain with your product's unique selling proposition (USP), reasons to believe (RTB), key benefits, and target customer profile.",
    color: "bg-rose-50 text-rose-600",
  },
];

export function LearningPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-black">Learning Center</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Resources to help you get the most out of FCE Dashboard.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => (
          <div
            key={card.title}
            className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 hover:border-gray-300 transition-colors"
          >
            <div className={`inline-flex p-2 rounded-lg ${card.color}`}>{card.icon}</div>
            <div>
              <h2 className="text-sm font-semibold text-black">{card.title}</h2>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{card.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-xs text-gray-500">
          More guides, video walkthroughs, and API documentation are on the way. Check back soon.
        </p>
      </div>
    </div>
  );
}
