import type {
  Confidence,
  Effort,
  Exploitability,
  Severity,
} from "@/lib/types";

export interface LineRule {
  id: string;
  title: string;
  category: string;
  severity: Severity;
  confidence: Confidence;
  exploitability: Exploitability;
  remediationEffort: Effort;
  tags: string[];
  pattern: RegExp;
  evidence: string;
}

export const secretRules: LineRule[] = [
  {
    id: "secret-private-key",
    title: "Private key material committed to the repository",
    category: "Secrets",
    severity: "critical",
    confidence: "high",
    exploitability: "high",
    remediationEffort: "deep",
    tags: ["secret", "credentials", "rotation"],
    pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    evidence: "A private key block is present in repository content.",
  },
  {
    id: "secret-hardcoded-generic",
    title: "Hardcoded credential detected in source or config",
    category: "Secrets",
    severity: "high",
    confidence: "medium",
    exploitability: "high",
    remediationEffort: "fast",
    tags: ["secret", "env", "hardcoded"],
    pattern:
      /\b(api[_-]?key|secret|token|password|passwd|client[_-]?secret|jwt[_-]?secret)\b.{0,30}[:=].{0,10}["'][^"']{8,}["']/i,
    evidence: "Credential-shaped identifier is assigned a string literal.",
  },
  {
    id: "secret-env-file",
    title: "Environment file with likely live secrets is committed",
    category: "Secrets",
    severity: "critical",
    confidence: "high",
    exploitability: "high",
    remediationEffort: "deep",
    tags: ["secret", "env", "history"],
    pattern:
      /^\s*([A-Z0-9_]+)\s*=\s*([A-Za-z0-9_\-]{8,}|sk-[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9_]+)/im,
    evidence: "A committed environment file contains non-placeholder values.",
  },
];

export const authAndConfigRules: LineRule[] = [
  {
    id: "auth-localstorage-token",
    title: "Auth token stored in browser localStorage",
    category: "Authentication",
    severity: "high",
    confidence: "high",
    exploitability: "high",
    remediationEffort: "moderate",
    tags: ["localStorage", "token", "xss"],
    pattern:
      /localStorage\.(setItem|getItem)\(\s*["'`][^"'`]*(token|auth|jwt|session)[^"'`]*["'`]/i,
    evidence: "Tokens in localStorage are reachable from injected JavaScript during XSS events.",
  },
  {
    id: "auth-jwt-hardcoded-secret",
    title: "JWT operation uses a hardcoded secret",
    category: "Authentication",
    severity: "high",
    confidence: "high",
    exploitability: "high",
    remediationEffort: "moderate",
    tags: ["jwt", "secret", "auth"],
    pattern:
      /jwt\.(sign|verify)\([^,\n]+,\s*["'][^"']{6,}["']/i,
    evidence: "JWT signing or verification uses an inline secret instead of a managed secret.",
  },
  {
    id: "auth-jwt-decode-without-verify",
    title: "JWT payload is decoded without signature verification",
    category: "Authentication",
    severity: "high",
    confidence: "high",
    exploitability: "medium",
    remediationEffort: "moderate",
    tags: ["jwt", "verification"],
    pattern: /jwt\.decode\(/i,
    evidence: "Decoding alone does not validate signature integrity or token trust.",
  },
  {
    id: "config-cors-wildcard",
    title: "Permissive CORS configuration allows every origin",
    category: "Configuration",
    severity: "high",
    confidence: "high",
    exploitability: "high",
    remediationEffort: "fast",
    tags: ["cors", "headers", "origin"],
    pattern: /(Access-Control-Allow-Origin|origin)\s*[:=]\s*["']\*["']/i,
    evidence: "A wildcard origin was found in a CORS-related configuration.",
  },
  {
    id: "config-cors-credentials-wildcard",
    title: "CORS allows credentials with a wildcard origin",
    category: "Configuration",
    severity: "critical",
    confidence: "high",
    exploitability: "high",
    remediationEffort: "fast",
    tags: ["cors", "credentials", "cookies"],
    pattern: /cors\(\s*\{[^}]*origin:\s*["']\*["'][^}]*credentials:\s*true/i,
    evidence: "Cookies or auth headers can leak when wildcard origin and credentials coexist.",
  },
  {
    id: "config-debug-mode",
    title: "Debug mode or verbose diagnostics appear enabled",
    category: "Operational Risk",
    severity: "medium",
    confidence: "medium",
    exploitability: "medium",
    remediationEffort: "fast",
    tags: ["debug", "diagnostics"],
    pattern:
      /\b(debug\s*[:=]\s*true|app\.run\([^)]*debug\s*=\s*True|VERBOSE_LOGGING\s*=\s*true)\b/i,
    evidence: "A debug-oriented flag is present in code intended for application runtime.",
  },
  {
    id: "config-admin-route",
    title: "Sensitive admin or internal route appears exposed",
    category: "Routing",
    severity: "medium",
    confidence: "medium",
    exploitability: "medium",
    remediationEffort: "moderate",
    tags: ["admin", "routing", "surface-area"],
    pattern:
      /(app|router)\.(get|post|use|all)\(\s*["'`](\/(admin|internal|superuser|manage|root)[^"'`]*)["'`]/i,
    evidence: "A route with privileged naming was found in application code.",
  },
  {
    id: "config-console-secret",
    title: "Sensitive values are logged to the console",
    category: "Operational Risk",
    severity: "medium",
    confidence: "medium",
    exploitability: "low",
    remediationEffort: "fast",
    tags: ["logging", "secret", "diagnostics"],
    pattern:
      /console\.log\([^)]*(secret|token|password|process\.env)[^)]*\)/i,
    evidence: "Diagnostic logging appears to expose secrets or environment values.",
  },
];

export const placeholderMarkers = [
  "example",
  "placeholder",
  "dummy",
  "sample",
  "changeme",
  "your_",
  "your-",
];
