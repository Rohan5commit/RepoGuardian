"use client";

import {
  ArrowUpRight,
  Bot,
  Download,
  ExternalLink,
  FolderGit2,
  Radar,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";

import {
  AGENT_SEQUENCE,
  APP_NAME,
  APP_TAGLINE,
  DEMO_REPOSITORY_GITHUB_URL,
} from "@/lib/constants";
import type { Finding, ScanResult, Severity } from "@/lib/types";

import { ThemeToggle } from "@/components/theme-toggle";

type FilterValue = Severity | "all";

const severityTone: Record<
  Severity,
  { surface: string; text: string; border: string }
> = {
  critical: {
    surface: "bg-[var(--critical-soft)]",
    text: "text-[var(--critical)]",
    border: "border-[var(--critical)]/20",
  },
  high: {
    surface: "bg-[var(--high-soft)]",
    text: "text-[var(--high)]",
    border: "border-[var(--high)]/20",
  },
  medium: {
    surface: "bg-[var(--medium-soft)]",
    text: "text-[var(--medium)]",
    border: "border-[var(--medium)]/20",
  },
  low: {
    surface: "bg-[var(--low-soft)]",
    text: "text-[var(--low)]",
    border: "border-[var(--low)]/20",
  },
};

function severityBadge(severity: Severity) {
  const tone = severityTone[severity];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${tone.surface} ${tone.text} ${tone.border}`}
    >
      {severity}
    </span>
  );
}

function formatDuration(duration: number) {
  return `${(duration / 1000).toFixed(duration > 12000 ? 1 : 2)}s`;
}

function downloadMarkdownFile(content: string, name: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(href);
}

function scoreBackground(score: number) {
  const safe = Math.max(0, Math.min(score, 100));
  return `conic-gradient(var(--accent) ${safe}%, var(--surface-strong) ${safe}% 100%)`;
}

function ScoreDial({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-4">
      <div
        className="relative flex h-24 w-24 items-center justify-center rounded-full p-2"
        style={{ background: scoreBackground(score) }}
      >
        <div className="flex h-full w-full items-center justify-center rounded-full bg-[var(--surface)] text-center">
          <div>
            <div className="text-3xl font-bold tracking-[-0.06em]">{score}</div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
              score
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-[13rem]">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          Security Health
        </div>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Weighted across severity, exploitability, and remediation urgency.
        </p>
      </div>
    </div>
  );
}

function SummaryCard(props: {
  label: string;
  value: string;
  tone?: "accent" | "critical" | "neutral";
  description: string;
}) {
  const toneClass =
    props.tone === "critical"
      ? "border-[var(--critical)]/18 bg-[var(--critical-soft)]"
      : props.tone === "accent"
        ? "border-[var(--accent)]/18 bg-[var(--accent-soft)]"
        : "border-[var(--line)] bg-[var(--surface)]";

  return (
    <div className={`rounded-3xl border p-5 ${toneClass}`}>
      <div className="eyebrow">{props.label}</div>
      <div className="mt-3 text-3xl font-bold tracking-[-0.06em]">{props.value}</div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{props.description}</p>
    </div>
  );
}

function FindingsPanel({
  findings,
  filter,
  setFilter,
}: {
  findings: Finding[];
  filter: FilterValue;
  setFilter: (value: FilterValue) => void;
}) {
  const filtered =
    filter === "all" ? findings : findings.filter((finding) => finding.severity === filter);

  return (
    <section className="surface-card rounded-[2rem] p-6">
      <div className="flex flex-col gap-4 border-b border-[var(--line)] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="eyebrow">Findings</div>
          <h2 className="section-title mt-2 text-2xl font-semibold tracking-[-0.05em]">
            Evidence-backed risk review
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Each finding includes grounded evidence, contextual code, and fix-oriented
            remediation guidance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["all", "critical", "high", "medium", "low"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors ${
                filter === value
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "border-[var(--line)] bg-[var(--surface-muted)] text-[var(--muted)]"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        {filtered.length > 0 ? (
          filtered.map((finding) => <FindingCard key={finding.id} finding={finding} />)
        ) : (
          <div className="dash-border rounded-3xl p-6 text-sm text-[var(--muted)]">
            No findings match the active filter.
          </div>
        )}
      </div>
    </section>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <article className="rounded-[1.65rem] border border-[var(--line)] bg-[var(--surface-muted)] p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            {severityBadge(finding.severity)}
            <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
              {finding.category}
            </span>
            <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
              confidence: {finding.confidence}
            </span>
            <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 font-mono text-xs text-[var(--muted)]">
              {finding.filePath}
              {finding.line > 0 ? `:${finding.line}` : ""}
            </span>
          </div>
          <h3 className="mt-4 text-xl font-semibold tracking-[-0.04em]">{finding.title}</h3>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{finding.issueSummary}</p>
        </div>
        <div className="rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm">
          <div className="eyebrow">AI Provider</div>
          <div className="mt-2 font-medium">
            {finding.aiProvider === "nvidia-nim" ? "NVIDIA NIM" : "Deterministic fallback"}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="rounded-2xl bg-[var(--surface)] p-4">
          <div className="eyebrow">Developer Explanation</div>
          <p className="mt-3 text-sm leading-6 text-[var(--foreground)]">
            {finding.developerExplanation}
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--surface)] p-4">
          <div className="eyebrow">Recommended Fix</div>
          <p className="mt-3 text-sm leading-6 text-[var(--foreground)]">
            {finding.recommendedFix}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl bg-[var(--surface)] p-4">
          <div className="eyebrow">Evidence</div>
          <p className="mt-3 text-sm leading-6 text-[var(--foreground)]">{finding.evidence}</p>
        </div>
        <pre className="overflow-x-auto rounded-2xl bg-[#0e1715] p-4 text-xs leading-6 text-[#cde8df]">
          <code>{finding.context ?? finding.snippet}</code>
        </pre>
      </div>
    </article>
  );
}

export function RepoGuardianDashboard() {
  const [repoUrl, setRepoUrl] = useState(DEMO_REPOSITORY_GITHUB_URL);
  const deferredRepoUrl = useDeferredValue(repoUrl);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [activeStage, setActiveStage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveStage((current) => (current + 1) % AGENT_SEQUENCE.length);
    }, 1100);

    return () => window.clearInterval(interval);
  }, [isLoading]);

  const visibleFindings = useMemo(() => result?.findings ?? [], [result]);

  const executeScan = (mode: "demo" | "live") => {
    setError(null);
    setFilter("all");
    setActiveStage(0);
    setIsLoading(true);

    void (async () => {
      try {
        const payload =
          mode === "demo"
            ? { demoId: "sample-repo" }
            : { repoUrl: deferredRepoUrl.trim() || DEMO_REPOSITORY_GITHUB_URL };

        const response = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const json = (await response.json()) as ScanResult | { error: string };

        if (!response.ok || "error" in json) {
          startTransition(() => {
            setResult(null);
            setError(
              "error" in json ? json.error : "RepoGuardian could not complete the scan.",
            );
          });
          return;
        }

        startTransition(() => {
          setResult(json);
        });
      } finally {
        setIsLoading(false);
        setActiveStage(0);
      }
    })();
  };

  return (
    <main className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
      <header className="surface-card stagger-rise rounded-[2.1rem] p-5 sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl">
            <div className="eyebrow">Tech Builders Program · Create and Conquer</div>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <ShieldAlert size={26} />
              </div>
              <div>
                <h1 className="section-title text-4xl font-semibold tracking-[-0.07em] sm:text-5xl">
                  {APP_NAME}
                </h1>
                <p className="mt-2 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
                  {APP_TAGLINE}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {[
                "Public GitHub repo scanning",
                "NVIDIA NIM remediation",
                "Severity-ranked dashboard",
                "Judge-ready report export",
              ].map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ThemeToggle />
            <Link
              href="https://github.com/Rohan5commit/RepoGuardian"
              className="surface-muted inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-transform hover:-translate-y-0.5"
            >
              <FolderGit2 size={16} />
              View Repository
            </Link>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_380px]">
        <div className="panel-grid">
          <section className="surface-card beam stagger-rise rounded-[2rem] p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="eyebrow">Repository Intake</div>
                <h2 className="section-title mt-2 text-3xl font-semibold tracking-[-0.06em]">
                  Paste a public GitHub repo URL and run a security review
                </h2>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)] sm:text-base">
                  RepoGuardian maps the repository, scans secrets and configs, inspects
                  dependencies, and returns fix-ready outputs with a prioritized action list.
                </p>
              </div>
              <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">
                <div className="font-semibold text-[var(--foreground)]">
                  Demo URL ready for judges
                </div>
                <div className="mt-1 font-mono text-xs">
                  {DEMO_REPOSITORY_GITHUB_URL.replace("https://github.com/", "")}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto_auto]">
              <label className="flex flex-col gap-2">
                <span className="eyebrow">Public Repository URL</span>
                <div className="surface-muted flex items-center gap-3 rounded-2xl px-4 py-3">
                  <FolderGit2 size={18} className="shrink-0 text-[var(--muted)]" />
                  <input
                    value={repoUrl}
                    onChange={(event) => setRepoUrl(event.target.value)}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
                    placeholder="https://github.com/owner/repo"
                  />
                </div>
              </label>
              <button
                type="button"
                onClick={() => executeScan("live")}
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Search size={16} />
                {isLoading ? "Scanning..." : "Scan GitHub Repo"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRepoUrl(DEMO_REPOSITORY_GITHUB_URL);
                  executeScan("demo");
                }}
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-5 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Radar size={16} />
                Use Built-in Demo
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
              <Link
                href={DEMO_REPOSITORY_GITHUB_URL}
                className="inline-flex items-center gap-1 font-medium text-[var(--accent)]"
              >
                Demo sample repo
                <ExternalLink size={14} />
              </Link>
              <span>Public repos first. Optional `GITHUB_TOKEN` improves API headroom.</span>
            </div>
          </section>

          {error ? (
            <section className="surface-card rounded-[2rem] border border-[var(--critical)]/20 bg-[var(--critical-soft)] p-5 text-sm text-[var(--critical)]">
              {error}
            </section>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
            <div className="surface-card rounded-[2rem] p-6">
              <div className="eyebrow">Why It Wins</div>
              <h2 className="section-title mt-2 text-2xl font-semibold tracking-[-0.05em]">
                Built around all four judging pillars
              </h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <SummaryCard
                  label="Innovation"
                  value="5-Agent workflow"
                  tone="accent"
                  description="Intake, Detection, Context, Remediation, and Prioritization are explicit product primitives, not hand-waved abstractions."
                />
                <SummaryCard
                  label="Functionality"
                  value="Live + demo scans"
                  description="Public repositories scan immediately, and the built-in vulnerable sample gives judges a reliable fallback path."
                />
                <SummaryCard
                  label="Presentation"
                  value="10-second clarity"
                  description="The value proposition, action list, evidence, and export flow stay visible above the fold."
                />
                <SummaryCard
                  label="Problem Solving"
                  value="Security workflow"
                  tone="critical"
                  description="RepoGuardian reduces skipped security reviews by turning fragmented checks into a single, developer-friendly triage path."
                />
              </div>
            </div>

            <section className="surface-card rounded-[2rem] p-6">
              <div className="eyebrow">Agent Flow</div>
              <h2 className="section-title mt-2 text-2xl font-semibold tracking-[-0.05em]">
                Structured scan pipeline
              </h2>
              <div className="mt-5 grid gap-3">
                {AGENT_SEQUENCE.map((agent, index) => {
                  const isActive = isLoading && index === activeStage;
                  const isComplete =
                    !isLoading && result?.agentLogs.some((log) => log.agent === agent);

                  return (
                    <div
                      key={agent}
                      className={`rounded-2xl border px-4 py-4 transition-all ${
                        isActive
                          ? "scan-pulse border-[var(--accent)] bg-[var(--accent-soft)]"
                          : isComplete
                            ? "border-[var(--line)] bg-[var(--surface-muted)]"
                            : "border-[var(--line)] bg-[var(--surface)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--surface)]">
                            <Bot size={18} />
                          </div>
                          <div>
                            <div className="font-semibold">{agent}</div>
                            <div className="text-sm text-[var(--muted)]">
                              {result?.agentLogs.find((log) => log.agent === agent)?.detail ??
                                "Awaiting scan"}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                          {isActive
                            ? "running"
                            : isComplete
                              ? "complete"
                              : "queued"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </section>

          {result ? (
            <>
              <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
                <div className="surface-card rounded-[2rem] p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="eyebrow">Current Scan</div>
                      <h2 className="section-title mt-2 text-2xl font-semibold tracking-[-0.05em]">
                        {result.target.fullName}
                      </h2>
                      <div className="mt-3 flex flex-wrap gap-2 text-sm text-[var(--muted)]">
                        <span className="rounded-full bg-[var(--surface-muted)] px-3 py-2">
                          {result.target.sourceMode === "demo" ? "Demo mode" : "Live GitHub"}
                        </span>
                        <span className="rounded-full bg-[var(--surface-muted)] px-3 py-2">
                          ref: {result.target.ref}
                        </span>
                        {result.target.primaryLanguage ? (
                          <span className="rounded-full bg-[var(--surface-muted)] px-3 py-2">
                            {result.target.primaryLanguage}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <ScoreDial score={result.summary.securityScore} />
                  </div>
                </div>
                <SummaryCard
                  label="Critical + High"
                  value={`${result.summary.severityCounts.critical + result.summary.severityCounts.high}`}
                  tone="critical"
                  description="Issues likely to block a safe launch without immediate remediation."
                />
                <SummaryCard
                  label="Total Findings"
                  value={String(result.summary.totalFindings)}
                  description="Grounded findings after rule validation, context extraction, and remediation pass."
                />
                <SummaryCard
                  label="Top Actions"
                  value={String(result.summary.topActions.length)}
                  tone="accent"
                  description="Focused next steps ranked for small teams that need fast security leverage."
                />
              </section>

              <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="surface-card rounded-[2rem] p-6">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="eyebrow">Top Actions</div>
                      <h2 className="section-title mt-2 text-2xl font-semibold tracking-[-0.05em]">
                        What to do first
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        downloadMarkdownFile(
                          result.reportMarkdown,
                          `${result.target.name.toLowerCase()}-repoguardian-report.md`,
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
                    >
                      <Download size={16} />
                      Export Report
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4">
                    {result.summary.topActions.map((action, index) => (
                      <div
                        key={action.title}
                        className="rounded-[1.6rem] border border-[var(--line)] bg-[var(--surface-muted)] p-5"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                            Action {index + 1}
                          </span>
                          {severityBadge(action.severity)}
                          <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
                            {action.impactedArea}
                          </span>
                        </div>
                        <h3 className="mt-4 text-xl font-semibold tracking-[-0.04em]">
                          {action.title}
                        </h3>
                        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                          {action.rationale}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <section className="surface-card rounded-[2rem] p-6">
                  <div className="eyebrow">Category Breakdown</div>
                  <h2 className="section-title mt-2 text-2xl font-semibold tracking-[-0.05em]">
                    Risk distribution
                  </h2>
                  <div className="mt-5 grid gap-4">
                    {result.summary.categoryBreakdown.map((item) => {
                      const percent = Math.max(
                        10,
                        Math.round((item.count / result.summary.totalFindings) * 100),
                      );

                      return (
                        <div key={item.category} className="rounded-2xl bg-[var(--surface-muted)] p-4">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{item.category}</span>
                            <span className="text-[var(--muted)]">{item.count}</span>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-[var(--surface)]">
                            <div
                              className="h-full rounded-full bg-[var(--accent)]"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 rounded-[1.6rem] bg-[var(--surface-muted)] p-4 text-sm text-[var(--muted)]">
                    <div className="font-semibold text-[var(--foreground)]">Judge note</div>
                    <p className="mt-2 leading-6">
                      RepoGuardian is designed to make its value obvious within one scan: the
                      repository, severity mix, evidence, and next actions are all visible without
                      leaving the page.
                    </p>
                  </div>
                </section>
              </section>

              <FindingsPanel findings={visibleFindings} filter={filter} setFilter={setFilter} />
            </>
          ) : (
            <section className="surface-card rounded-[2rem] p-6">
              <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                <div>
                  <div className="eyebrow">Demo Sequence</div>
                  <h2 className="section-title mt-2 text-3xl font-semibold tracking-[-0.06em]">
                    Show the value in under two minutes
                  </h2>
                  <div className="mt-5 grid gap-3">
                    {[
                      "Open the homepage and paste the vulnerable sample repo URL.",
                      "Start scan and let the five-agent analysis animate through the pipeline.",
                      "Open a critical finding to inspect grounded evidence and the recommended fix.",
                      "Export the markdown report and close on practical relevance for student and startup teams.",
                    ].map((step, index) => (
                      <div key={step} className="rounded-2xl bg-[var(--surface-muted)] p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface)] text-sm font-semibold">
                            {index + 1}
                          </div>
                          <p className="text-sm leading-6 text-[var(--foreground)]">{step}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="surface-muted rounded-[1.8rem] p-5">
                  <div className="eyebrow">Value Signals</div>
                  <div className="mt-4 grid gap-3">
                    {[
                      {
                        icon: <Shield size={18} />,
                        title: "Serious security product framing",
                        body: "Not just detection. The experience is triage-first, developer-friendly, and aligned to real shipping pressure.",
                      },
                      {
                        icon: <Sparkles size={18} />,
                        title: "NVIDIA NIM-ready reasoning",
                        body: "AI is used where it matters: false-positive reduction, remediation clarity, and prioritization, not for fake findings.",
                      },
                      {
                        icon: <TerminalSquare size={18} />,
                        title: "Public repo demo path",
                        body: "Judges can scan a stable sample repo instantly or try any public repository they want.",
                      },
                    ].map((item) => (
                      <div key={item.title} className="rounded-2xl bg-[var(--surface)] p-4">
                        <div className="flex items-center gap-3 font-semibold">
                          <span className="rounded-xl bg-[var(--accent-soft)] p-2 text-[var(--accent)]">
                            {item.icon}
                          </span>
                          {item.title}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{item.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>

        <aside className="panel-grid">
          <section className="surface-card rounded-[2rem] p-5">
            <div className="eyebrow">Fast Demo Controls</div>
            <div className="mt-4 grid gap-3">
              <button
                type="button"
                onClick={() => {
                  setRepoUrl(DEMO_REPOSITORY_GITHUB_URL);
                  executeScan("demo");
                }}
                className="inline-flex items-center justify-between rounded-2xl bg-[var(--surface-muted)] px-4 py-3 text-left"
              >
                <span>
                  <span className="block font-semibold">Run the vulnerable sample</span>
                  <span className="mt-1 block text-sm text-[var(--muted)]">
                    Stable judge flow with seeded findings
                  </span>
                </span>
                <ArrowUpRight size={18} />
              </button>
              <a
                href={DEMO_REPOSITORY_GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-between rounded-2xl bg-[var(--surface-muted)] px-4 py-3 text-left"
              >
                <span>
                  <span className="block font-semibold">Inspect the sample repo</span>
                  <span className="mt-1 block text-sm text-[var(--muted)]">
                    View intentionally insecure source files
                  </span>
                </span>
                <ExternalLink size={18} />
              </a>
            </div>
          </section>

          <section className="surface-card rounded-[2rem] p-5">
            <div className="eyebrow">Minimum Judge Setup</div>
            <div className="mt-4 grid gap-3">
              {[
                "Paste a GitHub URL or use the built-in demo button.",
                "Optional NVIDIA_NIM_API_KEY upgrades remediation and prioritization.",
                "No database or OAuth setup required for MVP evaluation.",
                "GitHub-to-Vercel deployment works from the repo with standard Next.js defaults.",
              ].map((item) => (
                <div key={item} className="rounded-2xl bg-[var(--surface-muted)] px-4 py-3 text-sm leading-6">
                  {item}
                </div>
              ))}
            </div>
          </section>

          {result ? (
            <section className="surface-card rounded-[2rem] p-5">
              <div className="eyebrow">Agent Runtime</div>
              <div className="mt-4 grid gap-3">
                {result.agentLogs.map((log) => (
                  <div key={log.agent} className="rounded-2xl bg-[var(--surface-muted)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{log.agent}</div>
                        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{log.detail}</p>
                      </div>
                      <span className="rounded-full bg-[var(--surface)] px-3 py-1 font-mono text-xs text-[var(--muted)]">
                        {formatDuration(log.elapsedMs)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="surface-card rounded-[2rem] p-5">
            <div className="eyebrow">Repo Snapshot</div>
            <div className="mt-4 grid gap-3">
              {[
                {
                  title: "Problem",
                  body: "Small teams skip security review because the workflow is manual, fragmented, and easy to deprioritize.",
                },
                {
                  title: "Approach",
                  body: "Combine fast deterministic scanning with NIM-backed reasoning for explanations and prioritized fixes.",
                },
                {
                  title: "Outcome",
                  body: "A launch-ready security review experience that students, startups, and maintainers can actually use.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl bg-[var(--surface-muted)] p-4">
                  <div className="font-semibold">{item.title}</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.body}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <footer className="surface-card rounded-[2rem] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold tracking-[-0.04em]">
              {APP_NAME} is structured for portfolio use after the hackathon.
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              The repository includes architecture notes, a problem statement, presentation
              script, team template, demo corpus, and a clean GitHub-to-Vercel deployment path.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="https://github.com/Rohan5commit/RepoGuardian#readme"
              className="inline-flex items-center gap-2 text-[var(--accent)]"
            >
              README
              <ArrowUpRight size={15} />
            </Link>
            <a
              href="https://vercel.com/new/clone?repository-url=https://github.com/Rohan5commit/RepoGuardian"
              className="inline-flex items-center gap-2 text-[var(--accent)]"
            >
              Deploy on Vercel
              <ArrowUpRight size={15} />
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
