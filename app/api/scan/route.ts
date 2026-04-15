import { NextRequest, NextResponse } from "next/server";

import { runRepoGuardianScan } from "@/lib/scan";

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

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
