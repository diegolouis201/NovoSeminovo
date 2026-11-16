// Escolha do aviso de cookies (Aceitar/Recusar), guardada no navegador. Usado
// pelo aviso (components/Analytics.tsx) e pelo script curto do <head>
// (app/layout.tsx), que esconde o aviso de quem já escolheu antes da
// primeira pintura (auditoria web, item 3).
export const CONSENT_STORAGE_KEY = "ns-cookie-consent";

// Texto fixo (nenhum dado de usuário): lê a escolha e marca o <html>.
export const CONSENT_HEAD_SCRIPT = `try{var c=localStorage.getItem(${JSON.stringify(CONSENT_STORAGE_KEY)});if(c==="granted"||c==="denied")document.documentElement.setAttribute("data-cookie-consent",c)}catch(e){}`;
