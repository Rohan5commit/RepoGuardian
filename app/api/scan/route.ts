import { NextRequest, NextResponse } from "next/server";

import { ScanValidationError, runRepoGuardianScan } from "@/lib/scan";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { repoUrl?: string; demoId?: string };
    const result = await runRepoGuardianScan(body);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "RepoGuardian could not complete the scan.";

    const isValidation = error instanceof ScanValidationError;
    const isGitHubUpstream =
      error instanceof Error && error.message.startsWith("GitHub API request failed:");

    return NextResponse.json(
      {
        error: message,
        code: isValidation
          ? "invalid_request"
          : isGitHubUpstream
            ? "github_upstream_failure"
            : "scan_failed",
      },
      { status: isValidation ? 400 : isGitHubUpstream ? 502 : 500 },
    );
  }
}
