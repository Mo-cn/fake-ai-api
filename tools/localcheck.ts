const BASE='http://127.0.0.1:8841';
(async()=>{
  const r = await fetch(BASE+'/v1/chat/completions',{headers:{'x-forwarded-proto':'https','x-forwarded-host':'ai-free.moiu.cn'}});
  console.log('线上场景 GET -> '+r.status+' allow='+r.headers.get('allow'));
  console.log((await r.text()).replace(/\s+/g,' '));
  const r2 = await fetch(BASE+'/v1/chat/completions');
  console.log('');
  console.log('本机场景 GET -> '+r2.status);
  console.log((await r2.text()).replace(/\s+/g,' '));
})();
