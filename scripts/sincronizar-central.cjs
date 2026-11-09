
const admin = require("firebase-admin");

function carregarCredencial(nome, projeto) {
  const valor = process.env[nome];

  if (!valor) {
    throw new Error("Secret não configurado: " + nome);
  }

  const json = JSON.parse(valor);

  if (json.project_id !== projeto) {
    throw new Error(
      nome + " pertence ao projeto " + json.project_id +
      ", esperado: " + projeto
    );
  }

  return admin.credential.cert(json);
}

const business = admin.initializeApp({
  credential: carregarCredencial(
    "FIREBASE_BUSINESS_ADMIN",
    "business-pro-97342"
  )
}, "business");

const central = admin.initializeApp({
  credential: carregarCredencial(
    "FIREBASE_CENTRAL_ADMIN",
    "central-adm-f9b27"
  )
}, "central");

const origemAuth = business.auth();
const destino = central.firestore();

const agora = () =>
  admin.firestore.FieldValue.serverTimestamp();

function dataFirebase(valor) {
  if (!valor) return null;

  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function buscarUsuarios() {
  const usuarios = [];
  let pagina;

  do {
    const resultado = await origemAuth.listUsers(
      1000,
      pagina
    );

    usuarios.push(...resultado.users);
    pagina = resultado.pageToken;

  } while (pagina);

  return usuarios;
}

async function sincronizar() {
  console.log("Iniciando sincronização BUSINESS PRO");

  const usuarios = await buscarUsuarios();
  let total = 0;

  // Limita a 400 gravações por lote.
  let lote = destino.batch();
  let pendentes = 0;

  async function confirmarLote() {
    if (!pendentes) return;

    await lote.commit();
    lote = destino.batch();
    pendentes = 0;
  }

  for (const usuario of usuarios) {
    const ref = destino
      .collection("portalUsers")
      .doc("business_" + usuario.uid);

    const provedores = usuario.providerData
      .map(p => p.providerId)
      .filter(Boolean);

    lote.set(ref, {
      portal: "business",
      sourceUid: usuario.uid,
      displayName: usuario.displayName || "",
      email: usuario.email || "",
      provider: provedores.join(", ") || "firebase",
      createdAt: dataFirebase(
        usuario.metadata.creationTime
      ),
      lastLoginAt: dataFirebase(
        usuario.metadata.lastSignInTime
      ),
      disabled: usuario.disabled === true,
      syncedAt: agora()
    }, { merge: true });

    total++;
    pendentes++;

    if (pendentes >= 400) {
      await confirmarLote();
    }
  }

  await confirmarLote();

  await destino
    .collection("settings")
    .doc("businessSync")
    .set({
      portal: "business",
      status: "connected",
      usersCount: total,
      lastSync: agora(),
      syncType: "firebase_auth",
      paymentsSynced: false
    }, { merge: true });

  console.log(
    "Sincronização BUSINESS PRO concluída:",
    total,
    "usuários"
  );
}

sincronizar()
  .then(() => process.exit(0))
  .catch(erro => {
    console.error("Erro:", erro);
    process.exit(1);
  });
