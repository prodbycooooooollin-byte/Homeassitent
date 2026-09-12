import { Hammer } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getPrimaryServer } from "@/lib/server-context";
import { getProjects } from "@/lib/queries/projects";
import { EmptyState } from "@/components/ui/empty-state";
import { ProjectCard } from "@/components/projects/project-card";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { canCreateContent } from "@/lib/auth/permissions";

export const metadata = { title: "Projekte" };

export default async function ProjectsPage() {
  const user = await requireUser();
  const server = await getPrimaryServer();
  const projects = server ? await getProjects(server.id) : [];
  const canCreate = canCreateContent(user.role);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Projekte</h1>
          <p className="text-sm text-ink-muted">Gemeinsame Bauprojekte mit Aufgaben und Materialliste.</p>
        </div>
        {canCreate && <CreateProjectForm />}
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={Hammer}
          title="Noch keine Bauprojekte"
          description="Erstelle das erste gemeinsame Bauprojekt mit Aufgaben und Materialliste."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              canManage={user.role === "ADMIN" || p.createdByUserId === user.id || p.members.some((m) => m.userId === user.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
