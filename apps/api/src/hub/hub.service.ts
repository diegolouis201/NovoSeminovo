import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  type HubAccess,
  type HubGoal,
  type HubMark,
  type HubMarkInput,
  HubMarkInputSchema,
  type HubMemberInput,
  type HubProfile,
  type HubTask,
  type HubTaskInput,
  HubTaskInputSchema,
  hubPermissionsOf,
} from "@novoseminovo/shared-types";
import { PrismaService } from "../prisma/prisma.service";

// NovoSeminovo Hub: quem entra (perfil), tarefas e meta do mês. Os dados das
// empresas vêm do CrmService (mesmo feed do CRM) e as ações do Comercial
// (etapa, anotação, próximo contato) continuam no SalesService.

type TaskRow = {
  id: string;
  title: string;
  kind: string;
  dueAt: Date;
  notes: string | null;
  doneAt: Date | null;
  prospect: { id: string; name: string } | null;
  assignee: { name: string } | null;
  createdById: string;
};

@Injectable()
export class HubService {
  constructor(private readonly prisma: PrismaService) {}

  // Perfil de AGORA (não o do token): suspenso ou acesso desligado sai na hora.
  async access(userId: string): Promise<HubAccess | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, status: true, hubMember: { select: { profile: true, active: true } } },
    });
    if (!user || user.status !== "active") return null;
    let profile: HubProfile | null = null;
    if (user.role === "admin") profile = "dono";
    else if (user.hubMember?.active && hubPermissionsOf(user.hubMember.profile).length) profile = user.hubMember.profile as HubProfile;
    if (!profile) return null;
    return { userId: user.id, name: user.name, email: user.email, profile, permissions: hubPermissionsOf(profile) };
  }

  async members() {
    const rows = await this.prisma.hubMember.findMany({
      orderBy: { createdAt: "asc" },
      select: { profile: true, active: true, createdAt: true, user: { select: { id: true, name: true, email: true, status: true } } },
    });
    return rows.map((r) => ({ userId: r.user.id, name: r.user.name, email: r.user.email, profile: r.profile, active: r.active && r.user.status === "active", since: r.createdAt.toISOString() }));
  }

  // Dá (ou muda) o perfil de alguém da equipe. Cria a conta se o e-mail ainda
  // não existir — a pessoa define a senha pelo "esqueci minha senha".
  async saveMember(input: HubMemberInput, byUserId: string) {
    let user = await this.prisma.user.findUnique({ where: { email: input.email }, select: { id: true, role: true } });
    if (user?.role === "admin") throw new BadRequestException("Essa conta já é dona do Hub.");
    if (!user) {
      if (!input.name) throw new BadRequestException("Informe o nome da pessoa.");
      user = await this.prisma.user.create({ data: { name: input.name, email: input.email, role: input.profile === "comercial" ? "sales" : "buyer" }, select: { id: true, role: true } });
    } else if (input.profile === "comercial" && user.role === "buyer") {
      await this.prisma.user.update({ where: { id: user.id }, data: { role: "sales" } });
    }
    await this.prisma.hubMember.upsert({
      where: { userId: user.id },
      create: { userId: user.id, profile: input.profile, createdById: byUserId },
      update: { profile: input.profile, active: true },
    });
    return { userId: user.id };
  }

  async setMemberActive(userId: string, active: boolean) {
    const { count } = await this.prisma.hubMember.updateMany({ where: { userId }, data: { active } });
    if (!count) throw new NotFoundException("Pessoa não encontrada na equipe do Hub.");
  }

  async tasks(filter: { status: "abertas" | "concluidas"; prospectId?: string }): Promise<HubTask[]> {
    const rows: TaskRow[] = await this.prisma.hubTask.findMany({
      where: { doneAt: filter.status === "abertas" ? null : { not: null }, ...(filter.prospectId ? { prospectId: filter.prospectId } : {}) },
      orderBy: filter.status === "abertas" ? { dueAt: "asc" } : { doneAt: "desc" },
      take: filter.status === "abertas" ? 500 : 50,
      select: { id: true, title: true, kind: true, dueAt: true, notes: true, doneAt: true, createdById: true, prospect: { select: { id: true, name: true } }, assignee: { select: { name: true } } },
    });
    const creators = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, name: true } });
    const nameOf = new Map(creators.map((c) => [c.id, c.name]));
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind as HubTask["kind"],
      dueAt: r.dueAt.toISOString(),
      notes: r.notes ?? undefined,
      empresa: r.prospect ? { id: r.prospect.id, nome: r.prospect.name } : undefined,
      responsavel: r.assignee?.name ?? nameOf.get(r.createdById),
      concluidaEm: r.doneAt?.toISOString(),
    }));
  }

  async createTask(raw: HubTaskInput, byUserId: string) {
    const input = HubTaskInputSchema.parse(raw);
    if (input.prospectId && !(await this.prisma.salesProspect.findUnique({ where: { id: input.prospectId }, select: { id: true } }))) {
      throw new NotFoundException("Empresa não encontrada.");
    }
    if (input.assigneeId && !(await this.access(input.assigneeId))) throw new BadRequestException("Responsável não faz parte da equipe do Hub.");
    return this.prisma.hubTask.create({
      data: { title: input.title, kind: input.kind, dueAt: new Date(input.dueAt), notes: input.notes, prospectId: input.prospectId, assigneeId: input.assigneeId, createdById: byUserId },
      select: { id: true },
    });
  }

  async completeTask(id: string, byUserId: string) {
    const { count } = await this.prisma.hubTask.updateMany({ where: { id, doneAt: null }, data: { doneAt: new Date(), doneById: byUserId } });
    if (!count) throw new NotFoundException("Tarefa não encontrada ou já concluída.");
  }

  async goal(month: string): Promise<HubGoal | null> {
    const row = await this.prisma.hubGoal.findUnique({ where: { month } });
    return row ? { month: row.month, newSubscriptions: row.newSubscriptions, revenue: Number(row.revenue) } : null;
  }

  async saveGoal(goal: HubGoal) {
    await this.prisma.hubGoal.upsert({
      where: { month: goal.month },
      create: { month: goal.month, newSubscriptions: goal.newSubscriptions, revenue: goal.revenue },
      update: { newSubscriptions: goal.newSubscriptions, revenue: goal.revenue },
    });
  }

  async marks(): Promise<Record<string, HubMark>> {
    const rows = await this.prisma.hubMark.findMany();
    return Object.fromEntries(
      rows.map((r) => [
        r.key,
        {
          importante: r.importante,
          motivoImportante: r.motivoImportante ?? undefined,
          naoContatar: r.naoContatar,
          motivoNaoContatar: r.motivoNaoContatar ?? undefined,
          naoContatarEm: r.naoContatarEm?.toISOString(),
          tags: r.tags,
          nota: r.nota ?? undefined,
          atualizadoEm: r.updatedAt.toISOString(),
        },
      ]),
    );
  }

  async saveMark(key: string, raw: HubMarkInput, byUserId: string) {
    const input = HubMarkInputSchema.parse(raw);
    const data = {
      ...input,
      ...(input.tags ? { tags: [...new Set(input.tags)] } : {}),
      ...(input.naoContatar === true ? { naoContatarEm: new Date() } : input.naoContatar === false ? { naoContatarEm: null } : {}),
      updatedById: byUserId,
    };
    await this.prisma.hubMark.upsert({ where: { key }, create: { key, ...data }, update: data });
  }
}
