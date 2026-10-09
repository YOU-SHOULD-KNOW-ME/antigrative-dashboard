// Read only whitelisted primary/background/foreground seeds; never expose the customization config.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {platformPaths} from './platform.mjs';
const theme=createRequire(import.meta.url)('./theme.cjs')();

export async function readHostTheme({file=platformPaths().pluginConfig,read=readFile}={}) {
  try {
    const text=await read(file,'utf8');if(text.length>1048576)return {};
    const settings=JSON.parse(text.replace(/^\uFEFF/,''))?.userSettings;
    const mode={THEME_MODE_DARK:'dark',THEME_MODE_LIGHT:'light',THEME_MODE_SYSTEM:'system',dark:'dark',light:'light',system:'system'}[settings?.themeMode];
    return theme.normalizeHostTheme({mode,dark:settings?.customThemeSeedsDark,light:settings?.customThemeSeedsLight});
  }catch{return {};}
}
