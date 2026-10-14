import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {cookies,headers} from 'next/headers';

const COOKIE_NAME='admin_session';
const SESSION_SECONDS=60*60*8;

function requiredSecret(){
  const secret=process.env.ADMIN_SESSION_SECRET||process.env.ADMIN_PASSWORD;
  if(!secret)throw new Error('ADMIN_PASSWORD 或 ADMIN_SESSION_SECRET 未配置；管理后台已安全锁定。');
  return secret;
}

function safeEqual(left:string,right:string){
  const a=Buffer.from(left);const b=Buffer.from(right);
  return a.length===b.length&&timingSafeEqual(a,b);
}

function sign(payload:string){return createHmac('sha256',requiredSecret()).update(payload).digest('base64url');}

export function verifyAdminPassword(candidate:string){
  const expected=process.env.ADMIN_PASSWORD;
  return Boolean(expected)&&safeEqual(candidate,expected!);
}

export async function assertSameOrigin(){
  const requestHeaders=await headers();
  const origin=requestHeaders.get('origin');
  if(!origin)return;
  const host=requestHeaders.get('x-forwarded-host')||requestHeaders.get('host');
  if(!host||new URL(origin).host!==host)throw new Error('Forbidden origin');
}

export async function createAdminSession(){
  const expires=Math.floor(Date.now()/1000)+SESSION_SECONDS;
  const payload=`v1.${expires}`;
  (await cookies()).set(COOKIE_NAME,`${payload}.${sign(payload)}`,{
    httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',
    path:'/',maxAge:SESSION_SECONDS
  });
}

export async function isAdminSession(){
  const token=(await cookies()).get(COOKIE_NAME)?.value;
  if(!token)return false;
  const [version,expiresText,signature,...rest]=token.split('.');
  if(version!=='v1'||rest.length||!expiresText||!signature)return false;
  const expires=Number(expiresText);
  if(!Number.isFinite(expires)||expires<=Math.floor(Date.now()/1000))return false;
  try{return safeEqual(signature,sign(`${version}.${expiresText}`));}catch{return false;}
}

export async function requireAdminSession(){
  if(!await isAdminSession())throw new Error('Unauthorized');
}
