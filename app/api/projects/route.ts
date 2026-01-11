import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { PROJECT_COOKIE_NAME, getAvailableProjects, resolveActiveProject } from "@/lib/projects";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const { project, projects, selectedProjectId } = resolveActiveProject(req);

  return NextResponse.json({
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
    activeProject: { id: project.id, name: project.name },
    selectedProjectId: selectedProjectId || project.id,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  try {
    const body = await req.json();
    const projectId = String(body?.projectId || "").trim();

    const projects = getAvailableProjects();
    const exists = projectId ? projects.some((p) => p.id === projectId) : false;

    const res = NextResponse.json({
      success: true,
      selectedProjectId: exists ? projectId : null,
    });

    if (!projectId || !exists) {
      res.cookies.set(PROJECT_COOKIE_NAME, "", { path: "/", maxAge: 0 });
      return res;
    }

    res.cookies.set(PROJECT_COOKIE_NAME, projectId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return res;
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message || "Failed to set project" }),
      { status: 500 }
    );
  }
}
