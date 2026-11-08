
// BUSINESS PRO - CONTROLE PREMIUM
// Login Google + status da assinatura + checkout Pix.
// A autorização real deve acontecer no Cloudflare Worker.

import {initializeApp} from
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

// SUBSTITUA PELOS DADOS DO FIREBASE DO BUSINESS PRO
const FIREBASE_CONFIG={
 apiKey:"COLE_API_KEY_FIREBASE",
 authDomain:"COLE_AUTH_DOMAIN_FIREBASE",
 projectId:"COLE_PROJECT_ID_FIREBASE",
 appId:"COLE_APP_ID_FIREBASE"
};

const WORKER=
 "https://little-wood-47e8meu-concurso-ia.junhodorval.workers.dev";

const $=id=>document.getElementById(id);

let auth=null;
let user=null;
let status=null;
let checking=false;

const configured=!Object.values(FIREBASE_CONFIG)
 .some(value=>value.startsWith("COLE_"));

function setText(id,value){
 const el=$(id);
 if(el)el.textContent=value;
}

function showPremium(){
 $("premiumDialog").hidden=false;
 refresh();
}

function hidePremium(){
 $("premiumDialog").hidden=true;
}

function render(){
 const logged=!!user;
 const active=status?.active===true;
 const remaining=Number(status?.remainingToday??0);

 $("accountButton").textContent=
  logged?"Minha conta":"Entrar";

 $("googleLogin").hidden=logged;
 $("googleLogout").hidden=!logged;
 $("startPayment").hidden=!logged||active;

 let message;

 if(!configured){
  message="Configure o Firebase para ativar o login Google.";
 }else if(!logged){
  message="Entre com Google para contratar a IA Premium.";
 }else if(checking){
  message="Verificando assinatura...";
 }else if(active){
  const expiry=status.expiresAt
   ?new Date(status.expiresAt).toLocaleDateString("pt-BR")
   :"data não informada";

  message=
   `IA ativa até ${expiry}. `+
   `Perguntas restantes hoje: ${remaining}.`;
 }else{
  message="Nenhuma assinatura ativa nesta conta.";
 }

 setText("premiumStatus",message);
 setText("aiPlanStatus",message);

 $("aiSubscribe").hidden=active&&remaining>0;
 $("aiSend").disabled=!active||remaining<=0||checking;

 if(active&&remaining===0){
  setText("aiPlanStatus",
   "Você atingiu o limite de 20 perguntas de hoje.");
  $("aiSubscribe").hidden=true;
 }
}

async function getToken(){
 if(!user)return null;
 return await user.getIdToken();
}

async function api(path,options={}){
 const token=await getToken();

 if(!token){
  throw Error("Entre com sua conta Google.");
 }

 const response=await fetch(WORKER+path,{
  ...options,
  headers:{
   "Authorization":"Bearer "+token,
   "Content-Type":"application/json",
   ...(options.headers||{})
  }
 });

 const data=await response.json().catch(()=>({}));

 if(!response.ok){
  throw Error(
   data.error||`Falha no servidor (${response.status})`
  );
 }

 return data;
}

async function refresh(){
 checking=true;
 status=null;
 render();

 if(user){
  try{
   status=await api("/premium/status");
  }catch(error){
   console.warn("Status Premium:",error.message);
   setText("premiumStatus",
    "Não foi possível verificar a assinatura: "+
    error.message);
  }
 }

 checking=false;
 render();
}

window.BusinessPremium={
 canAsk:()=>!!user&&
  status?.active===true&&
  Number(status.remainingToday)>0,
 getToken,
 refresh
};

$("accountButton").onclick=showPremium;
$("premiumButton").onclick=showPremium;
$("premiumClose").onclick=hidePremium;
$("aiSubscribe").onclick=showPremium;
$("refreshPremium").onclick=refresh;

window.addEventListener("bp:open-premium",showPremium);
window.addEventListener("bp:close-premium",hidePremium);
window.addEventListener("bp:ai-open",refresh);
window.addEventListener("bp:premium-refresh",refresh);

$("premiumDialog").addEventListener("click",event=>{
 if(event.target===$("premiumDialog")){
  hidePremium();
 }
});

if(configured){
 try{
  const app=initializeApp(FIREBASE_CONFIG);
  auth=getAuth(app);

  // Necessário para completar login por redirecionamento.
  getRedirectResult(auth).catch(error=>{
   console.warn("Login por redirecionamento:",error);
  });

  onAuthStateChanged(auth,async currentUser=>{
   user=currentUser;
   await refresh();
  });
 }catch(error){
  console.error("Firebase inválido:",error);
 }
}

$("googleLogin").onclick=async()=>{
 if(!auth){
  alert("Configure o Firebase primeiro.");
  return;
 }

 const provider=new GoogleAuthProvider();

 try{
  await signInWithPopup(auth,provider);
 }catch(error){
  if(error.code==="auth/popup-blocked"){
   await signInWithRedirect(auth,provider);
  }else{
   alert("Erro no login Google: "+error.message);
  }
 }
};

$("googleLogout").onclick=async()=>{
 if(auth){
  await signOut(auth);
  status=null;
  render();
 }
};

$("startPayment").onclick=async()=>{
 const button=$("startPayment");
 button.disabled=true;

 try{
  // Esta rota precisa ser implementada no Worker.
  // O valor de R$ 20 deve ser definido no servidor.
  const result=await api("/premium/checkout",{
   method:"POST",
   body:JSON.stringify({
    plan:"ai-30d-brl20"
   })
  });

  if(!result.pixCopyPaste&&!result.qrCodeBase64){
   throw Error("O provedor não retornou um Pix válido.");
  }

  $("pixDetails").hidden=false;
  $("pixCopy").value=result.pixCopyPaste||"";
  $("pixMessage").textContent=
   result.message||
   "Após pagar, aguarde a confirmação do servidor.";

  const qr=result.qrCodeBase64;

  if(qr&&/^[A-Za-z0-9+/]+=*$/.test(qr)){
   $("pixQR").src="data:image/png;base64,"+qr;
   $("pixQR").hidden=false;
  }else{
   $("pixQR").hidden=true;
  }

 }catch(error){
  alert(
   "Pagamento ainda não disponível: "+error.message
  );
 }finally{
  button.disabled=false;
 }
};

$("copyPix").onclick=async()=>{
 const code=$("pixCopy").value;

 if(!code){
  alert("Nenhum código Pix disponível.");
  return;
 }

 try{
  await navigator.clipboard.writeText(code);
  alert("Código Pix copiado!");
 }catch{
  $("pixCopy").focus();
  $("pixCopy").select();
  alert("Selecione e copie o código Pix.");
 }
};

render();
