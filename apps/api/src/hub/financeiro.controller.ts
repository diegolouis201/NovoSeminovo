import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { FinAccountInputSchema, FinEntryEditSchema, FinEntryInputSchema, FinImportInputSchema, FinPayInputSchema, FinTransferInputSchema } from "@novoseminovo/shared-types";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { parseOrBadRequest } from "../common/parse";
import { FinanceiroService } from "./financeiro.service";
import { HubGuard, HubPermissionRequired } from "./hub.guard";

type Me = { id: string };
const Dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
// Hoje no fuso de Brasília.
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const LancFiltro = z.object({
  tipo: z.enum(["receber", "pagar"]).optional(),
  status: z.enum(["aberto", "pago", "cancelado", "vencido"]).optional(),
  mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  categoria: z.string().regex(/^[A-Z]\d{2}$/).optional(),
  q: z.string().max(100).optional(),
  conta: Id.optional(),
});

// Financeiro do Hub: só quem tem a permissão "financeiro" (dono e perfil
// financeiro).
@UseGuards(JwtAuthGuard, HubGuard)
@HubPermissionRequired("financeiro")
@Controller("hub/financeiro")
export class FinanceiroController {
  constructor(private readonly fin: FinanceiroService) {}

  @Get("painel")
  painel(@Query("ano") ano?: string) {
    const a = parseOrBadRequest(z.coerce.number().int().min(2020).max(2100).optional(), ano) ?? Number(hoje().slice(0, 4));
    return this.fin.painel(a, hoje());
  }

  @Get("lancamentos")
  lancamentos(@Query() query: unknown) {
    const f = parseOrBadRequest(LancFiltro, query);
    return this.fin.lancamentos({ tipo: f.tipo, status: f.status, mes: f.mes, categoria: f.categoria, q: f.q, contaId: f.conta }, hoje());
  }

  @Post("lancamentos")
  criar(@CurrentUser() me: Me, @Body() body: unknown) {
    return this.fin.criarLancamento(parseOrBadRequest(FinEntryInputSchema, body), me.id);
  }

  @Post("lancamentos/:id/baixar")
  async baixar(@Param("id") id: string, @Body() body: unknown) {
    await this.fin.baixar(parseOrBadRequest(Id, id), parseOrBadRequest(FinPayInputSchema, body));
    return { ok: true };
  }

  @Post("lancamentos/:id/reabrir")
  async reabrir(@Param("id") id: string) {
    await this.fin.reabrir(parseOrBadRequest(Id, id));
    return { ok: true };
  }

  @Post("lancamentos/:id/cancelar")
  async cancelar(@Param("id") id: string) {
    await this.fin.cancelar(parseOrBadRequest(Id, id));
    return { ok: true };
  }

  @Post("lancamentos/:id")
  async editar(@Param("id") id: string, @Body() body: unknown) {
    await this.fin.editar(parseOrBadRequest(Id, id), parseOrBadRequest(FinEntryEditSchema, body));
    return { ok: true };
  }

  @Get("contas")
  contas() {
    return this.fin.contas();
  }

  @Post("contas")
  criarConta(@Body() body: unknown) {
    return this.fin.criarConta(parseOrBadRequest(FinAccountInputSchema, body));
  }

  @Post("transferencias")
  transferir(@Body() body: unknown) {
    return this.fin.transferir(parseOrBadRequest(FinTransferInputSchema, body));
  }

  @Post("importar")
  importar(@CurrentUser() me: Me, @Body() body: unknown) {
    return this.fin.importar(parseOrBadRequest(FinImportInputSchema, body), me.id);
  }

  @Get("extrato")
  extrato(@Query("conta") conta?: string, @Query("de") de?: string, @Query("ate") ate?: string) {
    const h = hoje();
    const inicio = parseOrBadRequest(Dia.optional(), de) ?? `${h.slice(0, 7)}-01`;
    return this.fin.extrato({ contaId: parseOrBadRequest(Id.optional(), conta), de: inicio, ate: parseOrBadRequest(Dia.optional(), ate) ?? h }, h);
  }

  @Get("fluxo")
  fluxo(@Query("meses") meses?: string) {
    return this.fin.fluxo(hoje(), parseOrBadRequest(z.coerce.number().int().min(1).max(24).optional(), meses) ?? 6);
  }

  @Get("dre")
  dre(@Query("ano") ano?: string, @Query("regime") regime?: string) {
    const a = parseOrBadRequest(z.coerce.number().int().min(2020).max(2100).optional(), ano) ?? Number(hoje().slice(0, 4));
    return this.fin.dre(a, parseOrBadRequest(z.enum(["competencia", "caixa"]).optional(), regime) ?? "competencia");
  }
}
