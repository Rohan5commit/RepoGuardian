export type Severity = "critical" | "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";
export type Effort = "fast" | "moderate" | "deep";
export type Exploitability = "high" | "medium" | "low";
export type SourceMode = "live" | "demo";
export type AgentName =
  | "Intake Agent"
  | "Detection Agent"
  | "Context Agent"
  | "Remediation Agent"
  | "Prioritization Agent";

export interface ScanRequestInput {
  repoUrl?: string;
  demoId?: string;
}

export interface RepositoryTreeEntry {
  path: string;
  type: "blob" | "tree";
  size: number;
  sha?: string;
}

export interface RepositoryFile {
  path: string;
  size: number;
  content: string;
}

export interface RepositoryTarget {
  sourceMode: SourceMode;
  name: string;
  fullName: string;
  owner?: string;
  repo?: string;
  ref: string;
  url: string;
  description?: string | null;
  primaryLanguage?: string | null;
  pathPrefix?: string;
  stars?: number;
}

export interface RepositorySnapshot {
  target: RepositoryTarget;
  tree: RepositoryTreeEntry[];
  files: RepositoryFile[];
  scannedAt: string;
}

export interface DetectedFinding {
  id: string;
  ruleId: string;
  title: string;
  severity: Severity;
  category: string;
  confidence: Confidence;
  filePath: string;
  line: number;
  snippet: string;
  evidence: string;
  tags: string[];
  exploitability: Exploitability;
  remediationEffort: Effort;
  context?: string;
  technicalDetail?: string;
  priorityScore?: number;
}

export interface Finding extends DetectedFinding {
  issueSummary: string;
  developerExplanation: string;
  recommendedFix: string;
  aiProvider: "nvidia-nim" | "rule-fallback";
}

export interface TopAction {
  title: string;
  rationale: string;
  severity: Severity;
  impactedArea: string;
}

export interface CategoryBreakdownItem {
  category: string;
  count: number;
}

export interface ScanSummary {
  totalFindings: number;
  securityScore: number;
  severityCounts: Record<Severity, number>;
  categoryBreakdown: CategoryBreakdownItem[];
  topActions: TopAction[];
}

export interface AgentLog {
  agent: AgentName;
  status: "completed" | "fallback";
  elapsedMs: number;
  detail: string;
  outputCount?: number;
}

export interface ScanResult {
  target: RepositoryTarget;
  summary: ScanSummary;
  findings: Finding[];
  agentLogs: AgentLog[];
  reportMarkdown: string;
  demoRepositoryUrl?: string;
}
