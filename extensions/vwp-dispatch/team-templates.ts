/**
 * Default team templates for each business type.
 *
 * Returns a pre-configured set of team members appropriate for the
 * given business model. Used during onboarding to seed the team config.
 */

import type { TeamMember } from "./team-types.js";

const CONSULTING_TEAM: TeamMember[] = [
  {
    id: "ceo",
    name: "CEO / Strategy Lead",
    role: "CEO / Strategy Lead",
    description:
      "Sets strategic direction, manages client relationships, and oversees business growth.",
    skills: ["strategy", "planning", "client-relations"],
    required: true,
    active: true,
  },
  {
    id: "project-manager",
    name: "Project Manager",
    role: "Project Manager",
    description: "Coordinates project delivery, manages timelines, and ensures quality outcomes.",
    skills: ["project-management", "coordination", "delivery"],
    required: true,
    active: true,
  },
  {
    id: "marketing-strategist",
    name: "Marketing Strategist",
    role: "Marketing Strategist",
    description: "Develops marketing strategy, creates content, and drives lead generation.",
    skills: ["marketing", "content", "lead-generation"],
    required: true,
    active: true,
  },
  {
    id: "solution-architect",
    name: "Solution Architect",
    role: "Solution Architect",
    description: "Designs technical solutions, defines architecture, and manages integrations.",
    skills: ["architecture", "technical-design", "integration"],
    required: false,
    active: true,
  },
  {
    id: "developer",
    name: "Developer / DevOps",
    role: "Developer / DevOps",
    description: "Builds software, manages infrastructure, and automates workflows.",
    skills: ["development", "devops", "automation"],
    required: false,
    active: true,
  },
  {
    id: "business-analyst",
    name: "Business Analyst",
    role: "Business Analyst",
    description: "Gathers requirements, analyzes business processes, and produces documentation.",
    skills: ["analysis", "requirements", "documentation"],
    required: false,
    active: true,
  },
];

const ECOMMERCE_TEAM: TeamMember[] = [
  {
    id: "ceo",
    name: "CEO / Strategy Lead",
    role: "CEO / Strategy Lead",
    description:
      "Sets strategic direction, manages vendor relationships, and oversees business growth.",
    skills: ["strategy", "planning", "vendor-management"],
    required: true,
    active: true,
  },
  {
    id: "marketing-manager",
    name: "Marketing Manager",
    role: "Marketing Manager",
    description: "Manages marketing campaigns across social media, email, SEO, and paid ads.",
    skills: ["marketing", "social-media", "email", "seo", "ads"],
    required: true,
    active: true,
  },
  {
    id: "product-manager",
    name: "Product Manager",
    role: "Product Manager",
    description: "Manages product catalog, pricing strategy, and user experience.",
    skills: ["product", "catalog", "pricing", "ux"],
    required: true,
    active: true,
  },
  {
    id: "customer-support",
    name: "Customer Support",
    role: "Customer Support",
    description: "Handles customer inquiries, resolves issues, and manages returns.",
    skills: ["support", "customer-service", "returns"],
    required: true,
    active: true,
  },
  {
    id: "content-creator",
    name: "Content Creator",
    role: "Content Creator",
    description: "Creates product descriptions, brand content, and marketing copy.",
    skills: ["content", "copywriting", "brand-voice"],
    required: false,
    active: true,
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    role: "Data Analyst",
    description: "Analyzes sales data, generates reports, and optimizes conversion rates.",
    skills: ["analytics", "reporting", "conversion"],
    required: false,
    active: true,
  },
];

const CUSTOM_TEAM: TeamMember[] = [
  {
    id: "ceo",
    name: "CEO",
    role: "CEO / General Manager",
    description: "Oversees all operations and strategy",
    skills: ["strategy", "planning", "management"],
    required: true,
    active: true,
  },
];

export function getDefaultTeam(businessType: "consulting" | "ecommerce" | "custom"): TeamMember[] {
  if (businessType === "consulting") return CONSULTING_TEAM.map((m) => ({ ...m }));
  if (businessType === "ecommerce") return ECOMMERCE_TEAM.map((m) => ({ ...m }));
  return CUSTOM_TEAM.map((m) => ({ ...m }));
}
