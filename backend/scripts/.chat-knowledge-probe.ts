import { detectChatToolRequest } from '../src/utils/chatToolDetector.js';
import { runChatTool } from '../src/utils/chatToolRunner.js';

const phrase = 'what do you know about building arcade games';

// 1. Does the detector intercept it?
const toolReq = detectChatToolRequest(phrase);
console.log('detected tool:', toolReq ? JSON.stringify(toolReq, null, 1) : 'NONE (falls through to plain LLM chat)');

// 2. If detected, what does the tool actually return?
if (toolReq) {
  const outcome = await runChatTool(toolReq);
  console.log('\n--- contextBlock (first 1500 chars) ---');
  console.log(String(outcome.contextBlock).substring(0, 1500));
}
