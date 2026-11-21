const headlessOverrides = [
  'features.computer_use=false',
  'mcp_servers.node_repl.enabled=false',
  'mcp_servers.computer-use.enabled=false',
  ...['browser', 'chrome', 'codex-app-tools', 'computer-history', 'unified-computer-use']
    .map(name => `plugins."${name}@openai-bundled".enabled=false`),
].flatMap(setting => ['-c', setting]);

export function codexSessionOverrides(brief = '', grants = []) {
  const explicitGrant = grants.some(grant => /^(?:browser|gui)$/i.test(grant)) ||
    /^(?:浏览器|GUI)授权[：:]\s*(?:是|允许|已授权|yes|true)(?=\s|[。；,，]|$)/im.test(brief);
  const scopedGrant = brief.split('\n').some(line =>
    /^(?:允许范围|授权范围|正文补充)[：:]/.test(line) &&
    /(?:(?<!不)(?<!未)允许(?:使用)?|(?<!不)可使用|已授权使用|[：:]\s*)(?:(?:本机|已登录|现有|Mini 上的)\s*)*\s*(?:Chrome|浏览器|GUI|computer.use)(?!\s*(?:禁用|禁止|不授权|不可用))/i.test(line));
  return explicitGrant || scopedGrant ? [] : headlessOverrides;
}
