import { NextResponse } from "next/server";
import { listTeamRoster } from "@/lib/auth/team-roster";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const members = await listTeamRoster(session.email);
    return NextResponse.json({
      name: "All In Capital",
      members,
    });
  } catch (err) {
    console.error("Failed to load team roster", err);
    return NextResponse.json(
      { error: "Failed to load team." },
      { status: 500 },
    );
  }
}
