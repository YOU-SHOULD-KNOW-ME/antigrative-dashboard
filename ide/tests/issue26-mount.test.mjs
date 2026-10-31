import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {RuntimeUi} from '../../compat/runtime-ui.mjs';

test('IDE mount discovery does not wait for the metrics client',async()=>{
 const main=await readFile(new URL('../main.mjs',import.meta.url),'utf8');
 const target={type:'page',url:'vscode-file://vscode-app/d:/IDE/resources/app/out/vs/code/electron-browser/workbench/workbench.html',webSocketDebuggerUrl:'ws://127.0.0.1:9000/devtools/page/ide'};
 let clientDiscoverCalls=0,snapshotCalls=0;
 // The previous callback awaited this rejecting method and prevented a CDP
 // target from reaching RuntimeUi. Keep it in the evaluated callback scope so
 // that regression fails at discovery if that dependency returns.
 const client={discover:async()=>{clientDiscoverCalls++;throw Error('metrics service unavailable');}};
 const ideTargets=async()=>({port:9000,targets:[target]});
 const callback=main.match(/discover:(async\(\)=>\{[^}]+\})\}\);/);
 assert.ok(callback,'RuntimeUi discover callback should remain a small renderer-only operation');
 const context={client,debugPort:0,ideTargets,profile:'fixture'};
 const discover=runInNewContext(`(${callback[1]})`,context);
 class Connection{
  constructor(options){this.options=options;this.calls=[];this.closed=false;}
  async open(){return this;}
  async command(method,params={}){
   this.calls.push({method,params});
   if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'main'}}};
   if(method==='Runtime.enable')this.options.onEvent({method:'Runtime.executionContextCreated',params:{context:{id:7,origin:'vscode-file://vscode-app',auxData:{isDefault:true,frameId:'main'}}}});
   if(method==='Page.addScriptToEvaluateOnNewDocument')return {identifier:'script'};
   if(method==='Runtime.evaluate'&&params.returnByValue)return {result:{value:{mounted:true,installed:true,bridge:true}}};
   return {result:{}};
  }
  close(){this.closed=true;}
 }
 const connections=[];
 const ui=new RuntimeUi({profile:'fixture',source:'safe-widget',discover,connect:(_,options)=>{const connection=new Connection(options);connections.push(connection);return connection;},targetOrigin:()=> 'vscode-file://vscode-app',snapshot:async()=>{snapshotCalls++;throw Error('metrics service unavailable');}});
 const returnedTargets=await discover();
 assert.deepEqual(returnedTargets,[target]);
 assert.equal(context.debugPort,9000);
 assert.equal(clientDiscoverCalls,0,'CDP discovery must not call the metrics client');
 await ui.tick();
 assert.equal(connections.length,1);
 assert.equal(ui.sessions.size,1);
 assert.equal(ui.health.state,'mounted');
 await ui.event(connections[0],{method:'Runtime.bindingCalled',params:{name:ui.binding,executionContextId:7,payload:JSON.stringify({id:1,type:'metrics',input:{conversationId:null}})}});
 assert.equal(snapshotCalls,1);
 const response=connections[0].calls.at(-1).params.expression;
 assert.match(response,/"connection":"offline"/,'metrics failures must resolve through the existing offline response');
 assert.notEqual(ui.health.state,'reconnecting');
 await ui.stop();
});
