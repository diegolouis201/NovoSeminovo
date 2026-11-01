import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { Prisma, PrismaClient } from "@novoseminovo/db";
import { currentSecret } from "../auth/secret-file";

// Dados pessoais sensíveis (CPF, telefones, chave Pix) ficam criptografados
// no banco com AES-256-GCM. Quem roubar uma cópia do banco (ou um backup) vê
// só "enc:v1:...". A chave é o arquivo secrets/data_key do servidor (nunca no
// GitHub) — PERDER esse arquivo = perder esses dados; ver DEPLOY.md.
//
// O código do site não precisa saber disso: o middleware do PrismaService
// criptografa ao gravar, descriptografa ao ler e troca busca por igualdade
// (`where: { cpf }`, `phone: { in: [...] }`) pelo "índice cego" (HMAC do
// valor normalizado, coluna *Hash). Busca por pedaço (`contains`) num campo
// criptografado é recusada — não tem como funcionar.

export type DataKeys = { enc: Buffer; mac: Buffer };

const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

// modelo → campo criptografado → coluna do índice cego (null = sem busca).
export const ENCRYPTED_FIELDS: Record<string, Record<string, string | null>> = {
  User: { cpf: "cpfHash", phone: "phoneHash" },
  Lead: { contactPhone: "contactPhoneHash" },
  ListingContact: { phone: "phoneHash" },
  FinancingDeal: { buyerPhone: "buyerPhoneHash" },
  FinancingLead: { phone: "phoneHash" },
  MarketingContact: { phone: "phoneHash" },
  Affiliate: { pixKey: null },
};

const ENCRYPTED_NAMES = new Set(Object.values(ENCRYPTED_FIELDS).flatMap((f) => Object.keys(f)));
const HASH_NAMES = new Set(
  Object.values(ENCRYPTED_FIELDS).flatMap((f) => Object.values(f).filter((h): h is string => Boolean(h))),
);

export function deriveDataKeys(secret: string): DataKeys {
  const derive = (info: string) => Buffer.from(hkdfSync("sha256", secret, "novoseminovo", info, 32));
  return { enc: derive("criptografia-de-campo"), mac: derive("indice-cego") };
}

let cachedKeys: { secret: string; keys: DataKeys } | undefined;
export function currentDataKeys(): DataKeys {
  const secret = currentSecret("DATA_KEY");
  if (cachedKeys?.secret !== secret) cachedKeys = { secret, keys: deriveDataKeys(secret) };
  return cachedKeys.keys;
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptField(plain: string, keys: DataKeys): string {
  if (isEncrypted(plain)) return plain;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keys.enc, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptField(stored: string, keys: DataKeys): string {
  if (!isEncrypted(stored)) return stored;
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", keys.enc, raw.subarray(0, IV_BYTES));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
}

// CPF: só dígitos. Telefone: só dígitos, sem o 55 do Brasil na frente.
function normalizeForIndex(field: string, value: string): string {
  const digits = value.replace(/\D/g, "");
  if (/phone/i.test(field)) return digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits;
  if (field === "cpf") return digits;
  return value.trim().toLowerCase();
}

export function blindIndex(field: string, value: string, keys: DataKeys): string {
  return createHmac("sha256", keys.mac).update(`${field}:${normalizeForIndex(field, value)}`).digest("hex");
}

// ---------------------------------------------------------------- Prisma

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

// campo de relação → modelo do outro lado (lido do schema gerado).
const relations = new Map<string, Map<string, string>>(
  Prisma.dmmf.datamodel.models.map((m) => [
    m.name,
    new Map(m.fields.filter((f) => f.kind === "object").map((f) => [f.name, f.type as string])),
  ]),
);

function refuse(model: string, field: string): never {
  throw new Error(`${model}.${field} é criptografado: só dá para buscar por valor exato (igual / in / not).`);
}

function rewriteWhere(model: string, where: unknown, keys: () => DataKeys): void {
  if (Array.isArray(where)) return where.forEach((w) => rewriteWhere(model, w, keys));
  if (!isObj(where)) return;
  const enc = ENCRYPTED_FIELDS[model] ?? {};
  for (const [key, value] of Object.entries(where)) {
    if (key === "AND" || key === "OR" || key === "NOT") {
      rewriteWhere(model, value, keys);
    } else if (key in enc) {
      const hashField = enc[key];
      if (!hashField) refuse(model, key);
      const idx = (v: unknown) => (v === null ? null : typeof v === "string" ? blindIndex(key, v, keys()) : refuse(model, key));
      let filter: unknown;
      if (value === null || typeof value === "string") filter = idx(value);
      else if (isObj(value)) {
        filter = {};
        for (const [op, operand] of Object.entries(value)) {
          if (op === "equals" || op === "not") (filter as Obj)[op] = isObj(operand) ? refuse(model, key) : idx(operand);
          else if ((op === "in" || op === "notIn") && Array.isArray(operand)) (filter as Obj)[op] = operand.map(idx);
          else refuse(model, key);
        }
      } else refuse(model, key);
      delete where[key];
      where[hashField] = filter;
    } else {
      const related = relations.get(model)?.get(key);
      if (!related || !isObj(value)) continue;
      const ops = ["some", "every", "none", "is", "isNot"].filter((op) => op in value);
      if (ops.length) ops.forEach((op) => rewriteWhere(related, value[op], keys));
      else rewriteWhere(related, value, keys);
    }
  }
}

function encryptData(model: string, data: unknown, keys: () => DataKeys): void {
  if (Array.isArray(data)) return data.forEach((d) => encryptData(model, d, keys));
  if (!isObj(data)) return;
  const enc = ENCRYPTED_FIELDS[model] ?? {};
  for (const [key, raw] of Object.entries(data)) {
    if (key in enc) {
      const value = isObj(raw) && "set" in raw ? raw.set : raw;
      if (value !== null && value !== undefined && typeof value !== "string") refuse(model, key);
      const hashField = enc[key];
      data[key] = value == null ? value : encryptField(value, keys());
      if (hashField) data[hashField] = value == null ? null : blindIndex(key, value, keys());
      continue;
    }
    const related = relations.get(model)?.get(key);
    if (!related || !isObj(raw)) continue;
    for (const [op, arg] of Object.entries(raw)) {
      const each = (fn: (x: Obj) => void) => (Array.isArray(arg) ? arg : [arg]).forEach((x) => isObj(x) && fn(x));
      switch (op) {
        case "create":
          encryptData(related, arg, keys);
          break;
        case "createMany":
          each((x) => encryptData(related, x.data, keys));
          break;
        case "update":
        case "updateMany":
          each((x) => {
            if ("data" in x) {
              encryptData(related, x.data, keys);
              rewriteWhere(related, x.where, keys);
            } else encryptData(related, x, keys);
          });
          break;
        case "upsert":
          each((x) => {
            encryptData(related, x.create, keys);
            encryptData(related, x.update, keys);
            rewriteWhere(related, x.where, keys);
          });
          break;
        case "connectOrCreate":
          each((x) => {
            encryptData(related, x.create, keys);
            rewriteWhere(related, x.where, keys);
          });
          break;
        default:
          each((x) => rewriteWhere(related, x, keys));
      }
    }
  }
}

// select/include com `where` em relação (ex.: include: { contacts: { where } }).
function rewriteNestedQueries(model: string, args: unknown, keys: () => DataKeys): void {
  if (!isObj(args)) return;
  for (const part of ["select", "include"]) {
    const sel = args[part];
    if (!isObj(sel)) continue;
    for (const [key, value] of Object.entries(sel)) {
      const related = relations.get(model)?.get(key);
      if (!related || !isObj(value)) continue;
      rewriteWhere(related, value.where, keys);
      rewriteNestedQueries(related, value, keys);
    }
  }
}

export function decryptResult(result: unknown, keys: () => DataKeys): unknown {
  if (Array.isArray(result)) {
    result.forEach((r) => decryptResult(r, keys));
  } else if (isObj(result)) {
    for (const [key, value] of Object.entries(result)) {
      if (HASH_NAMES.has(key)) delete result[key];
      else if (ENCRYPTED_NAMES.has(key) && isEncrypted(value)) result[key] = decryptField(value, keys());
      else if (typeof value === "object" && value !== null) decryptResult(value, keys);
    }
  }
  return result;
}

export function fieldEncryptionMiddleware(keys: () => DataKeys = currentDataKeys): Prisma.Middleware {
  return async (params, next) => {
    const model = params.model;
    const args = params.args as Obj | undefined;
    if (model && isObj(args)) {
      rewriteWhere(model, args.where, keys);
      rewriteNestedQueries(model, args, keys);
      if (params.action === "upsert") {
        encryptData(model, args.create, keys);
        encryptData(model, args.update, keys);
      } else {
        encryptData(model, args.data, keys);
      }
    }
    const result = await next(params);
    // $queryRaw/$executeRaw (sem modelo) devolvem o que está no banco.
    return model ? decryptResult(result, keys) : result;
  };
}

// Na subida da API: criptografa o que ainda estiver em texto puro (dados de
// antes desta mudança, seed). Idempotente — linha já criptografada é pulada.
// `plain` é um cliente SEM o middleware (para enxergar o texto puro).
type Delegate = { findMany(a: unknown): Promise<Obj[]>; update(a: unknown): Promise<unknown> };
const delegateOf = (client: unknown, model: string) =>
  (client as Record<string, Delegate>)[model.charAt(0).toLowerCase() + model.slice(1)];

export async function encryptExistingRows(prisma: unknown, plain?: PrismaClient): Promise<number> {
  const raw = plain ?? new PrismaClient();
  let changed = 0;
  try {
    for (const [model, fields] of Object.entries(ENCRYPTED_FIELDS)) {
      const names = Object.keys(fields);
      const select = Object.fromEntries([["id", true], ...names.map((n) => [n, true])]);
      // NOT startsWith no SQL já deixa de fora as linhas com o campo vazio.
      const where = { OR: names.map((n) => ({ NOT: { [n]: { startsWith: PREFIX } } })) };
      for (;;) {
        const rows = await delegateOf(raw, model).findMany({ where, select, take: 200 });
        let batch = 0;
        for (const row of rows) {
          const data: Obj = {};
          for (const n of names) if (typeof row[n] === "string" && !isEncrypted(row[n])) data[n] = row[n];
          if (!Object.keys(data).length) continue;
          await delegateOf(prisma, model).update({ where: { id: row.id }, data });
          batch++;
        }
        changed += batch;
        if (rows.length < 200 || batch === 0) break;
      }
    }
  } finally {
    if (!plain) await raw.$disconnect();
  }
  return changed;
}
