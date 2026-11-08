
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBz2wOXC-uF5Te65zQZp7kzebRZdhD0X4A",
  authDomain: "business-pro-97342.firebaseapp.com",
  projectId: "business-pro-97342",
  storageBucket: "business-pro-97342.firebasestorage.app",
  messagingSenderId: "1071937432262",
  appId: "1:1071937432262:web:fe19a4626e8e6310d805c7",
  measurementId: "G-86BRQJT1JD"
};

const WORKER = "https://little-wood-47e8meu-concurso-ia.junhodorval.workers.dev";
const $ = id => document.getElementById(id);
const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let user = null;
let status = null;
let checking = false;
let paying = false;
let timer = null;
let errorMessage = "";

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function show(id, value) {
  const el = $(id);
  if (el) el.hidden = !value;
}

function notify(message) {
  const toast = $("toast");
  if (toast) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.hidden = true, 5000);
  } else {
    alert(message);
  }
}

function cpfDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function validCpfCnpj(value) {
  const v = cpfDigits(value);
  if (![11, 14].includes(v.length) || /^(\d)\1+$/.test(v)) return false;

  function check(length, weights) {
    const sum = weights.reduce((a, w, i) => a + Number(v[i]) * w, 0);
    const rest = sum % 11;
    return Number(v[length]) === (rest < 2 ? 0 : 11 - rest);
  }

  if (v.length === 11) {
    return check(9, [10,9,8,7,6,5,4,3,2]) &&
           check(10, [11,10,9,8,7,6,5,4,3,2]);
  }

  return check(12, [5,4,3,2,9,8,7,6,5,4,3,2]) &&
         check(13, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
}

function addCpfField() {
  if ($("bpCpfCnpj")) return;

  const button = $("startPayment");
  if (!button || !button.parentElement) return;

  const box = document.createElement("div");
  box.id = "bpCpfBox";
  box.style.cssText = "margin:14px 0;padding:14px;border:1px solid #506080;border-radius:12px;";

  const label = document.createElement("label");
  label.htmlFor = "bpCpfCnpj";
  label.textContent = "CPF ou CNPJ do pagador";
  label.style.cssText = "display:block;margin-bottom:8px;font-weight:700;";

  const input = document.createElement("input");
  input.id = "bpCpfCnpj";
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.placeholder = "Digite seu CPF ou CNPJ";
  input.maxLength = 18;
  input.style.cssText = "width:100%;box-sizing:border-box;padding:13px;border:1px solid #7b8da7;border-radius:9px;background:#fff;color:#111;font-size:16px;";

  const info = document.createElement("small");
  info.textContent = "Obrigatório para emitir a cobrança Pix pelo Asaas. Não informe documentos de terceiros sem autorização.";
  info.style.cssText = "display:block;margin-top:8px;opacity:.8;line-height:1.5;";

  box.append(label, input, info);
  button.parentElement.insertBefore(box, button);
}

async function getToken() {
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

async function api(path, options = {}) {
  const token = await getToken();
  if (!token) throw Error("Entre com Google primeiro.");

  let response;
  try {
    response = await fetch(WORKER + path, {
      ...options,
      cache: "no-store",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
  } catch {
    throw Error("Falha de conexão com o servidor.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Error(data.error || "Erro HTTP " + response.status);
  }
  return data;
}

function render() {
  const logged = !!user;
  const active = status?.active === true;
  const remaining = Number(status?.remainingToday || 0);

  setText("accountButton", logged ? "👤 Minha conta" : "Entrar");
  show("googleLogin", !logged);
  show("googleLogout", logged);
  show("startPayment", logged && !active);
  show("bpCpfBox", logged && !active);
  show("aiSubscribe", !active);

  if ($("startPayment")) {
    $("startPayment").disabled = checking || paying;
  }

  if ($("aiSend")) {
    $("aiSend").disabled = !logged || !active || remaining <= 0 || checking;
  }

  let message = "";

  if (!logged) {
    message = "Entre com Google para contratar a IA Premium.";
  } else if (checking) {
    message = "Verificando assinatura...";
  } else if (errorMessage) {
    message = "Erro: " + errorMessage;
  } else if (active) {
    const expiry = status.expiresAt
      ? new Date(status.expiresAt).toLocaleDateString("pt-BR")
      : "não informada";

    message = "👑 Premium ativo até " + expiry +
      ". Perguntas restantes hoje: " + remaining + " de 20.";
  } else {
    message = "IA Premium: R$ 20 por 30 dias. Informe seu CPF/CNPJ para gerar o Pix.";
  }

  setText("premiumStatus", message);
  setText("aiPlanStatus", message);

  if (active && remaining <= 0) {
    setText("aiPlanStatus", "Você atingiu o limite de 20 perguntas de hoje.");
  }

  if (active) stopMonitoring();
}

async function refresh(options = {}) {
  if (!options.silent) checking = true;
  errorMessage = "";
  render();

  try {
    if (!auth.currentUser) {
      status = null;
      return null;
    }

    const uid = auth.currentUser.uid;
    const result = await api("/premium/status");

    if (auth.currentUser?.uid !== uid) return null;
    status = result;
    return result;
  } catch (error) {
    errorMessage = error.message;
    return null;
  } finally {
    checking = false;
    render();
  }
}

function openPremium() {
  addCpfField();
  show("premiumDialog", true);
  refresh();
}

function closePremium() {
  show("premiumDialog", false);
}

function stopMonitoring() {
  if (timer) clearInterval(timer);
  timer = null;
}

function startMonitoring() {
  stopMonitoring();
  let attempts = 0;

  timer = setInterval(async () => {
    attempts++;
    const result = await refresh({ silent: true });

    if (result?.active) {
      stopMonitoring();
      notify("Pagamento confirmado! IA Premium liberada.");
      setText("pixMessage", "Pagamento confirmado. Assinatura ativa!");
    } else if (attempts >= 40) {
      stopMonitoring();
      setText("pixMessage", "Pagamento ainda não confirmado. Atualize sua assinatura para consultar novamente.");
    }
  }, 15000);
}

async function loginGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error.code === "auth/popup-blocked") {
      try {
        await signInWithRedirect(auth, provider);
      } catch (e) {
        notify("Falha no login: " + e.message);
      }
    } else if (error.code !== "auth/popup-closed-by-user") {
      notify("Erro no login Google: " + error.message);
    }
  }
}

async function logoutGoogle() {
  stopMonitoring();
  await signOut(auth);
  user = null;
  status = null;
  render();
}

async function startPayment() {
  if (paying) return;

  if (!auth.currentUser) {
    notify("Entre com Google primeiro.");
    return;
  }

  addCpfField();
  const cpfCnpj = cpfDigits($("bpCpfCnpj")?.value);

  if (!validCpfCnpj(cpfCnpj)) {
    notify("Informe um CPF ou CNPJ válido.");
    $("bpCpfCnpj")?.focus();
    return;
  }

  paying = true;
  render();
  setText("pixMessage", "Solicitando Pix real de R$ 20...");

  try {
    const result = await api("/premium/checkout", {
      method: "POST",
      body: JSON.stringify({
        plan: "ai-30d-brl20",
        cpfCnpj
      })
    });

    const pix = String(result.pixCopyPaste || "");
    const qr = String(result.qrCodeBase64 || "");

    if (!pix && !qr) {
      throw Error("O Asaas não retornou o código Pix.");
    }

    show("pixDetails", true);

    if ($("pixCopy")) $("pixCopy").value = pix;

    if ($("pixQR")) {
      if (/^[A-Za-z0-9+/]+=*$/.test(qr)) {
        $("pixQR").src = "data:image/png;base64," + qr;
        show("pixQR", true);
      } else {
        show("pixQR", false);
      }
    }

    setText("pixMessage",
      result.message ||
      "Pix gerado. Confira o recebedor antes de pagar. A liberação depende da confirmação do Asaas."
    );

    startMonitoring();
  } catch (error) {
    notify("Erro ao gerar Pix: " + error.message);
    setText("pixMessage", error.message);
  } finally {
    paying = false;
    render();
  }
}

async function copyPix() {
  const code = $("pixCopy")?.value;
  if (!code) return notify("Nenhum Pix disponível.");

  try {
    await navigator.clipboard.writeText(code);
    notify("Pix copiado!");
  } catch {
    $("pixCopy")?.select();
    notify("Selecione e copie o Pix.");
  }
}

function bind(id, fn) {
  const el = $(id);
  if (el) el.addEventListener("click", fn);
}

bind("accountButton", openPremium);
bind("premiumButton", openPremium);
bind("aboutPremium", openPremium);
bind("premiumClose", closePremium);
bind("googleLogin", loginGoogle);
bind("googleLogout", logoutGoogle);
bind("startPayment", startPayment);
bind("copyPix", copyPix);
bind("refreshPremium", () => refresh());
bind("aiSubscribe", openPremium);

window.addEventListener("bp:open-premium", openPremium);
window.addEventListener("bp:close-premium", closePremium);
window.addEventListener("bp:ai-open", () => refresh());
window.addEventListener("bp:premium-refresh", () => refresh());

if ($("premiumDialog")) {
  $("premiumDialog").addEventListener("click", event => {
    if (event.target === $("premiumDialog")) closePremium();
  });
}

window.BusinessPremium = {
  canAsk: () => !!auth.currentUser &&
    status?.active === true &&
    Number(status.remainingToday) > 0 &&
    !checking,
  getToken,
  refresh,
  showPremium: openPremium,
  getUser: () => auth.currentUser,
  getStatus: () => status
};

getRedirectResult(auth).catch(console.warn);

onAuthStateChanged(auth, async currentUser => {
  user = currentUser;
  status = null;
  stopMonitoring();
  addCpfField();
  render();
  if (user) await refresh();
});

addCpfField();
render();
