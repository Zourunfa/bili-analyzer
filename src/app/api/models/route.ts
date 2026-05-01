import { NextResponse } from "next/server";
import { getConfiguredModelProviders, getDefaultModelId } from "@/lib/llm";

export async function GET() {
  return NextResponse.json({
    defaultModelId: getDefaultModelId(),
    providers: getConfiguredModelProviders(),
  });
}
