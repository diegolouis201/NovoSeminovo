// /.well-known/apple-app-site-association (rewrite em next.config.js): diz ao
// iPhone que o app pode abrir os links do site. APPLE_TEAM_ID = "Team ID" da
// conta de desenvolvedor da Apple (Membership details).
export const dynamic = "force-dynamic";

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const body = {
    applinks: {
      details: teamId
        ? [
            {
              appIDs: [`${teamId}.br.com.novoseminovo.app`],
              // Admin, API interna e pagamento ficam no navegador.
              components: [{ "/": "/admin*", exclude: true }, { "/": "/api/*", exclude: true }, { "/": "/*" }],
            },
          ]
        : [],
    },
  };
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
