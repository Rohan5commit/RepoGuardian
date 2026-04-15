import type { AgentName, Severity } from "@/lib/types";

export const APP_NAME = "RepoGuardian";
export const APP_TAGLINE =
  "AI-powered GitHub security and code-risk copilot for fast repository triage.";
export const DEMO_REPOSITORY_ID = "sample-repo";
export const DEMO_REPOSITORY_PATH = "demo/sample-repo";
export const DEMO_REPOSITORY_GITHUB_URL =
  "https://github.com/Rohan5commit/RepoGuardian/tree/main/demo/sample-repo";
export const GITHUB_API_BASE = "https://api.github.com";
export const NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
export const DEFAULT_NIM_MODEL = "nvidia/nvidia-nemotron-nano-9b-v2";
export const THEME_COOKIE_NAME = "repoguardian-theme";

export const AGENT_SEQUENCE: AgentName[] = [
  "Intake Agent",
  "Detection Agent",
  "Context Agent",
  "Remediation Agent",
  "Prioritization Agent",
];

export const SEVERITY_ORDER: Severity[] = [
  "critical",
  "high",
  "medium",
  "low",
];

export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 36,
  high: 24,
  medium: 14,
  low: 8,
};

export const SECURITY_HEADERS = [
  "content-security-policy",
  "x-frame-options",
  "strict-transport-security",
  "x-content-type-options",
  "referrer-policy",
];

export const SECURITY_HEADER_PATTERNS = SECURITY_HEADERS.map(
  (header) => new RegExp(header, "i"),
);

export const TEXT_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "yaml",
  "yml",
  "toml",
  "env",
  "txt",
  "md",
  "py",
  "rb",
  "go",
  "java",
  "kt",
  "php",
  "cs",
  "ini",
  "sh",
]);

export const SCAN_IGNORE_SEGMENTS = [
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "vendor",
  "__pycache__",
  ".git",
];

export const WATCHLIST_PACKAGES: Record<
  string,
  { ecosystem: "npm" | "pypi"; note: string }
> = {
  axios: {
    ecosystem: "npm",
    note: "HTTP clients tend to sit on the hot path for SSRF, token forwarding, and proxy misconfiguration.",
  },
  jsonwebtoken: {
    ecosystem: "npm",
    note: "Authentication libraries deserve tight version hygiene because verification mistakes amplify auth risk quickly.",
  },
  express: {
    ecosystem: "npm",
    note: "Backend framework drift often correlates with stale middleware, missing headers, and weak body parsing defaults.",
  },
  flask: {
    ecosystem: "pypi",
    note: "Flask apps frequently expose debug mode or permissive defaults when older baselines persist in sidecar services.",
  },
};
