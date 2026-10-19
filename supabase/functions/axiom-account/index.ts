import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import bcrypt from "npm:bcryptjs@3.0.2";
const origin="https://zaoastronaftik-bit.github.io";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"authorization,content-type","Access-Control-Expose-Headers":"set-auth-token","Vary":"Origin","Cache-Control":"no-store"};
function reply(data:unknown,status=200,extra:Record<string,string>={}){return new Response(JSON.stringify(data),{status,headers:{...cors,...extra,"Content-Type":"application/json"}})}
const hex=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)))).map(b=>b.toString(16).padStart(2,"0")).join("");
const newToken=()=>{const b=crypto.getRandomValues(new Uint8Array(32));return Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("")};
async function session(req:Request){const token=req.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];if(!token)return null;const hash=await hex(token);const {data}=await db.from("axiom_sessions").select("user_id,expires_at").eq("token_hash",hash).gt("expires_at",new Date().toISOString()).maybeSingle();return data?{...data,hash}:null}
Deno.serve(async req=>{
if(req.headers.get("origin")!==origin)return reply({message:"Forbidden origin"},403);
if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
const path=new URL(req.url).pathname.replace(/^.*\/axiom-account(?=\/|$)/,"");
if(req.method==="GET"&&path==="/api/status")return reply({passwordRecovery:false});
if(req.method==="GET"&&path==="/api/profile"){const s=await session(req);if(!s)return reply({message:"Unauthorized"},401);const {data,error}=await db.from("axiom_users").select("id,email,plan").eq("id",s.user_id).single();return error?reply({message:"Profile unavailable"},500):reply(data)}
if(req.method!=="POST")return reply({message:"Not found"},404);
if(path==="/api/auth/sign-out"){const s=await session(req);if(s)await db.from("axiom_sessions").delete().eq("token_hash",s.hash);return reply({ok:true})}
if(!["/api/auth/sign-up/email","/api/auth/sign-in/email"].includes(path))return reply({message:"Not found"},404);
let body;try{if(Number(req.headers.get("content-length")||0)>4096)return reply({message:"Request too large"},413);body=await req.json()}catch{return reply({message:"Invalid JSON"},400)}
const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
const password=body.password;
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=="string"||password.length<10||password.length>128)return reply({message:"Invalid email or password (10-128 characters)"},400);
const ip=(req.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim();
const key=await hex(ip+"|"+email);
const {data:allowed,error:limitError}=await db.rpc("axiom_limit_attempt",{p_key:key,p_max:10,p_window_seconds:900});
if(limitError)return reply({message:"Temporarily unavailable"},503);
if(!allowed)return reply({message:"Too many attempts. Try again later."},429);
let user;
if(path==="/api/auth/sign-up/email"){
const hash=await bcrypt.hash(password,12);
const {data,error}=await db.from("axiom_users").insert({email,password_hash:hash}).select("id,email,plan").single();
if(error)return reply({message:error.code==="23505"?"Account already exists":"Registration failed"},error.code==="23505"?409:500);
user=data;
}else{
const {data}=await db.from("axiom_users").select("id,email,plan,password_hash").eq("email",email).maybeSingle();
const valid=await bcrypt.compare(password,data?.password_hash||"$2b$12$Jd0a5bfxfUOk7W7AHG3txeZ88YEsTX3oqS86j7Lk3zqU0s.3M41fO");
if(!data||!valid)return reply({message:"Invalid email or password"},401);
user=data;
}
const token=newToken();const {error}=await db.from("axiom_sessions").insert({token_hash:await hex(token),user_id:user.id,expires_at:new Date(Date.now()+7*86400000).toISOString()});
if(error)return reply({message:"Session creation failed"},500);
return reply({user:{id:user.id,email:user.email,plan:user.plan}},200,{"set-auth-token":token});
});