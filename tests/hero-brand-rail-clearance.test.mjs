import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workerSource=readFileSync(new URL('../worker-ai.js', import.meta.url),'utf8');
const matcher=/var railClearance=function\(\)\{(.*?)\};var pending=false;/s;
const clearanceBody=workerSource.match(matcher)?.[1];

test('homepage controls have responsive CSS clearance for the brand rail',()=>{
  assert.match(workerSource,/body\.woodrick-home-actions \.hey-woodrick-float,\s*body\.woodrick-home-actions \.float-actions\{bottom:var\(--woodrick-brand-actions-bottom,22px\)!important\}/);
  assert.match(workerSource,/bottom:calc\(var\(--woodrick-brand-actions-bottom,8px\) \+ env\(safe-area-inset-bottom,0px\)\)!important/);
  assert.ok(clearanceBody,'homepage collision handler should exist');
});

function getClearance({height=800,railTop,railBottom,buttonHeight=54,actionsHeight=92,mobile=false}){
  assert.ok(clearanceBody,'missing collision handler');
  let saved='';
  const button={offsetHeight:buttonHeight};
  const actions={offsetHeight:actionsHeight};
  const rail={getBoundingClientRect:()=>({top:railTop,bottom:railBottom})};
  const document={
    documentElement:{clientHeight:height},
    querySelector(selector){
      return selector==='.hero-brand-dock'?rail:selector==='.hey-woodrick-float'?button:selector==='.float-actions'?actions:null;
    },
    body:{style:{setProperty(key,value){assert.equal(key,'--woodrick-brand-actions-bottom');saved=value;}}}
  };
  const window={innerHeight:height,matchMedia:()=>({matches:mobile})};
  const handler=Function('document','window',`return function(){${clearanceBody}}`)(document,window);
  handler();
  return saved;
}

test('desktop buttons move above rail only while the rail is behind them',()=>{
  assert.equal(getClearance({railTop:680,railBottom:790}),'144px');
  assert.equal(getClearance({railTop:200,railBottom:310}),'22px');
  assert.equal(getClearance({railTop:840,railBottom:950}),'22px');
});

test('mobile bottom row clears the rail without moving unnecessarily',()=>{
  assert.equal(getClearance({height:720,railTop:590,railBottom:700,actionsHeight:54,mobile:true}),'154px');
  assert.equal(getClearance({height:720,railTop:150,railBottom:260,actionsHeight:54,mobile:true}),'8px');
});
