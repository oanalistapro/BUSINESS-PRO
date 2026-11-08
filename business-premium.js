
// =====================================================
// BUSINESS PRO - IA PREMIUM
// Firebase Google + Asaas Pix + Cloudflare Worker
// R$ 20,00 / 30 dias / 20 perguntas por dia
// =====================================================

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

// FIREBASE BUSINESS PRO
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBz2wOXC-uF5Te65zQZp7kzebRZdhD0X4A",
  authDomain: "business-pro-97342.firebaseapp.com",
  projectId: "business-pro-97342",
  storageBucket: "business-pro-97342.firebasestorage.app",
  messagingSenderId: "1071937432262",
  appId: "1:1071937432262:web:fe19a4626e8e6310d805c7",
  measurementId: "G-86BRQJT1JD"
};

// CLOUDFLARE WORKER
const WORKER =
  "https://little-wood-47e8meu-concurso-ia.junhodorval.workers.dev";

const $ = id => document.getElementById(id);

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: "select_account"
});

let user = null;
let premiumStatus = null;
let checking = false;
let paying = false;
let loginReady = false;
let refreshVersion = 0;
let paymentTimer = null;
let lastError = "";

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

function element(id) {
  return $(id);
}

function text(id, value) {
  const el = element(id);
  if (el) el.textContent = value;
}

function visible(id, show) {
  const el = element(id);
  if (el) el.hidden = !show;
}

function disabled(id, value) {
  const el = element(id);
  if (el) el.disabled = value;
}

function notify(message) {
  const toast = element("toast");

  if (toast) {
    toast.textContent = message;
    toast.hidden = false;

    clearTimeout(notify.timer);

    notify.timer = setTimeout(() => {
      toast.hidden = true;
    }, 4000);
  } else {
    alert(message);
  }
}

function formatDate(value) {
  if (!value) return "não informada";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "não informada";
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function clearPix() {
  visible("pixDetails", false);
  visible("pixQR", false);

  const copy = element("pixCopy");
  const qr = element("pixQR");

  if (copy) copy.value = "";

  if (qr) {
    qr.removeAttribute("src");
  }

  text("pixMessage", "");
}

function stopPaymentMonitoring() {
  if (paymentTimer) {
    clearInterval(paymentTimer);
    paymentTimer = null;
  }
}

// =====================================================
// AUTENTICAÇÃO E API
// =====================================================

async function getToken() {
  if (!auth.currentUser) return null;

  return auth.currentUser.getIdToken();
}

async function api(path, options = {}) {
  const token = await getToken();

  if (!token) {
    throw new Error("Entre com sua conta Google.");
  }

  let response;

  try {
    response = await fetch(WORKER + path, {
      ...options,
      cache: "no-store",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao Cloudflare. Verifique a internet."
    );
  }

  let result = {};

  try {
    result = await response.json();
  } catch {
    throw new Error(
      "O servidor retornou uma resposta inválida."
    );
  }

  if (!response.ok) {
    throw new Error(
      result.error ||
      "Erro no servidor (" + response.status + ")."
    );
  }

  return result;
}

// =====================================================
// INTERFACE PREMIUM
// =====================================================

function render() {
  const logged = !!user;
  const active = premiumStatus?.active === true;
  const remaining = Math.max(
    0,
    Number(premiumStatus?.remainingToday || 0)
  );

  const accountButton = element("accountButton");

  if (accountButton) {
    accountButton.textContent = logged
      ? "👤 Minha conta"
      : "Entrar";
  }

  visible("googleLogin", !logged);
  visible("googleLogout", logged);

  visible(
    "startPayment",
    logged && loginReady && !checking && !active
  );

  disabled("startPayment", paying || checking);

  let message = "";

  if (!loginReady) {
    message = "Carregando autenticação...";
  } else if (!logged) {
    message = "Entre com Google para contratar a IA Premium.";
  } else if (checking) {
    message = "Verificando sua assinatura...";
  } else if (lastError) {
    message = "Erro ao verificar assinatura: " + lastError;
  } else if (active) {
    message =
      "👑 IA Premium ativa até " +
      formatDate(premiumStatus.expiresAt) +
      ". Perguntas restantes hoje: " +
      remaining + " de 20.";
  } else {
    message =
      "Sua conta está conectada. " +
      "Você ainda não possui uma assinatura Premium ativa.";
  }

  text("premiumStatus", message);
  text("aiPlanStatus", message);

  visible(
    "aiSubscribe",
    !active && !checking
  );

  disabled(
    "aiSend",
    !logged ||
    !active ||
    remaining <= 0 ||
    checking
  );

  if (active && remaining === 0) {
    text(
      "aiPlanStatus",
      "Você atingiu o limite de 20 perguntas de hoje."
    );
  }

  if (active) {
    clearPix();
    stopPaymentMonitoring();
  }
}

// =====================================================
// CONSULTAR ASSINATURA
// =====================================================

async function refresh(options = {}) {
  const silent = options.silent === true;
  const version = ++refreshVersion;
  const currentUid = auth.currentUser?.uid || null;

  if (!silent) {
    checking = true;
    lastError = "";
    render();
  }

  if (!currentUid) {
    premiumStatus = null;
    checking = false;
    lastError = "";
    render();
    return null;
  }

  try {
    const result = await api("/premium/status");

    if (
      version !== refreshVersion ||
      auth.currentUser?.uid !== currentUid
    ) {
      return null;
    }

    premiumStatus = result;
    lastError = "";

    return result;

  } catch (error) {
    if (
      version === refreshVersion &&
      auth.currentUser?.uid === currentUid
    ) {
      premiumStatus = null;
      lastError = error.message;

      if (!silent) {
        console.warn(
          "Business Pro Premium:",
          error.message
        );
      }
    }

    return null;

  } finally {
    if (version === refreshVersion) {
      checking = false;
      render();
    }
  }
}

// =====================================================
// ABRIR E FECHAR JANELA
// =====================================================

function showPremium() {
  visible("premiumDialog", true);
  refresh();
}

function hidePremium() {
  visible("premiumDialog", false);
}

function canAsk() {
  return (
    !!auth.currentUser &&
    premiumStatus?.active === true &&
    Number(premiumStatus.remainingToday) > 0 &&
    !checking
  );
}

// Disponibiliza funções para o index.html
window.BusinessPremium = {
  canAsk,
  getToken,
  refresh,
  showPremium,
  getUser: () => auth.currentUser,
  getStatus: () => premiumStatus
};

// =====================================================
// LOGIN GOOGLE
// =====================================================

async function loginGoogle() {
  if (!loginReady) {
    notify("Aguarde o Firebase carregar.");
    return;
  }

  disabled("googleLogin", true);

  try {
    await signInWithPopup(auth, provider);

  } catch (error) {
    const code = error.code || "";

    if (
      code === "auth/popup-blocked" ||
      code === "auth/popup-closed-by-user"
    ) {
      if (code === "auth/popup-blocked") {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectError) {
          notify(
            "Não foi possível abrir o login: " +
            redirectError.message
          );
        }
      }
    } else if (code === "auth/unauthorized-domain") {
      notify(
        "Autorize o domínio oanalistapro.github.io no Firebase Authentication."
      );
    } else if (code === "auth/operation-not-allowed") {
      notify(
        "Ative o provedor Google no Firebase Authentication."
      );
    } else {
      notify(
        "Erro ao entrar com Google: " +
        error.message
      );
    }
  } finally {
    disabled("googleLogin", false);
  }
}

async function logoutGoogle() {
  stopPaymentMonitoring();

  try {
    await signOut(auth);

    user = null;
    premiumStatus = null;
    lastError = "";

    clearPix();
    render();

    notify("Você saiu da sua conta.");

  } catch (error) {
    notify("Não foi possível sair: " + error.message);
  }
}

// Completa eventual login por redirecionamento.
getRedirectResult(auth).catch(error => {
  console.warn(
    "Firebase Redirect:",
    error.code || error.message
  );
});

// Acompanha o login automaticamente.
onAuthStateChanged(auth, async currentUser => {
  user = currentUser;
  loginReady = true;
  premiumStatus = null;
  lastError = "";

  stopPaymentMonitoring();
  clearPix();

  render();

  if (user) {
    await refresh();
  }
});

// =====================================================
// GERAR PAGAMENTO PIX REAL
// =====================================================

async function startPayment() {
  if (!auth.currentUser) {
    notify("Entre com Google primeiro.");
    return;
  }

  if (paying) return;

  paying = true;
  disabled("startPayment", true);

  text(
    "pixMessage",
    "Gerando sua cobrança Pix de R$ 20,00..."
  );

  try {
    const result = await api("/premium/checkout", {
      method: "POST",
      body: JSON.stringify({
        plan: "ai-30d-brl20"
      })
    });

    const pix = String(
      result.pixCopyPaste || ""
    );

    const qr = String(
      result.qrCodeBase64 || ""
    );

    if (!pix && !qr) {
      throw new Error(
        "O Asaas não retornou um código Pix válido."
      );
    }

    visible("pixDetails", true);

    const pixInput = element("pixCopy");

    if (pixInput) {
      pixInput.value = pix;
    }

    if (
      qr &&
      /^[A-Za-z0-9+/]+=*$/.test(qr)
    ) {
      const qrImage = element("pixQR");

      if (qrImage) {
        qrImage.src =
          "data:image/png;base64," + qr;
        qrImage.hidden = false;
      }
    } else {
      visible("pixQR", false);
    }

    text(
      "pixMessage",
      "Pix de R$ 20,00 gerado pelo Asaas. " +
      "Confira os dados do recebedor antes de pagar. " +
      "Após o pagamento, a liberação será automática quando o servidor confirmar."
    );

    startPaymentMonitoring();

  } catch (error) {
    notify(
      "Erro ao gerar Pix: " + error.message
    );

    text(
      "pixMessage",
      "Não foi possível gerar o Pix: " +
      error.message
    );

  } finally {
    paying = false;
    disabled("startPayment", false);
    render();
  }
}

// =====================================================
// MONITORAR CONFIRMAÇÃO DO PAGAMENTO
// =====================================================

function startPaymentMonitoring() {
  stopPaymentMonitoring();

  let attempts = 0;

  // Consulta a situação a cada 15 segundos.
  // O Worker continua sendo a fonte da verdade.
  paymentTimer = setInterval(async () => {
    if (!auth.currentUser) {
      stopPaymentMonitoring();
      return;
    }

    attempts++;

    const result = await refresh({
      silent: true
    });

    if (result?.active === true) {
      stopPaymentMonitoring();

      notify(
        "👑 Pagamento confirmado! Sua IA Premium está ativa."
      );

      text(
        "pixMessage",
        "Pagamento confirmado. Premium liberado!"
      );

      return;
    }

    // Para após 10 minutos.
    if (attempts >= 40) {
      stopPaymentMonitoring();

      text(
        "pixMessage",
        "Ainda não recebemos a confirmação. " +
        "Você pode atualizar sua assinatura manualmente."
      );
    }
  }, 15000);
}

// =====================================================
// COPIAR PIX
// =====================================================

async function copyPix() {
  const code = element("pixCopy")?.value || "";

  if (!code) {
    notify("Nenhum código Pix disponível.");
    return;
  }

  try {
    await navigator.clipboard.writeText(code);
    notify("Código Pix copiado!");

  } catch {
    const input = element("pixCopy");

    if (input) {
      input.focus();
      input.select();
    }

    notify(
      "Selecione e copie o código Pix."
    );
  }
}

// =====================================================
// EVENTOS DOS BOTÕES
// =====================================================

function bindClick(id, callback) {
  const el = element(id);

  if (el) {
    el.addEventListener("click", callback);
  }
}

bindClick("accountButton", showPremium);
bindClick("premiumButton", showPremium);
bindClick("aboutPremium", showPremium);
bindClick("premiumClose", hidePremium);

bindClick("googleLogin", loginGoogle);
bindClick("googleLogout", logoutGoogle);

bindClick("refreshPremium", () => refresh());

bindClick("startPayment", startPayment);
bindClick("copyPix", copyPix);

bindClick("aiSubscribe", showPremium);

window.addEventListener(
  "bp:open-premium",
  showPremium
);

window.addEventListener(
  "bp:close-premium",
  hidePremium
);

window.addEventListener(
  "bp:ai-open",
  () => refresh()
);

window.addEventListener(
  "bp:premium-refresh",
  () => refresh()
);

const dialog = element("premiumDialog");

if (dialog) {
  dialog.addEventListener("click", event => {
    if (event.target === dialog) {
      hidePremium();
    }
  });
}

render();

console.log(
  "BUSINESS PRO PREMIUM: Firebase conectado."
);
