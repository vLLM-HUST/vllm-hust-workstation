// Recover raw old formatter text from an explicitly saved, operator-owned legacy page.
// Offline parsing only: jsdom does NOT execute scripts or load remote resources here.
import { readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const [source, destination, date] = process.argv.slice(2);
if (!source || !destination || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
  throw new Error("Usage: node scripts/archive_saved_chat.mjs owned-saved-page.html session.json YYYY-MM-DD");
}
const doc = new JSDOM(readFileSync(source,"utf8")).window.document;
const messages = [...doc.querySelectorAll('.animate-slide-up')].map((element,index) => {
  const body = [...element.querySelectorAll('.whitespace-pre-wrap')].find(item => !item.hasAttribute('data-reasoning-text'));
  if (!body) throw new Error("Not the supported legacy plain-text formatter; refusing lossy conversion");
  if (body.querySelector('pre, code')) throw new Error("Legacy code delimiters/language were not retained in DOM; use raw export/probe instead of lossy conversion");
  const role = element.classList.contains('flex-row-reverse') ? 'user' : 'assistant';
  const time = [...element.querySelectorAll('span')].map(item=>item.textContent).find(text=>/^\d\d:\d\d$/.test(text));
  if (!time) throw new Error("Missing visible message time");
  const message = {id:`legacy-${index}`,role,content:body.textContent,timestamp:Date.parse(`${date}T${time}:00+08:00`)};
  const reasoning = element.querySelector('[data-reasoning-text]')?.textContent;
  if (reasoning) message.reasoning = reasoning;
  const usage = [...element.querySelectorAll('span')].map(item=>item.textContent.match(/^(\d+)\s*tokens（含思考，上游统计）$/)).find(Boolean);
  if (usage) message.tokensUsed = Number(usage[1]);
  // The saved DOM does not prove the upstream terminal status: do not invent one.
  return message;
});
if (!messages.length) throw new Error("No legacy messages found");
writeFileSync(destination,JSON.stringify({version:1,streaming:false,messages},null,2),{flag:'wx',mode:0o600});
console.log(JSON.stringify({messages:messages.map(({role,content})=>({role,characters:content.length})),modelRequested:false}));
