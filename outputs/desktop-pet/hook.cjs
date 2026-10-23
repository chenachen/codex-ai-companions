// Codex hook: forward lifecycle metadata only. Never return an approval or model instruction.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const runtime = process.env.AI_PET_RUNTIME || path.join(__dirname, 'runtime');
function toolFailed(value) {
  if (typeof value === 'string') { try { return toolFailed(JSON.parse(value)); } catch { return /(?:Process exited with code|exit_code["']?\s*:)\s*[1-9]\d*/.test(value); } }
  if (!value || typeof value !== 'object') return false;
  if (value.isError === true || value.is_error === true || (typeof value.exit_code === 'number' && value.exit_code !== 0)) return true;
  return Array.isArray(value.content) && value.content.some(x => x.type === 'text' && toolFailed(x.text));
}
function normalize(p, now = Date.now()) {
  return {
    schema: 1, source: 'hook', at: now,
    event: String(p.hook_event_name || ''), sessionId: String(p.session_id || ''), turnId: String(p.turn_id || ''),
    transcript: typeof p.transcript_path === 'string' ? p.transcript_path : null,
    cwd: typeof p.cwd === 'string' ? p.cwd : '',
    tool: typeof p.tool_name === 'string' ? p.tool_name : '',
    toolFailed: p.hook_event_name === 'PostToolUse' && toolFailed(p.tool_response),
    reason: typeof p.reason === 'string' ? p.reason : null
  };
}
if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', b => { input += b; });
  process.stdin.on('end', () => {
    try {
      const p = JSON.parse(input); const event = normalize(p);
      const queue = path.join(runtime, 'queue'); fs.mkdirSync(queue, {recursive:true});
      const file = path.join(queue, event.at + '-' + crypto.randomUUID() + '.json');
      fs.writeFileSync(file + '.tmp', JSON.stringify(event)); fs.renameSync(file + '.tmp', file);
      if (event.event === 'Stop') process.stdout.write('{}');
    } catch (e) {
      try { fs.mkdirSync(runtime, {recursive:true}); fs.appendFileSync(path.join(runtime,'hook-errors.log'), new Date().toISOString()+' '+e.message+'\n'); } catch {}
    }
  });
}
module.exports = {normalize, toolFailed};
