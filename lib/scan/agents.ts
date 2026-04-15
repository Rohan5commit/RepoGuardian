import {
  AGENT_SEQUENCE,
  DEFAULT_NIM_MODEL,
  NVIDIA_NIM_BASE_URL,
  OSV_API_BASE,
  SECURITY_HEADER_PATTERNS,
  SEVERITY_WEIGHTS,
  WATCHLIST_PACKAGES,
} from "@/lib/constants";
import { demoRepositories, loadDemoSnapshot } from "@/lib/demo/registry";
import { buildReportMarkdown } from "@/lib/report";
import { fetchGitHubSnapshot, parseGitHubRepositoryUrl } from "@/lib/scan/github";
import {
  authAndConfigRules,
  placeholderMarkers,
  secretRules,
} from "@/lib/scan/rules";
import type {
  AgentLog,
  Confidence,
  DetectedFinding,
  Finding,
  RepositoryFile,
  RepositorySnapshot,
  ScanRequestInput,
  ScanResult,
  ScanSummary,
  Severity,
  TopAction,
} from "@/lib/types";

const severityRank: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const exploitabilityWeight = { high: 14, medium: 8, low: 4 } as const;
const effortWeight = { fast: 2, moderate: 4, deep: 7 } as const;
const confidenceWeight = { high: 10, medium: 6, low: 3 } as const;

const dependencyLatestVersionCache = new Map<string, string | null>();
const dependencyAdvisoryCache = new Map<string, string[]>();
const nimResponseCache = new Map<string, string | null>();
const MAX_RULE_MATCHES_PER_FILE = 20;
const MAX_NIM_REMEDIATIONS = 1;

export class ScanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanValidationError";
  }
}

function now() {
  return Date.now();
}

function makeLog(
  agent: AgentLog["agent"],
  startedAt: number,
  detail: string,
  outputCount?: number,
  status: AgentLog["status"] = "completed",
): AgentLog {
  return {
    agent,
    status,
    elapsedMs: Date.now() - startedAt,
    detail,
    outputCount,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lineNumberFromIndex(content: string, index: number) {
  return content.slice(0, index).split("\n").length;
}

function getLineSnippet(content: string, lineNumber: number) {
  const line = content.split("\n")[Math.max(0, lineNumber - 1)] ?? "";
  return line.trim();
}

function getContextWindow(content: string, lineNumber: number, radius = 2) {
  const lines = content.split("\n");
  const start = Math.max(0, lineNumber - 1 - radius);
  const end = Math.min(lines.length, lineNumber + radius);
  return lines
    .slice(start, end)
    .map((line, index) => `${start + index + 1}: ${line}`)
    .join("\n")
    .trim();
}

function normalizeWhitespace(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function looksLikePlaceholder(input: string) {
  const normalized = input.toLowerCase();
  return placeholderMarkers.some((marker) => normalized.includes(marker));
}

function protectedRouteContext(content: string, lineNumber: number) {
  const context = getContextWindow(content, lineNumber, 3).toLowerCase();
  return /(requireadmin|isadmin|authguard|verifytoken|middleware|authorize)/.test(
    context,
  );
}

function calculatePriorityScore(finding: DetectedFinding) {
  return (
    SEVERITY_WEIGHTS[finding.severity] +
    exploitabilityWeight[finding.exploitability] +
    confidenceWeight[finding.confidence] -
    effortWeight[finding.remediationEffort]
  );
}

function sortFindings<T extends { severity: Severity; priorityScore?: number }>(findings: T[]) {
  return [...findings].sort((left, right) => {
    const priorityDelta = (right.priorityScore ?? 0) - (left.priorityScore ?? 0);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return severityRank[right.severity] - severityRank[left.severity];
  });
}

function createDetectedFinding(
  file: RepositoryFile,
  matchIndex: number,
  payload: Omit<
    DetectedFinding,
    "id" | "filePath" | "line" | "snippet" | "context" | "priorityScore"
  >,
): DetectedFinding {
  const line = lineNumberFromIndex(file.content, matchIndex);
  const snippet = getLineSnippet(file.content, line);
  return {
    ...payload,
    id: `${payload.ruleId}:${file.path}:${line}`,
    filePath: file.path,
    line,
    snippet,
    priorityScore: calculatePriorityScore({
      ...payload,
      id: "",
      filePath: file.path,
      line,
      snippet,
    }),
  };
}

function dedupeFindings(findings: DetectedFinding[]) {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.ruleId}:${finding.filePath}:${finding.line}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function intakeAgent(input: ScanRequestInput) {
  const startedAt = now();

  if (input.demoId) {
    if (!demoRepositories[input.demoId]) {
      throw new ScanValidationError(`Unknown demo repository: ${input.demoId}`);
    }

    const snapshot = await loadDemoSnapshot(input.demoId);
    return {
      snapshot,
      log: makeLog(
        AGENT_SEQUENCE[0],
        startedAt,
        `Loaded built-in demo corpus "${input.demoId}".`,
        snapshot.files.length,
      ),
    };
  }

  if (!input.repoUrl?.trim()) {
    throw new ScanValidationError("Provide a GitHub repository URL or choose demo mode.");
  }

  const parsed = parseGitHubRepositoryUrl(input.repoUrl);

  if (!parsed) {
    throw new ScanValidationError("Only public GitHub repository URLs are supported in this MVP.");
  }

  const snapshot = await fetchGitHubSnapshot(parsed);
  const warningSuffix =
    snapshot.warnings && snapshot.warnings.length > 0
      ? ` Skipped ${snapshot.warnings.length} files that could not be fetched.`
      : "";

  return {
    snapshot,
    log: makeLog(
      AGENT_SEQUENCE[0],
      startedAt,
      `Mapped repository structure and selected high-signal files from ${snapshot.target.fullName}.${warningSuffix}`,
      snapshot.files.length,
    ),
  };
}

function scanPatternRules(files: RepositoryFile[]) {
  const findings: DetectedFinding[] = [];

  for (const file of files) {
    const rules = [...secretRules, ...authAndConfigRules];

    for (const rule of rules) {
      const flags = rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`;
      const pattern = new RegExp(rule.pattern.source, flags);
      let matchCount = 0;

      for (const match of file.content.matchAll(pattern)) {
        if (match.index === undefined) {
          continue;
        }

        const matchedText = match[0];
        const line = lineNumberFromIndex(file.content, match.index);

        if (
          rule.id === "secret-env-file" &&
          (file.path.includes(".example") ||
            file.path.includes(".sample") ||
            looksLikePlaceholder(matchedText))
        ) {
          continue;
        }

        if (rule.id === "secret-hardcoded-generic" && looksLikePlaceholder(matchedText)) {
          continue;
        }

        if (rule.id === "config-admin-route" && protectedRouteContext(file.content, line)) {
          continue;
        }

        findings.push(
          createDetectedFinding(file, match.index, {
            ruleId: rule.id,
            title: rule.title,
            severity: rule.severity,
            category: rule.category,
            confidence: rule.confidence,
            evidence: rule.evidence,
            tags: rule.tags,
            exploitability: rule.exploitability,
            remediationEffort: rule.remediationEffort,
          }),
        );

        matchCount += 1;
        if (matchCount >= MAX_RULE_MATCHES_PER_FILE) {
          break;
        }
      }
    }
  }

  return findings;
}

function parseManifestDependencies(file: RepositoryFile) {
  const packages: Array<{
    name: string;
    spec: string;
    ecosystem: "npm" | "pypi";
    filePath: string;
  }> = [];

  if (file.path.endsWith("package.json")) {
    try {
      const parsed = JSON.parse(file.content) as Record<string, unknown>;
      const sections = ["dependencies"] as const;

      for (const section of sections) {
        const deps = parsed[section];

        if (!deps || typeof deps !== "object") {
          continue;
        }

        for (const [name, spec] of Object.entries(deps as Record<string, string>)) {
          packages.push({
            name,
            spec,
            ecosystem: "npm",
            filePath: file.path,
          });
        }
      }
    } catch {
      return packages;
    }
  }

  if (file.path.endsWith("requirements.txt")) {
    const lines = file.content.split("\n");

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line || line.startsWith("#")) {
        continue;
      }

      const match = line.match(/^([A-Za-z0-9_.-]+)\s*([<>=!~]{1,2}\s*.+)?$/);

      if (!match) {
        continue;
      }

      packages.push({
        name: match[1],
        spec: match[2]?.replace(/\s+/g, "") ?? "",
        ecosystem: "pypi",
        filePath: file.path,
      });
    }
  }

  return packages;
}

async function fetchLatestDependencyVersion(
  ecosystem: "npm" | "pypi",
  packageName: string,
) {
  const cacheKey = `${ecosystem}:${packageName}`;

  if (dependencyLatestVersionCache.has(cacheKey)) {
    return dependencyLatestVersionCache.get(cacheKey) ?? null;
  }

  try {
    const url =
      ecosystem === "npm"
        ? `https://registry.npmjs.org/${encodeURIComponent(packageName)}`
        : `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;

    const response = await fetch(url, { next: { revalidate: 0 } });

    if (!response.ok) {
      dependencyLatestVersionCache.set(cacheKey, null);
      return null;
    }

    const payload = (await response.json()) as
      | { "dist-tags"?: { latest?: string } }
      | { info?: { version?: string } };

    const latestVersion =
      ecosystem === "npm"
        ? (payload as { "dist-tags"?: { latest?: string } })["dist-tags"]?.latest
        : (payload as { info?: { version?: string } }).info?.version;

    dependencyLatestVersionCache.set(cacheKey, latestVersion ?? null);
    return latestVersion ?? null;
  } catch {
    dependencyLatestVersionCache.set(cacheKey, null);
    return null;
  }
}

function findDependencyLine(file: RepositoryFile, packageName: string) {
  const lines = file.content.split("\n");
  const index = lines.findIndex((line) => line.includes(packageName));
  return index >= 0 ? index + 1 : 1;
}

function extractPinnedDependencyVersion(
  ecosystem: "npm" | "pypi",
  spec: string,
) {
  const normalized = spec.trim();

  if (ecosystem === "npm") {
    const exactMatch = normalized.match(/^v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/);
    return exactMatch?.[1] ?? null;
  }

  const exactMatch = normalized.match(/^==([A-Za-z0-9_.+-]+)$/);
  return exactMatch?.[1] ?? null;
}

function advisorySeverityFromCount(advisoryCount: number): Severity {
  if (advisoryCount >= 4) {
    return "critical";
  }

  if (advisoryCount >= 2) {
    return "high";
  }

  return "medium";
}

function advisoryCacheKey(
  ecosystem: "npm" | "pypi",
  packageName: string,
  version: string,
) {
  return `${ecosystem}:${packageName}:${version}`;
}

async function fetchDependencyAdvisoryIds(
  dependencies: Array<{
    name: string;
    spec: string;
    ecosystem: "npm" | "pypi";
  }>,
) {
  const advisoryMap = new Map<string, string[]>();
  const pendingQueries: Array<{
    cacheKey: string;
    ecosystem: "npm" | "pypi";
    name: string;
    version: string;
  }> = [];

  for (const dependency of dependencies) {
    const pinnedVersion = extractPinnedDependencyVersion(
      dependency.ecosystem,
      dependency.spec,
    );

    if (!pinnedVersion) {
      continue;
    }

    const cacheKey = advisoryCacheKey(
      dependency.ecosystem,
      dependency.name,
      pinnedVersion,
    );

    if (dependencyAdvisoryCache.has(cacheKey)) {
      advisoryMap.set(cacheKey, dependencyAdvisoryCache.get(cacheKey) ?? []);
      continue;
    }

    pendingQueries.push({
      cacheKey,
      ecosystem: dependency.ecosystem,
      name: dependency.name,
      version: pinnedVersion,
    });
  }

  if (pendingQueries.length === 0) {
    return advisoryMap;
  }

  try {
    const response = await fetch(`${OSV_API_BASE}/querybatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queries: pendingQueries.map((entry) => ({
          package: {
            name: entry.name,
            ecosystem: entry.ecosystem === "npm" ? "npm" : "PyPI",
          },
          version: entry.version,
        })),
      }),
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      pendingQueries.forEach((entry) => {
        dependencyAdvisoryCache.set(entry.cacheKey, []);
        advisoryMap.set(entry.cacheKey, []);
      });
      return advisoryMap;
    }

    const payload = (await response.json()) as {
      results?: Array<{ vulns?: Array<{ id?: string }> }>;
    };

    pendingQueries.forEach((entry, index) => {
      const advisoryIds = (payload.results?.[index]?.vulns ?? [])
        .map((vulnerability) => vulnerability.id)
        .filter((id): id is string => Boolean(id))
        .slice(0, 5);

      dependencyAdvisoryCache.set(entry.cacheKey, advisoryIds);
      advisoryMap.set(entry.cacheKey, advisoryIds);
    });
  } catch {
    pendingQueries.forEach((entry) => {
      dependencyAdvisoryCache.set(entry.cacheKey, []);
      advisoryMap.set(entry.cacheKey, []);
    });
  }

  return advisoryMap;
}

async function dependencyFindings(files: RepositoryFile[]) {
  const manifests = files.filter(
    (file) => file.path.endsWith("package.json") || file.path.endsWith("requirements.txt"),
  );
  const manifestDependencies = manifests
    .flatMap((file) => parseManifestDependencies(file))
    .slice(0, 40);
  const advisoryMap = await fetchDependencyAdvisoryIds(manifestDependencies);
  const findings: DetectedFinding[] = [];

  for (const file of manifests) {
    const dependencies = parseManifestDependencies(file);

    for (const dependency of dependencies.slice(0, 30)) {
      const pinnedVersion = extractPinnedDependencyVersion(
        dependency.ecosystem,
        dependency.spec,
      );

      if (!pinnedVersion) {
        continue;
      }

      const advisoryIds =
        advisoryMap.get(
          advisoryCacheKey(dependency.ecosystem, dependency.name, pinnedVersion),
        ) ?? [];

      if (advisoryIds.length === 0) {
        continue;
      }

      const latestVersion = await fetchLatestDependencyVersion(
        dependency.ecosystem,
        dependency.name,
      );
      const line = findDependencyLine(file, dependency.name);
      const currentLine = getLineSnippet(file.content, line);
      const severity = advisorySeverityFromCount(advisoryIds.length);
      const watchlistEntry = WATCHLIST_PACKAGES[dependency.name];
      const latestVersionNote =
        latestVersion && latestVersion !== pinnedVersion
          ? ` Latest stable release observed: ${latestVersion}.`
          : "";

      findings.push({
        id: `dependency:${dependency.filePath}:${dependency.name}`,
        ruleId: "dependency-advisory",
        title: `Known security advisories affect ${dependency.name} ${pinnedVersion}`,
        severity,
        category: "Dependencies",
        confidence: "high",
        filePath: dependency.filePath,
        line,
        snippet: currentLine,
        evidence: `${dependency.name} ${pinnedVersion} matches advisory IDs ${advisoryIds.join(", ")}.${latestVersionNote}`,
        tags: ["dependencies", dependency.ecosystem, dependency.name, ...advisoryIds],
        exploitability: severity === "critical" || severity === "high" ? "medium" : "low",
        remediationEffort: "moderate",
        technicalDetail: watchlistEntry?.note,
        priorityScore: calculatePriorityScore({
          id: "",
          ruleId: "dependency-advisory",
          title: "",
          severity,
          category: "Dependencies",
          confidence: "high",
          filePath: dependency.filePath,
          line,
          snippet: currentLine,
          evidence: "",
          tags: advisoryIds,
          exploitability: severity === "critical" || severity === "high" ? "medium" : "low",
          remediationEffort: "moderate",
        }),
      });
    }
  }

  return findings;
}

function missingHeaderFinding(snapshot: RepositorySnapshot) {
  const webRelevantFiles = snapshot.files.filter((file) =>
    /(next\.config|server|middleware|app\.py|express|flask|vercel\.json|nginx|netlify\.toml)/i.test(
      file.path,
    ),
  );

  if (webRelevantFiles.length === 0) {
    return null;
  }

  const headerFound = webRelevantFiles.some((file) =>
    SECURITY_HEADER_PATTERNS.some((pattern) => pattern.test(file.content)),
  );

  if (headerFound) {
    return null;
  }

  const anchorFile = webRelevantFiles[0];
  return {
    id: `headers-missing:${anchorFile.path}`,
    ruleId: "headers-missing",
    title: "No explicit security header configuration detected",
    severity: "medium",
    category: "Configuration",
    confidence: "low",
    filePath: anchorFile.path,
    line: 1,
    snippet: getLineSnippet(anchorFile.content, 1),
    evidence:
      "RepoGuardian could not find explicit Content-Security-Policy, HSTS, frame, or MIME hardening headers in scanned web entrypoints.",
    tags: ["headers", "browser", "hardening"],
    exploitability: "medium",
    remediationEffort: "moderate",
    context: `Reviewed files:\n${webRelevantFiles.map((file) => `- ${file.path}`).join("\n")}`,
    priorityScore: calculatePriorityScore({
      id: "",
      ruleId: "headers-missing",
      title: "",
      severity: "medium",
      category: "Configuration",
      confidence: "low",
      filePath: anchorFile.path,
      line: 1,
      snippet: "",
      evidence: "",
      tags: [],
      exploitability: "medium",
      remediationEffort: "moderate",
    }),
  } satisfies DetectedFinding;
}

async function detectionAgent(snapshot: RepositorySnapshot) {
  const startedAt = now();
  const patternMatches = scanPatternRules(snapshot.files);
  const dependencyMatches = await dependencyFindings(snapshot.files);
  const headerFinding = missingHeaderFinding(snapshot);
  const findings = dedupeFindings([
    ...patternMatches,
    ...dependencyMatches,
    ...(headerFinding ? [headerFinding] : []),
  ]);

  return {
    findings: sortFindings(findings),
    log: makeLog(
      AGENT_SEQUENCE[1],
      startedAt,
      "Ran secrets, auth, config, route, and advisory-backed dependency checks with deterministic rules.",
      findings.length,
    ),
  };
}

function contextAgent(findings: DetectedFinding[], snapshot: RepositorySnapshot) {
  const startedAt = now();
  const filesByPath = new Map(snapshot.files.map((file) => [file.path, file]));

  const contextualized = findings.map((finding) => {
    if (finding.context) {
      return finding;
    }

    const file = filesByPath.get(finding.filePath);

    if (!file) {
      return finding;
    }

    return {
      ...finding,
      context: getContextWindow(file.content, finding.line),
    };
  });

  const hydratedCount = contextualized.filter((finding) => Boolean(finding.context)).length;

  return {
    findings: contextualized,
    log: makeLog(
      AGENT_SEQUENCE[2],
      startedAt,
      `Hydrated contextual code windows for ${hydratedCount} findings and preserved synthesized context where direct code windows were not applicable.`,
      contextualized.length,
    ),
  };
}

function extractJsonObject<T>(content: string): T | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");

  if (start < 0 || end < start) {
    return null;
  }

  try {
    return JSON.parse(content.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function extractJsonArray<T>(content: string): T | null {
  const start = content.indexOf("[");
  const end = content.lastIndexOf("]");

  if (start < 0 || end < start) {
    return null;
  }

  try {
    return JSON.parse(content.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

async function callNim(
  messages: Array<{ role: "system" | "user"; content: string }>,
  options?: { timeoutMs?: number },
) {
  const apiKey = process.env.NVIDIA_NIM_API_KEY;

  if (!apiKey) {
    return null;
  }

  const model = process.env.NVIDIA_NIM_MODEL || DEFAULT_NIM_MODEL;
  const cacheKey = JSON.stringify({ model, messages });

  if (nimResponseCache.has(cacheKey)) {
    return nimResponseCache.get(cacheKey) ?? null;
  }

  const response = await fetch(NVIDIA_NIM_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 450,
      messages,
    }),
    signal: AbortSignal.timeout(options?.timeoutMs ?? 7000),
  });

  if (!response.ok) {
    throw new Error(`NVIDIA NIM request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content ?? null;
  nimResponseCache.set(cacheKey, content);
  return content;
}

function fallbackRemediation(finding: DetectedFinding): Finding {
  const technicalTail = finding.technicalDetail
    ? ` Technical note: ${normalizeWhitespace(finding.technicalDetail)}`
    : "";

  const developerExplanationByCategory: Record<string, string> = {
    Secrets:
      "This repository exposes credential-like material directly in versioned files, which means anyone with repository access can copy it and old commits may retain it even after deletion.",
    Authentication:
      "The auth implementation trusts browser storage or inline secrets more than a managed secret boundary, which increases account takeover and token replay risk.",
    Dependencies:
      "The dependency graph includes stale or security-sensitive packages that increase the chance of inheriting known issues or brittle defaults.",
    Configuration:
      "The application configuration weakens browser or API trust boundaries, making cross-origin or transport behavior easier to abuse.",
    "Operational Risk":
      "Debugging-oriented behavior can leak internals, environment state, or noisy diagnostics into runtime surfaces that should stay quiet in production.",
    Routing:
      "Privileged routes expand attack surface when they are easy to discover and not obviously gated by middleware or role checks.",
  };

  const recommendedFixByCategory: Record<string, string> = {
    Secrets:
      "Move the secret into managed environment variables, rotate the exposed value, purge it from git history, and add a scanner or pre-commit rule to block repeats.",
    Authentication:
      "Move tokens into secure httpOnly cookies or server-side sessions, load secrets from environment variables, and ensure JWTs are verified instead of just decoded.",
    Dependencies:
      "Upgrade the affected package to the latest stable release that fits the project, rerun tests, and pin supported versions so future scans can catch drift early.",
    Configuration:
      "Restrict allowed origins, add explicit security headers, and keep production behavior separate from permissive local-development defaults.",
    "Operational Risk":
      "Disable debug features outside development, remove secret-bearing logs, and make sensitive diagnostics opt-in behind protected internal tooling.",
    Routing:
      "Gate privileged routes with authentication and role middleware, rename routes only if needed for clarity, and keep internal tooling off public paths.",
  };

  return {
    ...finding,
    issueSummary: finding.evidence,
    developerExplanation: `${
      developerExplanationByCategory[finding.category] ??
      "The detected pattern creates unnecessary risk and should be tightened before release."
    }${technicalTail}`,
    recommendedFix:
      recommendedFixByCategory[finding.category] ??
      "Remove the risky pattern, replace it with a safer default, and validate behavior with a focused regression test.",
    aiProvider: "rule-fallback",
  };
}

async function remediateWithNim(finding: DetectedFinding) {
  const systemPrompt = `You are RepoGuardian's Remediation Agent.
Be concise and technically precise.
Do not exaggerate risk.
Do not invent evidence.
Explain issues in plain language first, then technical detail.
Prefer actionable remediation over generic advice.
Do not rename, reclassify, or otherwise override the grounded finding metadata.
Return only valid JSON with this exact shape:
{
  "title": string,
  "severity": "critical" | "high" | "medium" | "low",
  "category": string,
  "issue_summary": string,
  "developer_explanation": string,
  "recommended_fix": string,
  "confidence": "high" | "medium" | "low"
}`;

  const userPrompt = `Repository finding:
Title: ${finding.title}
Severity: ${finding.severity}
Category: ${finding.category}
Evidence: ${finding.evidence}
File: ${finding.filePath}:${finding.line}
Snippet:
${finding.snippet}

Context:
${finding.context ?? finding.snippet}

If evidence is weak, lower confidence and say why.
Never claim a vulnerability beyond what the evidence supports.`;

  const attempt = async (strict = false) => {
    const content = await callNim([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: strict
          ? `${userPrompt}\n\nRetry. Return JSON only. No markdown, no prose, no code fences.`
          : userPrompt,
      },
    ]);

    if (!content) {
      return null;
    }

    return extractJsonObject<{
      title: string;
      severity: Severity;
      category: string;
      issue_summary: string;
      developer_explanation: string;
      recommended_fix: string;
      confidence: Confidence;
    }>(content);
  };

  return (await attempt(false)) ?? (await attempt(true));
}

async function remediationAgent(findings: DetectedFinding[]) {
  const startedAt = now();
  const aiEnabled = Boolean(process.env.NVIDIA_NIM_API_KEY);
  const remediated: Finding[] = [];

  for (const [index, finding] of findings.entries()) {
    const shouldUseNim = aiEnabled && index < MAX_NIM_REMEDIATIONS;

    if (!shouldUseNim) {
      remediated.push(fallbackRemediation(finding));
      continue;
    }

    try {
      const nimResponse = await remediateWithNim(finding);

      if (!nimResponse) {
        remediated.push(fallbackRemediation(finding));
        continue;
      }

      const fallback = fallbackRemediation(finding);

      remediated.push({
        ...fallback,
        issueSummary: nimResponse.issue_summary || fallback.issueSummary,
        developerExplanation:
          nimResponse.developer_explanation || fallback.developerExplanation,
        recommendedFix: nimResponse.recommended_fix || fallback.recommendedFix,
        aiProvider: "nvidia-nim",
      });
    } catch {
      remediated.push(fallbackRemediation(finding));
    }
  }

  const usedFallback = remediated.some((finding) => finding.aiProvider === "rule-fallback");

  return {
    findings: sortFindings(remediated),
    log: makeLog(
      AGENT_SEQUENCE[3],
      startedAt,
      aiEnabled
        ? usedFallback
          ? `Used NVIDIA NIM on the top ${MAX_NIM_REMEDIATIONS} highest-priority findings and deterministic remediation on the remainder to keep scan latency demo-safe.`
          : "Generated explanations and fixes with NVIDIA NIM structured remediation prompts."
        : "NVIDIA NIM key not configured, so deterministic remediation guidance was used.",
      remediated.length,
      aiEnabled && !usedFallback ? "completed" : "fallback",
    ),
  };
}

function buildDeterministicTopActions(findings: Finding[]): TopAction[] {
  const actions: TopAction[] = [];

  const secrets = findings.filter((finding) => finding.category === "Secrets");
  if (secrets.length > 0) {
    actions.push({
      title: "Rotate exposed secrets and purge them from history",
      rationale:
        "Credential exposure is the fastest path to real compromise because attackers do not need additional footholds once a live secret leaks.",
      severity: secrets[0].severity,
      impactedArea: "Secrets management",
    });
  }

  const auth = findings.filter((finding) => finding.category === "Authentication");
  if (auth.length > 0) {
    actions.push({
      title: "Harden token handling and JWT verification",
      rationale:
        "The current auth flow trusts browser-accessible storage or inline secrets, which makes token theft and signature mistakes easier to exploit.",
      severity: auth[0].severity,
      impactedArea: "Authentication",
    });
  }

  const dependencies = findings.filter((finding) => finding.category === "Dependencies");
  if (dependencies.length > 0) {
    actions.push({
      title: "Patch dependencies with known security advisories",
      rationale:
        "Dependency vulnerabilities can be exploitable without any new application bug, so packages with known advisories should be upgraded first.",
      severity: dependencies[0].severity,
      impactedArea: "Dependency security",
    });
  }

  const config = findings.filter(
    (finding) => finding.category === "Configuration" || finding.category === "Routing",
  );
  if (config.length > 0 && actions.length < 3) {
    actions.push({
      title: "Restrict public attack surface and browser trust boundaries",
      rationale:
        "CORS, security headers, and privileged routes define how much a hostile browser or unauthenticated user can learn and reach.",
      severity: config[0].severity,
      impactedArea: "Configuration",
    });
  }

  return actions.slice(0, 3);
}

async function prioritizeWithNim(findings: Finding[]) {
  const summary = findings.slice(0, 8).map((finding) => ({
    title: finding.title,
    severity: finding.severity,
    category: finding.category,
    evidence: finding.evidence,
    fix: finding.recommendedFix,
  }));

  const systemPrompt = `You are RepoGuardian's Prioritization Agent.
Rank fixes by severity, exploitability, and ease of remediation.
Do not invent issues.
Return only valid JSON as an array of up to 3 objects:
[
  {
    "title": string,
    "rationale": string,
    "severity": "critical" | "high" | "medium" | "low",
    "impactedArea": string
  }
]`;

  const userPrompt = `Prioritize these grounded findings for a small engineering team:
${JSON.stringify(summary, null, 2)}`;

  const attempt = async (strict = false) => {
    const content = await callNim([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: strict
          ? `${userPrompt}\n\nRetry. JSON array only. No markdown, no commentary.`
          : userPrompt,
      },
    ]);

    if (!content) {
      return null;
    }

    return extractJsonArray<TopAction[]>(content);
  };

  return (await attempt(false)) ?? (await attempt(true));
}

function buildSummary(findings: Finding[], topActions: TopAction[]): ScanSummary {
  const severityCounts = findings.reduce<Record<Severity, number>>(
    (counts, finding) => {
      counts[finding.severity] += 1;
      return counts;
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  );

  const categoryMap = new Map<string, number>();

  for (const finding of findings) {
    categoryMap.set(finding.category, (categoryMap.get(finding.category) ?? 0) + 1);
  }

  const pressure = findings.reduce(
    (sum, finding) => sum + SEVERITY_WEIGHTS[finding.severity],
    0,
  );
  const securityScore = clamp(100 - Math.round(pressure / 2.4), 8, 100);

  return {
    totalFindings: findings.length,
    securityScore,
    severityCounts,
    categoryBreakdown: [...categoryMap.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((left, right) => right.count - left.count),
    topActions,
  };
}

async function prioritizationAgent(findings: Finding[]) {
  const startedAt = now();
  let topActions = buildDeterministicTopActions(findings);
  let status: AgentLog["status"] = "fallback";
  let detail =
    "Ranked the most important actions with deterministic severity and remediation heuristics.";

  if (process.env.NVIDIA_NIM_API_KEY) {
    try {
      const nimActions = await prioritizeWithNim(findings);
      if (nimActions && nimActions.length > 0) {
        topActions = nimActions.slice(0, 3);
        status = "completed";
        detail =
          "Used NVIDIA NIM to rank the top actions by exploitability, blast radius, and remediation speed.";
      }
    } catch {
      status = "fallback";
    }
  }

  const summary = buildSummary(findings, topActions);
  return {
    summary,
    log: makeLog(AGENT_SEQUENCE[4], startedAt, detail, topActions.length, status),
  };
}

export async function runRepoGuardianScan(input: ScanRequestInput): Promise<ScanResult> {
  const { snapshot, log: intakeLog } = await intakeAgent(input);
  const { findings: detected, log: detectionLog } = await detectionAgent(snapshot);
  const { findings: contextualized, log: contextLog } = contextAgent(detected, snapshot);
  const { findings: remediated, log: remediationLog } = await remediationAgent(contextualized);
  const { summary, log: prioritizationLog } = await prioritizationAgent(remediated);

  const reportMarkdown = buildReportMarkdown({
    repositoryName: snapshot.target.fullName,
    repositoryUrl: snapshot.target.url,
    summary,
    findings: remediated,
    agentLogs: [
      intakeLog,
      detectionLog,
      contextLog,
      remediationLog,
      prioritizationLog,
    ],
  });

  return {
    target: snapshot.target,
    summary,
    findings: remediated,
    agentLogs: [
      intakeLog,
      detectionLog,
      contextLog,
      remediationLog,
      prioritizationLog,
    ],
    reportMarkdown,
    demoRepositoryUrl: snapshot.target.sourceMode === "demo" ? snapshot.target.url : undefined,
  };
}
