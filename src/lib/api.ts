import { NextResponse } from "next/server";
import { ApiError } from "@/lib/auth";

/** پاسخ خطای یکدست برای API */
export function apiError(e: unknown) {
  if (e instanceof ApiError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error(e);
  return NextResponse.json({ error: "خطای غیرمنتظره در سرور" }, { status: 500 });
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function readBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError("بدنه درخواست نامعتبر است", 400);
  }
}
