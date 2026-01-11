export type GTMDProject = {
  id: string;
  name: string;
  storiesRepo?: string;
  testcasesRepo?: string;
};

export const PROJECT_COOKIE_NAME = "gtmd_project";

function getCookie(req: Request, name: string): string | undefined {
  const cookieHeader = req.headers.get("cookie") || "";
  if (!cookieHeader) return undefined;

  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    const k = p.slice(0, eq).trim();
    const v = p.slice(eq + 1);
    if (k === name) return decodeURIComponent(v);
  }
  return undefined;
}

function normalizeProjects(raw: unknown): GTMDProject[] {
  if (!Array.isArray(raw)) return [];

  const out: GTMDProject[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as any;
    const id = String(obj.id || "").trim();
    const name = String(obj.name || "").trim();
    const storiesRepo = typeof obj.storiesRepo === "string" ? obj.storiesRepo.trim() : "";
    const testcasesRepo = typeof obj.testcasesRepo === "string" ? obj.testcasesRepo.trim() : "";
    if (!id || !name) continue;
    out.push({
      id,
      name,
      storiesRepo: storiesRepo || undefined,
      testcasesRepo: testcasesRepo || undefined,
    });
  }
  return out;
}

export function getProjectsFromEnv(): GTMDProject[] {
  const raw = process.env.GTMD_PROJECTS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return normalizeProjects(parsed);
  } catch {
    return [];
  }
}

export function getAvailableProjects(): GTMDProject[] {
  const envProjects = getProjectsFromEnv();
  if (envProjects.length > 0) return envProjects;

  return [
    {
      id: "default",
      name: "Default",
      storiesRepo: process.env.STORIES_REPO || "",
      testcasesRepo: process.env.TESTCASES_REPO || "",
    },
  ];
}

export function getSelectedProjectId(req: Request): string | null {
  try {
    const url = new URL(req.url);
    const fromQuery = (url.searchParams.get("project") || "").trim();
    if (fromQuery) return fromQuery;
  } catch {
    // ignore
  }

  const fromCookie = (getCookie(req, PROJECT_COOKIE_NAME) || "").trim();
  return fromCookie || null;
}

export function resolveActiveProject(req: Request): {
  project: GTMDProject;
  projects: GTMDProject[];
  selectedProjectId: string | null;
} {
  const projects = getAvailableProjects();
  const selectedProjectId = getSelectedProjectId(req);

  const byId = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId)
    : undefined;

  const project = byId || projects[0] || { id: "default", name: "Default" };
  return { project, projects, selectedProjectId };
}

export function getRepoEnv(req: Request, kind: "stories" | "testcases"): string | undefined {
  const { project } = resolveActiveProject(req);

  if (kind === "stories") {
    return project.storiesRepo || process.env.STORIES_REPO || undefined;
  }

  return project.testcasesRepo || process.env.TESTCASES_REPO || undefined;
}
