const BASE='http://127.0.0.1:8841';
const tools=[
  {name:'Read',description:'读文件',input_schema:{type:'object',properties:{file_path:{type:'string'}},required:['file_path']}},
  {name:'Glob',description:'找文件',input_schema:{type:'object',properties:{pattern:{type:'string'}},required:['pattern']}},
  {name:'Grep',description:'搜内容',input_schema:{type:'object',properties:{pattern:{type:'string'}},required:['pattern']}},
  {name:'Bash',description:'执行命令',input_schema:{type:'object',properties:{command:{type:'string'}},required:['command']}},
  {name:'Edit',description:'改文件',input_schema:{type:'object',properties:{file_path:{type:'string'}},required:['file_path']}},
  {name:'Write',description:'写文件',input_schema:{type:'object',properties:{file_path:{type:'string'}},required:['file_path']}},
  {name:'TodoWrite',description:'待办',input_schema:{type:'object',properties:{todos:{type:'array'}},required:['todos']}}
];
const H={'content-type':'application/json','x-prank-think-ms':'0'};
(async()=>{
  for (const mode of ['auto','real','fictional']) {
    const r=await fetch(BASE+'/v1/messages',{method:'POST',headers:Object.assign({},H,{'x-prank-toolcall':mode}),body:JSON.stringify({model:'claude-opus-5.5',max_tokens:1024,messages:[{role:'user',content:'hi'}],tools})});
    const j=await r.json();
    const tu=j.content.find(b=>b.type==='tool_use');
    console.log(('mode='+mode).padEnd(20)+'-> '+(tu?tu.name+' '+JSON.stringify(tu.input):'（无工具调用）'));
  }
  // 只用 Bash（危险工具）时 auto 应该回退到虚构工具
  const r=await fetch(BASE+'/v1/messages',{method:'POST',headers:H,body:JSON.stringify({model:'auto',max_tokens:1024,messages:[{role:'user',content:'hi'}],tools:[tools[3]]})});
  const j=await r.json();
  const tu=j.content.find(b=>b.type==='tool_use');
  console.log('只有 Bash + auto     -> '+(tu?tu.name+' '+JSON.stringify(tu.input):'无'));
})();
