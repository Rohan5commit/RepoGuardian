import { promises as fs } from "node:fs";
import path from "node:path";

import {
  DEMO_REPOSITORY_GITHUB_URL,
  DEMO_REPOSITORY_ID,
  DEMO_REPOSITORY_PATH,
} from "@/lib/constants";
import type { RepositoryFile, RepositorySnapshot } from "@/lib/types";

export interface DemoRepositoryDefinition {
  id: string;
  name: string;
  description: string;
  localPath: string;
  githubUrl: string;
}

export const demoRepositories: Record<string, DemoRepositoryDefinition> = {
  [DEMO_REPOSITORY_ID]: {
    id: DEMO_REPOSITORY_ID,
    name: "Insecure Hackathon Starter",
    description:
      "A purposely vulnerable student project used to showcase RepoGuardian's scan pipeline.",
    localPath: DEMO_REPOSITORY_PATH,
    githubUrl: DEMO_REPOSITORY_GITHUB_URL,
  },
};

async function collectFilesFromDirectory(rootDir: string, currentDir: string) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const files: RepositoryFile[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFilesFromDirectory(rootDir, absolutePath)));
      continue;
    }

    const content = await fs.readFile(absolutePath, "utf8");
    const relativePath = path.relative(rootDir, absolutePath).replaceAll("\\", "/");

    files.push({
      path: relativePath,
      size: Buffer.byteLength(content, "utf8"),
      content,
    });
  }

  return files;
}

export async function loadDemoSnapshot(id: string): Promise<RepositorySnapshot> {
  const demo = demoRepositories[id];

  if (!demo) {
    throw new Error(`Unknown demo repository: ${id}`);
  }

  const rootDir = path.join(process.cwd(), "demo", "sample-repo");
  const files = await collectFilesFromDirectory(rootDir, rootDir);

  return {
    target: {
      sourceMode: "demo",
      name: demo.name,
      fullName: `demo/${demo.id}`,
      ref: "built-in",
      url: demo.githubUrl,
      description: demo.description,
      primaryLanguage: "TypeScript",
      pathPrefix: demo.localPath,
    },
    tree: files.map((file) => ({
      path: file.path,
      type: "blob" as const,
      size: file.size,
    })),
    files,
    warnings: [],
    scannedAt: new Date().toISOString(),
  };
}
