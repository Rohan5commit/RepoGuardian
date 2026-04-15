import { APP_NAME, SEVERITY_ORDER } from "@/lib/constants";
import type { AgentLog, Finding, ScanSummary, Severity } from "@/lib/types";

function severityHeading(counts: Record<Severity, number>) {
  return SEVERITY_ORDER.map(
    (severity) => `- ${severity.toUpperCase()}: ${counts[severity]}`,
  ).join("\n");
}

export function buildReportMarkdown(params: {
  repositoryName: string;
  repositoryUrl: string;
  summary: ScanSummary;
  findings: Finding[];
  agentLogs: AgentLog[];
}) {
  const { repositoryName, repositoryUrl, summary, findings, agentLogs } = params;

  const actionsSection =
    summary.topActions.length > 0
      ? summary.topActions
          .map(
            (action, index) =>
              `${index + 1}. **${action.title}**\n   - Severity: ${action.severity.toUpperCase()}\n   - Area: ${action.impactedArea}\n   - Why now: ${action.rationale}`,
          )
          .join("\n")
      : "No high-signal actions were generated.";

  const findingsSection =
    findings.length > 0
      ? findings
          .map(
            (finding, index) => `## ${index + 1}. ${finding.title}

- Severity: ${finding.severity.toUpperCase()}
- Category: ${finding.category}
- Confidence: ${finding.confidence}
- File: ${finding.filePath}${finding.line > 0 ? `:${finding.line}` : ""}
- Evidence: ${finding.evidence}
- Summary: ${finding.issueSummary}
- Fix: ${finding.recommendedFix}

\`\`\`
${finding.context ?? finding.snippet}
\`\`\`
`,
          )
          .join("\n")
      : "No findings generated.";

  const agentsSection = agentLogs
    .map(
      (log) =>
        `- ${log.agent}: ${log.status} in ${log.elapsedMs}ms${log.outputCount ? ` (${log.outputCount} outputs)` : ""} — ${log.detail}`,
    )
    .join("\n");

  return `# ${APP_NAME} Scan Report

Repository: **${repositoryName}**
Source: ${repositoryUrl}
Generated: ${new Date().toISOString()}

## Executive Summary

- Security score: **${summary.securityScore}/100**
- Total findings: **${summary.totalFindings}**

${severityHeading(summary.severityCounts)}

## Top 3 Actions

${actionsSection}

## Findings

${findingsSection}

## Agent Trace

${agentsSection}
`;
}
