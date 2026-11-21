import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'fleet-usage-'));
try {
  const mock=join(dir,'sdk.mjs');
  writeFileSync(mock,`export function query(){return {async *[Symbol.asyncIterator](){yield {type:'result',subtype:'success',is_error:false,result:'完成',session_id:'mock',num_turns:1,total_cost_usd:0,usage:{input_tokens:10,cache_read_input_tokens:80,cache_creation_input_tokens:10,output_tokens:3},modelUsage:{fixture:{inputTokens:10,cacheReadInputTokens:80,cacheCreationInputTokens:10,outputTokens:3}}}}}}`);
  const loader=join(dir,'loader.mjs');
  writeFileSync(loader,`export async function resolve(s,c,n){if(s==='@anthropic-ai/claude-agent-sdk')return {url:${JSON.stringify(pathToFileURL(mock).href)},shortCircuit:true};return n(s,c)}`);
  const config=join(dir,'config.json');writeFileSync(config,JSON.stringify({stub:{model:'mock-gemini',baseURL:'http://127.0.0.1:1',apiKeyEnv:'FLEET_TEST_KEY'}}));
  const runs=join(dir,'runs');mkdirSync(runs);
  const env={...process.env,AGENT_FLEET_RUNS_DIR:runs,FLEET_TEST_KEY:'fixture-key',NODE_OPTIONS:`--no-warnings --experimental-loader=${pathToFileURL(loader).href}`};
  delete env.FLEET_DETACHED_RUN_ID;delete env.FLEET_SLOT_RUN_ID;delete env.FLEET_PARENT_RUN_ID;
  const args=['run','--model','stub','--prompt','完成','--models-config',config,'--cwd',dir,'--json'];
  const result=spawnSync(process.execPath,[resolve('bin/agent-fleet.mjs'),...args],{env,encoding:'utf8',timeout:60000});
  assert.equal(result.status,0,result.stderr);const brief=JSON.parse(result.stdout);
  assert.equal(brief.usage.cache_read_input_tokens,80);assert.equal(brief.modelUsage.fixture.cacheReadInputTokens,80);
  const state=JSON.parse(readFileSync(brief.logPath.replace(/\.log$/,'.json'),'utf8'));
  assert.equal(state.brief.usage.cache_creation_input_tokens,10);assert.equal(state.brief.modelUsage.fixture.outputTokens,3);
  const wait=spawnSync(process.execPath,[resolve('bin/agent-fleet.mjs'),'wait',state.runId,'--quiet'],{env,encoding:'utf8',timeout:60000});
  assert.equal(wait.status,0,wait.stderr);assert.match(wait.stdout,/缓存命中率 80\.00%/);
  console.log('SDK usage persisted and cache hit shown');
} finally {rmSync(dir,{recursive:true,force:true});}
