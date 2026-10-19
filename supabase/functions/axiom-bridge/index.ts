/* AxiomPilotCode profile and encrypted relay. Supabase is the host/database, not the login provider. */
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const webOrigin="https://zaoastronaftik-bit.github.io";
const homeURL=webOrigin+"/axiom-pilot-code.PAGES/";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const cors={"Access-Control-Allow-Origin":webOrigin,"Access-Control-Allow-Methods":"GET,POST,PATCH,OPTIONS","Access-Control-Allow-Headers":"authorization,content-type","Cache-Control":"no-store","Vary":"Origin"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const userCodePattern=/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const deviceCodePattern=/^[a-zA-Z0-9_-]{40,50}$/;
const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const sha=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v))),b=>b.toString(16).padStart(2,"0")).join("");
const random64=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
function userCode(){const b=crypto.getRandomValues(new Uint8Array(8));const s=Array.from(b,x=>alphabet[x%32]).join("");return s.slice(0,4)+"-"+s.slice(4);}
async function json(req:Request,max=4096):Promise<Record<string,unknown>>{
  if(!req.headers.get("content-type")?.toLowerCase().startsWith("application/json"))throw new Error("BAD_JSON_TYPE");
  const reader=req.body?.getReader();if(!reader)throw new Error("MISSING_BODY");
  let count=0;const chunks:Uint8Array[]=[];
  try{for(;;){const chunk=await reader.read();if(chunk.done)break;count+=chunk.value.byteLength;if(count>max)throw new Error("BODY_TOO_LARGE");chunks.push(chunk.value)}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const all=new Uint8Array(count);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.byteLength;}
  const parsed:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(all));
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("BAD_JSON");
  return parsed as Record<string,unknown>;
}
const remoteIP=(req:Request)=>(req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim().slice(0,100);
async function throttle(key:string,maximum:number,seconds:number){
 const {data,error}=await db.rpc("axiom_limit_attempt",{p_key:await sha(key),p_max:maximum,p_window_seconds:seconds});
 if(error)throw new Error("RATE_DB");return data===true;
}
async function webIdentity(req:Request){
 if(req.headers.get("origin")!==webOrigin)return null;
 const bearer=req.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
 if(!bearer)return null;
 const {data,error}=await db.from("axiom_sessions").select("user_id").eq("token_hash",await sha(bearer))
   .gt("expires_at",new Date().toISOString()).maybeSingle();
 if(error)throw new Error("WEB_SESSION_DB");
 return data?{id:data.user_id}:null;
}
async function cliIdentity(req:Request){
 const bearer=req.headers.get("authorization")?.match(/^Bearer (axiom_cli_[a-zA-Z0-9_-]{40,50})$/i)?.[1];
 if(!bearer)return null;
 const {data,error}=await db.from("axiom_cli_tokens").select("id,user_id").eq("token_hash",await sha(bearer))
 .is("revoked_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
 if(error)throw new Error("CLI_SESSION_DB");
 return data;
}
async function handler(req:Request):Promise<Response>{
 const requestOrigin=req.headers.get("origin");
 if(requestOrigin&&requestOrigin!==webOrigin)return reply({message:"Origin not permitted"},403);
 if(req.method==="OPTIONS")return requestOrigin===webOrigin?new Response(null,{status:204,headers:cors}):reply({message:"Origin not permitted"},403);
 const url=new URL(req.url);
 const route=url.pathname.replace(/^.*\/axiom-bridge(?=\/|$)/,"");
 const action=url.searchParams.get("action")||"";
 if(route==="/api/status"&&req.method==="GET")return reply({service:"axiom-bridge",encryption:true,retentionHours:24});
 if(route==="/api/device"&&req.method==="POST"){
   if(action==="start"){
     if(!await throttle("device:start:"+remoteIP(req),15,900))return reply({message:"Too many requests"},429);
     const plain=random64(),digest=await sha(plain);
     for(let attempt=0;attempt<4;attempt++){
       const code=userCode();
       const {error}=await db.from("axiom_device_authorizations").insert({device_code_hash:digest,user_code:code});
       if(!error)return reply({deviceCode:plain,userCode:code,interval:5,expiresIn:600,verificationUri:homeURL+"?device="+code});
       if(error.code!=="23505")break;
     }
     return reply({message:"Cannot allocate device code"},503);
   }
   if(action==="poll"){
     let body;try{body=await json(req)}catch{return reply({message:"Invalid JSON"},400)}
     if(typeof body.deviceCode!=="string"||!deviceCodePattern.test(body.deviceCode))return reply({message:"Invalid device code"},400);
     const digest=await sha(body.deviceCode);
     if(!await throttle("device:poll:"+digest,155,900))return reply({message:"Too many requests"},429);
     const token="axiom_cli_"+random64();
     const {data,error}=await db.rpc("axiom_exchange_device",{p_device_code_hash:digest,p_token_hash:await sha(token),p_token_id:crypto.randomUUID()});
     if(error)return reply({message:"Device exchange failed"},503);
     if(data?.status==="pending")return reply({status:"pending",interval:5},202);
     if(data?.status==="authorized")return reply({status:"authorized",accessToken:token,expiresIn:7776000,tokenType:"Bearer"});
     return reply({message:"Device code expired or already used"},400);
   }
   if(action==="approve"){
     const browser=await webIdentity(req);if(!browser)return reply({message:"Please sign in on the website"},401);
     let body;try{body=await json(req)}catch{return reply({message:"Invalid JSON"},400)}
     const code=typeof body.userCode==="string"?body.userCode.trim().toUpperCase():"";
     if(!userCodePattern.test(code))return reply({message:"Invalid device code"},400);
     if(!await throttle("device:approve:"+browser.id,20,900))return reply({message:"Too many requests"},429);
     const {data,error}=await db.rpc("axiom_approve_device",{p_user_code:code,p_user_id:browser.id});
     if(error)return reply({message:"Device approval failed"},503);
     return data?reply({approved:true}):reply({message:"Device code not found or expired"},404);
   }
 }
 if(route==="/api/cli"){
   const cli=await cliIdentity(req);if(!cli)return reply({message:"CLI token invalid or expired"},401);
   if(req.method==="POST"&&action==="revoke"){
     const {error}=await db.from("axiom_cli_tokens").update({revoked_at:new Date().toISOString()}).eq("id",cli.id).eq("user_id",cli.user_id);
     return error?reply({message:"Unable to revoke"},503):reply({revoked:true});
   }
   if(req.method==="GET"&&!action){
     const {data,error}=await db.from("axiom_users").select("plan").eq("id",cli.user_id).single();
     if(error)return reply({message:"Unable to load account"},503);
     await db.from("axiom_cli_tokens").update({last_used_at:new Date().toISOString()}).eq("id",cli.id);
     return reply({authenticated:true,userId:cli.user_id,tokenId:cli.id,plan:data.plan});
   }
 }
 if(route==="/api/profile"&&(req.method==="GET"||req.method==="PATCH")){
   const user=await webIdentity(req);if(!user)return reply({message:"Sign in to manage your profile"},401);
   if(req.method==="PATCH"){
     let input;try{input=await json(req)}catch{return reply({message:"Invalid JSON"},400)}
     const nickname=typeof input.nickname==="string"?input.nickname.trim():"";
     if(nickname.length<2||nickname.length>32||/[\x00-\x1f\x7f]/.test(nickname))return reply({message:"Nickname must be 2–32 visible characters"},400);
     const {data,error}=await db.from("axiom_users").update({nickname}).eq("id",user.id).select("id,email,plan,nickname").single();
     return error?reply({message:"Cannot update nickname"},503):reply(data);
   }
   const {data,error}=await db.from("axiom_users").select("id,email,plan,nickname").eq("id",user.id).single();
   return error?reply({message:"Cannot load profile"},503):reply(data);
 }
 if(route==="/api/tokens"){
   const user=await webIdentity(req);if(!user)return reply({message:"Sign in first"},401);
   if(req.method==="GET"&&!action){
     const {data,error}=await db.from("axiom_cli_tokens").select("id,created_at,last_used_at,expires_at,revoked_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(50);
     return error?reply({message:"Cannot list CLI devices"},503):reply({tokens:data||[]});
   }
   if(req.method==="POST"&&action==="revoke"){
     let body;try{body=await json(req)}catch{return reply({message:"Invalid JSON"},400)}
     if(typeof body.tokenId!=="string"||!uuid.test(body.tokenId))return reply({message:"Invalid token ID"},400);
     const {data,error}=await db.from("axiom_cli_tokens").update({revoked_at:new Date().toISOString()}).eq("user_id",user.id).eq("id",body.tokenId).select("id").maybeSingle();
     if(error)return reply({message:"Could not revoke device"},503);
     return data?reply({revoked:true}):reply({message:"Device token not found"},404);
   }
 }
 if(route==="/api/sync/key"){
   const browser=await webIdentity(req);const cli=browser?null:await cliIdentity(req);
   const userId=browser?.id||cli?.user_id;if(!userId)return reply({message:"Authentication required"},401);
   if(req.method==="GET"){
     const {data,error}=await db.from("axiom_sync_keys").select("public_key_jwk").eq("user_id",userId).maybeSingle();
     return error?reply({message:"Cannot load sync key"},503):reply({publicKey:data?.public_key_jwk||null});
   }
   if(req.method==="POST"&&browser){
     let body;try{body=await json(req)}catch{return reply({message:"Invalid JSON"},400)}
     const key=body.publicKey;
     if(!key||typeof key!=="object"||Array.isArray(key))return reply({message:"Invalid key"},400);
     const jwk=key as Record<string,unknown>;
     if(jwk.kty!=="RSA"||jwk.alg!=="RSA-OAEP-256"||jwk.e!=="AQAB"||typeof jwk.n!=="string"||jwk.n.length<300||jwk.n.length>900||!/^[a-zA-Z0-9_-]+$/.test(jwk.n))
       return reply({message:"Unsupported key"},400);
     const {data:existing,error:readError}=await db.from("axiom_sync_keys").select("public_key_jwk").eq("user_id",userId).maybeSingle();
     if(readError)return reply({message:"Key lookup unavailable"},503);
     if(existing)return existing.public_key_jwk.n===jwk.n?reply({ok:true}):reply({message:"Another browser key is registered"},409);
     const {error}=await db.from("axiom_sync_keys").insert({user_id:userId,public_key_jwk:jwk});
     return error?reply({message:"Cannot save key"},error.code==="23505"?409:503):reply({ok:true});
   }
 }
 if(route==="/api/sync/pending"&&req.method==="GET"){
   const user=await webIdentity(req);if(!user)return reply({message:"Sign in first"},401);
   const {data,error}=await db.from("axiom_sync_envelopes").select("id,envelope,created_at").eq("user_id",user.id).gt("expires_at",new Date().toISOString()).order("created_at",{ascending:true}).limit(20);
   return error?reply({message:"Inbox unavailable"},503):reply({packages:data||[]});
 }
 if(route==="/api/sync/ack"&&req.method==="POST"){
   const user=await webIdentity(req);if(!user)return reply({message:"Sign in first"},401);
   let body;try{body=await json(req)}catch{return reply({message:"Invalid JSON"},400)}
   if(!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>20||body.ids.some(id=>typeof id!=="string"||!uuid.test(id)))return reply({message:"Invalid IDs"},400);
   const {error}=await db.from("axiom_sync_envelopes").delete().eq("user_id",user.id).in("id",body.ids);
   return error?reply({message:"Cannot acknowledge"},503):reply({acknowledged:true});
 }
 if(route==="/api/sync/upload"&&req.method==="POST"){
   const cli=await cliIdentity(req);if(!cli)return reply({message:"CLI sign-in required"},401);
   if(!await throttle("sync:upload:"+cli.id,15,3600))return reply({message:"Too many packets"},429);
   let body;try{body=await json(req,260000)}catch{return reply({message:"Invalid or oversized envelope"},413)}
   const envelope=body.envelope;
   if(!envelope||typeof envelope!=="object"||Array.isArray(envelope))return reply({message:"Invalid envelope"},400);
   const e=envelope as Record<string,unknown>;
   if(e.v!==1||e.alg!=="RSA-OAEP-256+A256GCM"||typeof e.ek!=="string"||e.ek.length<300||e.ek.length>900||
      typeof e.iv!=="string"||e.iv.length!==16||typeof e.data!=="string"||e.data.length<20||e.data.length>250000||
      Object.keys(e).some(k=>!["v","alg","ek","iv","data"].includes(k)))return reply({message:"Invalid ciphertext"},400);
   const {data:key,error:readError}=await db.from("axiom_sync_keys").select("user_id").eq("user_id",cli.user_id).maybeSingle();
   if(readError)return reply({message:"Cannot verify sync key"},503);
   if(!key)return reply({message:"Open your website profile to set up encryption first"},409);
   const {count,error:countError}=await db.from("axiom_sync_envelopes").select("id",{count:"exact",head:true}).eq("user_id",cli.user_id).gt("expires_at",new Date().toISOString());
   if(countError)return reply({message:"Queue unavailable"},503);
   if((count||0)>=20)return reply({message:"Inbox full"},429);
   const {error}=await db.from("axiom_sync_envelopes").insert({user_id:cli.user_id,cli_token_id:cli.id,envelope:e});
   return error?reply({message:"Cannot queue encrypted packet"},503):reply({queued:true,expiresIn:86400});
 }
 return reply({message:"Not found"},404);
}
Deno.serve(async(req:Request)=>{
 try{return await handler(req)}
 catch(error){console.error("axiom_bridge_error",error instanceof Error?error.name:"unknown");return reply({message:"Service temporarily unavailable"},503)}
});
