// Shared theme controller for the injected Shadow DOM and the SDK side panel.
module.exports = function createAgPulseTheme() {
  const palettes = {
    dark: { scheme:'dark', page:'#121315', background:'#1c1d1f', card:'#2a2c2f', 'card-end':'#303235', foreground:'#e1e3e7', chip:'#aaaeb6', muted:'#adb2ba', subtle:'#a3aab5', label:'#b8bdc5', hover:'#292b2e', 'hover-text':'#d9dce2', accent:'#85a8ff', emphasis:'#dbe5ff', border:'#41454d', separator:'#ffffff15', track:'#ffffff15', control:'#383b3f', 'control-text':'#c2c7d1', menu:'#303338', selected:'#444950', ring:'#9fadc7', 'ring-track':'#565c67', dot:'#777c84', success:'#8bb19b', warning:'#d7b079', danger:'#e99b9b', shadow:'#0005' },
    light: { scheme:'light', page:'#f5f6f8', background:'#ffffff', card:'#ffffff', 'card-end':'#f5f7fa', foreground:'#202631', chip:'#485261', muted:'#596575', subtle:'#626d7c', label:'#515c6b', hover:'#e9edf3', 'hover-text':'#172333', accent:'#315fc4', emphasis:'#284e9b', border:'#ccd3df', separator:'#18253b20', track:'#dce2ec', control:'#e8edf4', 'control-text':'#354255', menu:'#ffffff', selected:'#e4ebf6', ring:'#4667a0', 'ring-track':'#c5cedd', dot:'#707b8a', success:'#347451', warning:'#8b601b', danger:'#b13c3c', shadow:'#14234026' },
  };
  const declarations = theme => Object.entries(palettes[theme]).map(([key,value])=>`--pulse-${key}:${value}`).join(';');
  function css(selector) {
    return `${selector}{${declarations('dark')}}${selector}[data-pulse-theme="light"]{${declarations('light')}}@media(prefers-color-scheme:light){${selector}:not([data-pulse-theme]){${declarations('light')}}}`;
  }
  // Shadow selectors need the attribute inside :host(), unlike ordinary DOM.
  function shadowCss() {
    return `:host{${declarations('dark')}}:host([data-pulse-theme="light"]){${declarations('light')}}`;
  }
  function attach(target, { embedded = false } = {}) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const canvas = document.createElement('canvas'); canvas.width=canvas.height=1;
    const context = canvas.getContext('2d', { willReadFrequently:true });
    let stopped=false;
    function fromColor(color) {
      if (!color || !context || !CSS.supports('color',color)) return null;
      context.clearRect(0,0,1,1); context.fillStyle='transparent';context.fillStyle=color; context.fillRect(0,0,1,1);
      const [r,g,b,a]=context.getImageData(0,0,1,1).data;
      if (a<250) return null; // Transparent surfaces do not define a theme.
      return .2126*r+.7152*g+.0722*b>=145 ? 'light' : 'dark';
    }
    function explicit(element) {
      if (!element) return null;
      for (const key of ['data-theme','data-color-mode','data-theme-mode','data-vscode-theme-kind']) {
        const value=element.getAttribute(key)?.toLowerCase();
        if (/^(light|light-theme|vs|vscode-light|hc-light)$/.test(value)) return 'light';
        if (/^(dark|dark-theme|vs-dark|vscode-dark|hc-black|hc-dark)$/.test(value)) return 'dark';
      }
      const classes=element.classList;
      const light=['light','light-theme','theme-light','vscode-light','vs'].some(value=>classes.contains(value));
      const dark=['dark','dark-theme','theme-dark','vscode-dark','vs-dark','hc-black'].some(value=>classes.contains(value));
      return light===dark ? null : light ? 'light' : 'dark';
    }
    function resolve() {
      const root=document.documentElement;
      // App settings override the OS, including when the app uses a fixed theme.
      const declared=explicit(document.body)||explicit(root);
      if (declared) return declared;
      // The sidecar SDK pushes --background on theme-change messages.
      const sdk=fromColor(getComputedStyle(root).getPropertyValue('--background').trim());
      if (sdk) return sdk;
      if (embedded) {
        for (let element=target.parentElement;element;element=element.parentElement) {
          const theme=explicit(element)||fromColor(getComputedStyle(element).backgroundColor);
          if (theme) return theme;
        }
        const scheme=getComputedStyle(root).colorScheme;
        if (scheme==='light'||scheme==='dark') return scheme;
      }
      return media.matches ? 'dark' : 'light';
    }
    function update() {
      if (stopped) return;
      const theme=resolve();
      if (target.dataset.pulseTheme!==theme) target.dataset.pulseTheme=theme;
      return theme;
    }
    const observer=new MutationObserver(update);
    const attributes=['class','style','data-theme','data-color-mode','data-theme-mode','data-vscode-theme-kind'];
    const elements=new Set([document.documentElement,document.body]);
    if (embedded) for(let element=target.parentElement;element;element=element.parentElement) elements.add(element);
    for(const element of elements) if(element) observer.observe(element,{attributes:true,attributeFilter:attributes});
    if(document.head) observer.observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:['href','media','disabled']});
    media.addEventListener('change',update);
    // Catch stylesheet replacement and reparented composers without observing chat text.
    const timer=setInterval(update,1500);
    update();
    return { update, dispose() { stopped=true;observer.disconnect();media.removeEventListener('change',update);clearInterval(timer); } };
  }
  return { css, shadowCss, attach };
};
