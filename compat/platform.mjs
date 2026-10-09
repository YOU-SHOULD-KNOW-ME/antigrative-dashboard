// User-owned paths, shared by the collector, SDK and both renderer adapters.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

export function platformPaths({ platform = process.platform, home = homedir(), env = process.env } = {}) {
  let config, local;
  if (platform === 'win32') {
    config = env.APPDATA || join(home, 'AppData', 'Roaming');
    local = env.LOCALAPPDATA || join(home, 'AppData', 'Local');
  } else if (platform === 'darwin') {
    config = local = join(home, 'Library', 'Application Support');
  } else if (platform === 'linux') {
    config = env.XDG_CONFIG_HOME || join(home, '.config');
    local = env.XDG_DATA_HOME || join(home, '.local', 'share');
  } else throw new Error('Supported platforms: Windows, Linux, macOS');
  const settings = join(local, 'AntigravityPulse', 'settings.json');
  let saved = {};
  try { saved=JSON.parse(readFileSync(settings,'utf8').replace(/^\uFEFF/,'')); } catch {}
  const profile = env.AG_PULSE_PROFILE || (typeof saved.profile === 'string' ? saved.profile : null) || join(config, 'Antigravity');
  const profileLog=join(profile,'logs','language_server.log');
  const log=env.AG_PULSE_LOG || (platform==='darwin'?join(home,'Library','Logs','Antigravity','language_server.log'):profileLog);
  return {
    profile, log, logCandidates:env.AG_PULSE_LOG?[log]:[...new Set([log,profileLog])],
    settings,
    pluginConfig: join(home, '.gemini', 'config', 'config.json'),
    data: env.ANTIGRAVITY_EXECUTABLE_DATA_DIR || join(home, '.gemini', 'antigravity', 'sidecar_data', 'antigravity-pulse', 'panel', 'data'),
  };
}

export function agentExecutables({ platform = process.platform, home = homedir(), env = process.env, arch = process.arch } = {}) {
  if (env.ANTIGRAVITY_AGENTAPI_EXE) return [env.ANTIGRAVITY_AGENTAPI_EXE];
  const roots = platform === 'win32' ? [join(env.LOCALAPPDATA || join(home,'AppData','Local'),'Programs','antigravity','resources')]
    : platform === 'darwin' ? ['/Applications/Antigravity.app/Contents/Resources',join(home,'Applications','Antigravity.app','Contents','Resources')]
    : ['/opt/Antigravity/resources','/opt/antigravity/resources','/usr/share/antigravity/resources'];
  if (env.AG_PULSE_APP_RESOURCES) roots.unshift(env.AG_PULSE_APP_RESOURCES);
  try { const saved=JSON.parse(readFileSync(platformPaths({platform,home,env}).settings,'utf8').replace(/^\uFEFF/,''));if(typeof saved.appResources==='string')roots.unshift(saved.appResources); } catch {}
  const names = platform === 'win32' ? ['language_server.exe'] : ['language_server',`language_server_${platform === 'darwin' ? 'macos' : 'linux'}_${arch === 'arm64' ? 'arm' : 'x'}64`, `language_server_${platform === 'darwin' ? 'macos' : 'linux'}`];
  return roots.flatMap(root => names.map(name => join(root,'bin',name)));
}

export function installedAgentExecutable(options) {
  const candidates = agentExecutables(options);
  const file = candidates.find(candidate => existsSync(candidate));
  if (!file) throw new Error('Bundled language server not found; set ANTIGRAVITY_AGENTAPI_EXE to the installed host binary.');
  return file;
}
