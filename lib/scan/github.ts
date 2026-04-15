import {
  GITHUB_API_BASE,
  SCAN_IGNORE_SEGMENTS,
  TEXT_EXTENSIONS,
} from "@/lib/constants";
import type {
  RepositoryFile,
  RepositorySnapshot,
  RepositoryTarget,
  RepositoryTreeEntry,
} from "@/lib/types";

interface GitHubRepoMetadataResponse {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  default_branch: string;
  stargazers_count: number;
  language: string | null;
}

interface GitHubTreeResponse {
  tree: Array<{ path: string; type: "blob" | "tree"; size?: number; sha?: string }>;
}

interface GitHubContentResponse {
  type: string;
  path: string;
  size: number;
  content?: string;
  encoding?: string;
  download_url?: string | null;
}

export interface ParsedGitHubTarget {
  owner: string;
  repo: string;
  ref?: string;
  pathPrefix?: string;
}

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  return token
    ? ({ Authorization: `Bearer ${token}` } as Record<string, string>)
    : ({} as Record<string, string>);
}

async function fetchGitHubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      ...githubHeaders(),
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

function isInterestingTextPath(filePath: string) {
  const normalized = filePath.toLowerCase();

  if (SCAN_IGNORE_SEGMENTS.some((segment) => normalized.split("/").includes(segment))) {
    return false;
  }

  const basename = normalized.split("/").pop() ?? normalized;
  const exactNames = [
    ".env",
    ".env.local",
    ".env.production",
    "package.json",
    "requirements.txt",
    "dockerfile",
    "next.config.js",
    "next.config.ts",
    "middleware.ts",
    "middleware.js",
  ];

  if (exactNames.includes(basename)) {
    return true;
  }

  const extension = basename.includes(".") ? basename.split(".").at(-1) ?? "" : "";

  return TEXT_EXTENSIONS.has(extension);
}

function scorePath(filePath: string) {
  let score = 0;
  const normalized = filePath.toLowerCase();

  if (normalized.includes(".env")) score += 20;
  if (normalized.endsWith("package.json") || normalized.endsWith("requirements.txt")) score += 18;
  if (normalized.includes("auth")) score += 14;
  if (normalized.includes("admin")) score += 12;
  if (normalized.includes("middleware") || normalized.includes("server")) score += 10;
  if (normalized.includes("config")) score += 8;
  if (normalized.includes("route")) score += 7;
  if (normalized.endsWith(".ts") || normalized.endsWith(".tsx")) score += 6;
  if (normalized.endsWith(".py") || normalized.endsWith(".js")) score += 5;
  return score;
}

function encodeGitHubPath(filePath: string) {
  return filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function decodeContentFile(payload: GitHubContentResponse) {
  if (payload.encoding === "base64" && payload.content) {
    return Buffer.from(payload.content, "base64").toString("utf8");
  }

  return payload.content ?? "";
}

export function parseGitHubRepositoryUrl(input: string): ParsedGitHubTarget | null {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.hostname !== "github.com") {
    return null;
  }

  const parts = url.pathname.split("/").filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, "");

  if (!owner || !repo) {
    return null;
  }

  if (parts[2] === "tree" && parts[3]) {
    return {
      owner,
      repo,
      ref: parts[3],
      pathPrefix: parts.slice(4).join("/"),
    };
  }

  return { owner, repo };
}

export async function fetchGitHubSnapshot(
  parsed: ParsedGitHubTarget,
): Promise<RepositorySnapshot> {
  const repoMetadata = await fetchGitHubJson<GitHubRepoMetadataResponse>(
    `${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}`,
  );

  const ref = parsed.ref ?? repoMetadata.default_branch;
  const tree = await fetchGitHubJson<GitHubTreeResponse>(
    `${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  );

  const scopedTree = tree.tree.filter((entry) => {
    if (entry.type !== "blob" || !entry.path) {
      return false;
    }

    if (parsed.pathPrefix && !entry.path.startsWith(parsed.pathPrefix)) {
      return false;
    }

    return isInterestingTextPath(entry.path);
  });

  const selectedFiles = scopedTree
    .sort((left, right) => scorePath(right.path) - scorePath(left.path))
    .slice(0, 45);

  const fileContents = await Promise.all(
    selectedFiles.map(async (file): Promise<RepositoryFile> => {
      const payload = await fetchGitHubJson<GitHubContentResponse>(
        `${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/${encodeGitHubPath(file.path)}?ref=${encodeURIComponent(ref)}`,
      );

      const content =
        payload.download_url && !payload.content
          ? await fetch(payload.download_url, { next: { revalidate: 0 } }).then((response) =>
              response.text(),
            )
          : decodeContentFile(payload);

      return {
        path: file.path,
        size: file.size ?? payload.size ?? Buffer.byteLength(content, "utf8"),
        content,
      };
    }),
  );

  const target: RepositoryTarget = {
    sourceMode: "live",
    name: repoMetadata.name,
    fullName: repoMetadata.full_name,
    owner: parsed.owner,
    repo: parsed.repo,
    ref,
    url: repoMetadata.html_url,
    description: repoMetadata.description,
    primaryLanguage: repoMetadata.language,
    pathPrefix: parsed.pathPrefix,
    stars: repoMetadata.stargazers_count,
  };

  return {
    target,
    tree: scopedTree.map(
      (entry): RepositoryTreeEntry => ({
        path: entry.path,
        type: entry.type,
        size: entry.size ?? 0,
        sha: entry.sha,
      }),
    ),
    files: fileContents,
    scannedAt: new Date().toISOString(),
  };
}
