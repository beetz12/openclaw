export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  error?: boolean;
  taskDispatch?: { taskId: string; title: string };
  intentClarify?: { question: string; options: string[] };
  teamSuggest?: { role: string; description: string };
};

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  description: string;
  skills: string[];
  required: boolean;
  active: boolean;
};

export type TeamConfig = {
  businessType: "consulting" | "ecommerce" | "custom";
  businessName: string;
  members: TeamMember[];
  updatedAt: number;
};
