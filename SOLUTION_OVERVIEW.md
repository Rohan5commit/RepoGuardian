# Solution Overview

RepoGuardian is a GitHub security and code-risk copilot built for small, fast-moving teams.

The product is intentionally structured around one workflow: paste a public GitHub repository URL, run a scan, inspect the findings, and leave with a short list of the most important fixes.

## Product Design

The interface is optimized for clarity:

- repository input stays at the top
- the agent pipeline is visible during the scan
- the security score and top actions are above the fold
- findings are grouped by severity and backed by evidence
- report export is one click away

This keeps the value obvious within the first few seconds of the demo.

## Methodology

RepoGuardian does not ask AI to invent vulnerabilities. Instead, it uses a layered approach:

1. deterministic rules find grounded signals in code and config
2. contextual extraction gathers surrounding lines to reduce false positives
3. NVIDIA NIM generates concise remediation and prioritization only after evidence exists

That separation matters because it keeps the product credible. The model explains and prioritizes risk; it does not fabricate it.

## Technical Decisions

### Next.js + TypeScript

The app is built with Next.js App Router and TypeScript so the prototype is:

- deployable on Vercel with minimal setup
- straightforward to extend
- familiar for hackathon judges and modern web teams

### Lightweight Server-Side Scanning

The MVP uses a small Node-backed route handler instead of a heavy backend. This keeps the system easy to deploy while still allowing:

- GitHub API access for public repos
- filesystem-backed demo data
- NVIDIA NIM calls for structured reasoning

### Deterministic Scan Rules

The first version focuses on high-signal checks:

- exposed secrets and committed `.env` files
- hardcoded credentials
- localStorage token handling
- weak JWT usage
- permissive CORS
- missing security headers
- dependency drift
- debug artifacts
- suspicious admin or internal routes

This scope is narrow enough to be reliable but broad enough to demonstrate real value.

### Structured AI Output

The Remediation Agent returns a fixed JSON shape so the UI can trust the response:

```json
{
  "title": "string",
  "severity": "critical | high | medium | low",
  "category": "string",
  "issue_summary": "string",
  "developer_explanation": "string",
  "recommended_fix": "string",
  "confidence": "high | medium | low"
}
```

This makes the AI layer presentation-ready and productizable.

## Why This Structure Was Chosen

RepoGuardian is intentionally optimized for a hackathon that rewards both polish and practicality.

The architecture balances:

- enough real functionality to feel useful
- enough structure to feel scalable
- enough polish to demo cleanly
- enough clarity to explain quickly

That combination is what makes the project competition-ready rather than just technically interesting.
