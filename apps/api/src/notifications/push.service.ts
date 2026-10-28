import { Injectable, Logger } from "@nestjs/common";
import { createSign, sign as cryptoSign } from "node:crypto";
import { connect, type ClientHttp2Session } from "node:http2";
import { PrismaService } from "../prisma/prisma.service";

// Push para o app (mobile/): Android pelo Firebase Cloud Messaging (API v1)
// e iPhone direto pela Apple (APNs). Sem as chaves no .env, não manda nada
// e o resto do site segue igual — o aviso continua no sino e por e-mail.
//   FCM_SERVICE_ACCOUNT: JSON da conta de serviço do Firebase, em base64.
//   APNS_KEY (.p8 em base64), APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID.

export type PushMessage = { title: string; body: string; link?: string };

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function fcmMessage(token: string, message: PushMessage) {
  return {
    message: {
      token,
      notification: { title: message.title, body: message.body },
      data: message.link ? { link: message.link } : {},
      android: { priority: "high", notification: { sound: "default" } },
    },
  };
}

export function apnsPayload(message: PushMessage) {
  return { aps: { alert: { title: message.title, body: message.body }, sound: "default" }, ...(message.link ? { link: message.link } : {}) };
}

// JWT do APNs: ES256 com a chave .p8, vale até 1h (renovamos a cada 50 min).
export function apnsJwt(keyPem: string, keyId: string, teamId: string, now = Date.now()): string {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = base64url(JSON.stringify({ iss: teamId, iat: Math.floor(now / 1000) }));
  const signature = cryptoSign("sha256", Buffer.from(`${header}.${claims}`), { key: keyPem, dsaEncoding: "ieee-p1363" });
  return `${header}.${claims}.${base64url(signature)}`;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private fcmToken?: { value: string; expiresAt: number };
  private apnsToken?: { value: string; expiresAt: number };

  constructor(private readonly prisma: PrismaService) {}

  private serviceAccount(): ServiceAccount | undefined {
    const raw = process.env.FCM_SERVICE_ACCOUNT;
    if (!raw) return undefined;
    try {
      const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
      return JSON.parse(json) as ServiceAccount;
    } catch {
      this.logger.warn("FCM_SERVICE_ACCOUNT inválida — push do Android desligado.");
      return undefined;
    }
  }

  private apnsConfig() {
    const { APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID } = process.env;
    if (!APNS_KEY || !APNS_KEY_ID || !APNS_TEAM_ID) return undefined;
    const key = APNS_KEY.includes("BEGIN PRIVATE KEY") ? APNS_KEY : Buffer.from(APNS_KEY, "base64").toString("utf8");
    return { key, keyId: APNS_KEY_ID, teamId: APNS_TEAM_ID, bundleId: process.env.APNS_BUNDLE_ID ?? "br.com.novoseminovo.app" };
  }

  async register(userId: string, token: string, platform: "android" | "ios"): Promise<void> {
    await this.prisma.pushDevice.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastSeenAt: new Date() },
    });
  }

  // Saiu da conta no celular: o aparelho para de receber os avisos dela.
  async unregister(token: string): Promise<void> {
    await this.prisma.pushDevice.deleteMany({ where: { token } });
  }

  async sendToUser(userId: string, message: PushMessage): Promise<void> {
    const devices = await this.prisma.pushDevice.findMany({ where: { userId } });
    if (!devices.length) return;
    const trimmed = { ...message, body: message.body.length > 180 ? `${message.body.slice(0, 177)}…` : message.body };
    for (const device of devices) {
      try {
        const gone = device.platform === "ios" ? await this.sendApns(device.token, trimmed) : await this.sendFcm(device.token, trimmed);
        if (gone) await this.unregister(device.token);
      } catch (error) {
        this.logger.warn(`Push não enviado (${device.platform}): ${(error as Error).message}`);
      }
    }
  }

  // true = o aparelho não existe mais (app desinstalado): apaga o token.
  private async sendFcm(token: string, message: PushMessage): Promise<boolean> {
    const account = this.serviceAccount();
    if (!account) return false;
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.googleAccessToken(account)}`, "Content-Type": "application/json" },
      body: JSON.stringify(fcmMessage(token, message)),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return false;
    const text = await res.text();
    if (res.status === 404 || /UNREGISTERED/.test(text)) return true;
    throw new Error(`FCM ${res.status}: ${text.slice(0, 200)}`);
  }

  private async googleAccessToken(account: ServiceAccount): Promise<string> {
    if (this.fcmToken && this.fcmToken.expiresAt > Date.now()) return this.fcmToken.value;
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64url(
      JSON.stringify({
        iss: account.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    );
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${claims}`);
    const assertion = `${header}.${claims}.${base64url(signer.sign(account.private_key))}`;
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Login no Google falhou (${res.status})`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.fcmToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 300) * 1000 };
    return data.access_token;
  }

  private sendApns(token: string, message: PushMessage): Promise<boolean> {
    const config = this.apnsConfig();
    if (!config) return Promise.resolve(false);
    if (!this.apnsToken || this.apnsToken.expiresAt < Date.now()) {
      this.apnsToken = { value: apnsJwt(config.key, config.keyId, config.teamId), expiresAt: Date.now() + 50 * 60 * 1000 };
    }
    const jwt = this.apnsToken.value;
    return new Promise((resolve, reject) => {
      const session: ClientHttp2Session = connect("https://api.push.apple.com");
      session.on("error", reject);
      const request = session.request({
        ":method": "POST",
        ":path": `/3/device/${token}`,
        authorization: `bearer ${jwt}`,
        "apns-topic": config.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });
      request.setTimeout(10_000, () => request.close());
      let status = 0;
      let body = "";
      request.on("response", (headers) => (status = Number(headers[":status"])));
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        session.close();
        if (status === 200) resolve(false);
        else if (status === 410 || /BadDeviceToken|Unregistered/.test(body)) resolve(true);
        else reject(new Error(`APNs ${status}: ${body.slice(0, 200)}`));
      });
      request.on("error", (error) => {
        session.close();
        reject(error);
      });
      request.end(JSON.stringify(apnsPayload(message)));
    });
  }
}
