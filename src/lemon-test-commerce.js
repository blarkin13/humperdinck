/* Lemon Squeezy TEST-MODE integration only.
 * Deliberately cannot create or modify pro_licenses or production purchases.
 * Config is disabled unless every LS_TEST_* secret/ID is provided.
 * Test webhooks must verify HMAC-SHA256, store, variant and test_mode=true.
 */
const encoder=new TextEncoder();
const now=()=>Math.floor(Date.now()/1000);
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff'}});
const fail=(status,error)=>reply({error},status);
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const digits=s=>/^[1-9][0-9]{0,14}$/.test(String(s||''));
export const configured=env=>Boolean(env.AUTH_DB&&env.LS_TEST_API_KEY&&
 env.LS_TEST_WEBHOOK_SECRET&&digits(env.LS_TEST_STORE_ID)&&digits(env.LS_TEST_VARIANT_ID));

function bytesFromHex(hex){
 if(typeof hex!=='string'||!/^[a-f0-9]{64}$/i.test(hex))return null;
 return Uint8Array.from(hex.match(/../g),x=>parseInt(x,16));
}
async function shaHex(raw){
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',raw));
 return Array.from(hash,x=>x.toString(16).padStart(2,'0')).join('');
}
export async function verifySignature(raw,signature,secret){
 const bytes=bytesFromHex(signature);
 if(!bytes||!secret)return false;
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),
  {name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,bytes,raw);
}
export function checkedOrder(data,env){
 if(data?.data?.type!=='orders'||!digits(data.data.id))return null;
 const meta=data.meta||{},a=data.data.attributes||{};
 const kind=meta.event_name;
 const custom=meta.custom_data||{};
 if(!['order_created','order_refunded'].includes(kind)
    ||a.test_mode!==true
    ||String(a.store_id)!==String(env.LS_TEST_STORE_ID)
    ||String(a.first_order_item?.variant_id)!==String(env.LS_TEST_VARIANT_ID)
    ||!uuid(custom.intent_id)||!uuid(custom.account_id)
    ||typeof a.currency!=='string'||!/^[A-Z]{3}$/.test(a.currency)
    ||!Number.isSafeInteger(a.total)||a.total<0)return null;
 if(kind==='order_created'&&(a.status!=='paid'||a.refunded===true))return null;
 const refund=kind==='order_refunded';
 return {kind,orderId:String(data.data.id),intentId:custom.intent_id,accountId:custom.account_id,
  orderNumber:a.order_number==null?null:String(a.order_number).slice(0,80),
  total:a.total,currency:a.currency,
  status:refund?(a.refunded===true?'refunded':'partially_refunded'):'paid'};
}
function originMatches(req){
 return req.headers.get('Origin')===new URL(req.url).origin;
}
export async function handleLemonTest(request,env,{session}){
 const url=new URL(request.url),path=url.pathname;
 if(!configured(env))return fail(503,'Lemon Squeezy test integration is not configured. Live checkout is disabled.');
 if(path==='/api/commerce/test/status'&&request.method==='GET'){
  const user=await session(request,env);
  if(!user||user.kind!=='web')return fail(401,'Sign in first');
  const rows=await env.AUTH_DB.prepare(
    'SELECT id,created_at,status FROM commerce_test_intents WHERE user_id=? ORDER BY created_at DESC LIMIT 10'
  ).bind(user.id).all();
  return reply({mode:'test',checkout_available:true,production_checkout_available:false,
    checkout_intents:rows.results||[],production_entitlement_changes:false});
 }
 if(path==='/api/commerce/test/checkout'&&request.method==='POST'){
  if(!originMatches(request))return fail(403,'Invalid request origin');
  const user=await session(request,env);
  if(!user||user.kind!=='web')return fail(401,'Sign in through your browser to test checkout');
  const intentId=crypto.randomUUID();
  const result=await env.AUTH_DB.prepare(
    'INSERT INTO commerce_test_intents(id,user_id,created_at,expires_at,status) VALUES (?,?,?,?,"started")'
  ).bind(intentId,user.id,now(),now()+3600).run();
  if(result.meta?.changes!==1)return fail(503,'Could not create test checkout intent');
  const body={data:{type:'checkouts',attributes:{
   test_mode:true,
   checkout_options:{embed:false},
   product_options:{enabled_variants:[Number(env.LS_TEST_VARIANT_ID)],
    redirect_url:'https://humperdinck.studio/account/'},
   checkout_data:{email:user.email||undefined,
    custom:{account_id:user.id,intent_id:intentId}}
  },relationships:{
   store:{data:{type:'stores',id:String(env.LS_TEST_STORE_ID)}},
   variant:{data:{type:'variants',id:String(env.LS_TEST_VARIANT_ID)}}
  }}};
  let response;
  try{
   response=await fetch('https://api.lemonsqueezy.com/v1/checkouts',{
    method:'POST',headers:{'Accept':'application/vnd.api+json',
    'Content-Type':'application/vnd.api+json','Authorization':'Bearer '+env.LS_TEST_API_KEY},
    body:JSON.stringify(body)});
  }catch{return fail(502,'Test checkout provider is unavailable')}
  if(!response.ok)return fail(502,'Test checkout could not be created');
  const resultJson=await response.json().catch(()=>null);
  const checkout=resultJson?.data;
  const checkoutUrl=checkout?.attributes?.url;
  let target;
  try{target=new URL(checkoutUrl)}catch{return fail(502,'Invalid test checkout URL')}
  if(!target.hostname.endsWith('.lemonsqueezy.com')||target.protocol!=='https:'
     ||checkout.attributes.test_mode!==true)return fail(502,'Provider returned a non-test checkout');
  await env.AUTH_DB.prepare('UPDATE commerce_test_intents SET checkout_id=? WHERE id=? AND user_id=?')
   .bind(String(checkout.id).slice(0,100),intentId,user.id).run();
  return reply({test_mode:true,checkout_url:checkoutUrl,expires_in_seconds:3600,
   message:'Sandbox only; test orders never unlock commercial Pro'});
 }
 if(path==='/api/commerce/test/webhook'&&request.method==='POST'){
  const length=Number(request.headers.get('Content-Length')||'0');
  if(length>100000)return fail(413,'Payload too large');
  const raw=await request.arrayBuffer();
  if(raw.byteLength>100000)return fail(413,'Payload too large');
  if(!await verifySignature(raw,request.headers.get('X-Signature'),
     env.LS_TEST_WEBHOOK_SECRET))return fail(401,'Invalid webhook signature');
  const data=(()=>{try{return JSON.parse(new TextDecoder().decode(raw))}catch{return null}})();
  const order=checkedOrder(data,env);
  if(!order||request.headers.get('X-Event-Name')!==order.kind)
   return fail(400,'Unexpected non-test order, store, variant or event');
  const intent=await env.AUTH_DB.prepare(
    'SELECT id,user_id,status FROM commerce_test_intents WHERE id=? AND user_id=?'
  ).bind(order.intentId,order.accountId).first();
  if(!intent)return fail(409,'Unknown sandbox checkout intent');
  const checksum=await shaHex(raw);
  // D1 batch executes atomically. Failures trigger provider retry.
  await env.AUTH_DB.batch([
   env.AUTH_DB.prepare(
    'INSERT OR IGNORE INTO commerce_test_webhook_events(body_sha256,provider_order_id,event_name,processed_at) VALUES (?,?,?,?)'
   ).bind(checksum,order.orderId,order.kind,now()),
   env.AUTH_DB.prepare(
    `INSERT INTO commerce_test_orders(provider_order_id,intent_id,user_id,order_number,amount_cents,currency,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(provider_order_id) DO UPDATE SET
       status=CASE WHEN commerce_test_orders.status IN ('refunded','partially_refunded')
          AND excluded.status='paid' THEN commerce_test_orders.status ELSE excluded.status END,
       updated_at=excluded.updated_at`
   ).bind(order.orderId,order.intentId,order.accountId,order.orderNumber,order.total,
     order.currency,order.status,now(),now()),
   env.AUTH_DB.prepare(
    "UPDATE commerce_test_intents SET status=CASE WHEN status='refunded' THEN 'refunded' ELSE ? END WHERE id=? AND user_id=?"
   ).bind(order.kind==='order_refunded'?'refunded':'paid',order.intentId,order.accountId)
  ]);
  return reply({ok:true,mode:'test',pro_license_granted:false});
 }
 return fail(404,'Unknown sandbox commerce endpoint');
}
