// Lane Y5 — measures the size of /embed.js by invoking the route's
// buildScript() helper directly. Run with `node scripts/measure-embed-size.mjs`.
//
// We can't easily import the TS route module from Node without a build,
// so we re-create the same script-builder logic here. Keep this in
// sync with apps/restaurant-web/src/app/embed.js/route.ts.
//
// Output: byte counts (raw + gzipped) and a 10 KB budget assertion.

import { gzipSync } from 'node:zlib';

function buildScript(origin) {
  return (
    "(function(){'use strict';" +
    "var ORIGIN='" + origin + "';" +
    "var s=document.currentScript;" +
    'if(!s)return;' +
    "var TENANT=(s.getAttribute('data-tenant')||'').trim().toLowerCase();" +
    'if(!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(TENANT))return;' +
    "var COLOR=s.getAttribute('data-color')||'';" +
    'if(!/^#[0-9a-fA-F]{6}$/.test(COLOR))COLOR="#FF6B35";' +
    "var POS=(s.getAttribute('data-position')||'bottom-right').toLowerCase();" +
    "if(['bottom-right','bottom-left','top-right','top-left'].indexOf(POS)<0)POS='bottom-right';" +
    "var LABEL=s.getAttribute('data-label')||'Comand\\u0103 online';" +
    'LABEL=String(LABEL).slice(0,40);' +
    'function ready(fn){' +
    "if(document.readyState!=='loading')fn();" +
    "else document.addEventListener('DOMContentLoaded',fn);" +
    '}' +
    'ready(function(){' +
    'try{mount();}catch(e){if(window.console)console.warn("[HIR embed]",e);}' +
    '});' +
    'function mount(){' +
    "var btn=document.createElement('button');" +
    "btn.type='button';" +
    "btn.setAttribute('aria-label',LABEL);" +
    'btn.textContent=LABEL;' +
    "var pos={'bottom-right':'bottom:24px;right:24px;','bottom-left':'bottom:24px;left:24px;','top-right':'top:24px;right:24px;','top-left':'top:24px;left:24px;'}[POS];" +
    "btn.setAttribute('style','position:fixed;'+pos+'z-index:2147483646;background:'+COLOR+';color:#fff;border:0;border-radius:9999px;padding:14px 22px;font:600 15px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18);cursor:pointer;letter-spacing:.01em;');" +
    "btn.addEventListener('mouseenter',function(){btn.style.transform='translateY(-1px)';btn.style.boxShadow='0 10px 28px rgba(0,0,0,.22)';});" +
    "btn.addEventListener('mouseleave',function(){btn.style.transform='';btn.style.boxShadow='0 8px 24px rgba(0,0,0,.18)';});" +
    "btn.addEventListener('click',openModal);" +
    'document.body.appendChild(btn);' +
    "window.addEventListener('message',onMessage,false);" +
    '}' +
    'var overlay=null,iframe=null,closeBtn=null;' +
    'function openModal(){' +
    'if(overlay)return;' +
    "overlay=document.createElement('div');" +
    "overlay.setAttribute('role','dialog');" +
    "overlay.setAttribute('aria-modal','true');" +
    "overlay.setAttribute('aria-label',LABEL);" +
    "overlay.setAttribute('style','position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:0;animation:hir-fade .18s ease-out;');" +
    "var style=document.createElement('style');" +
    "style.textContent='@keyframes hir-fade{from{opacity:0}to{opacity:1}}';" +
    'overlay.appendChild(style);' +
    "var frame=document.createElement('div');" +
    "frame.setAttribute('style','position:relative;width:100%;height:100%;max-width:480px;max-height:100%;background:#fff;box-shadow:0 24px 48px rgba(0,0,0,.32);overflow:hidden;');" +
    '@media-shim;' +
    "iframe=document.createElement('iframe');" +
    "iframe.setAttribute('title',LABEL);" +
    "iframe.setAttribute('src',ORIGIN+'/?tenant='+encodeURIComponent(TENANT)+'&embed=1');" +
    "iframe.setAttribute('allow','payment; clipboard-write');" +
    "iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups allow-storage-access-by-user-activation');" +
    "iframe.setAttribute('style','width:100%;height:100%;border:0;display:block;');" +
    'frame.appendChild(iframe);' +
    "closeBtn=document.createElement('button');" +
    "closeBtn.type='button';" +
    "closeBtn.setAttribute('aria-label','\\u00CEnchide');" +
    "closeBtn.innerHTML='&times;';" +
    "closeBtn.setAttribute('style','position:absolute;top:8px;right:8px;width:36px;height:36px;border:0;border-radius:9999px;background:rgba(255,255,255,.92);color:#111;font:600 22px/1 sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18);z-index:1;');" +
    "closeBtn.addEventListener('click',closeModal);" +
    'frame.appendChild(closeBtn);' +
    'overlay.appendChild(frame);' +
    "overlay.addEventListener('click',function(ev){if(ev.target===overlay)closeModal();});" +
    "document.addEventListener('keydown',onKey);" +
    'document.body.appendChild(overlay);' +
    "document.body.style.overflow='hidden';" +
    '}' +
    'function closeModal(){' +
    'if(!overlay)return;' +
    "document.removeEventListener('keydown',onKey);" +
    'overlay.parentNode&&overlay.parentNode.removeChild(overlay);' +
    'overlay=null;iframe=null;closeBtn=null;' +
    "document.body.style.overflow='';" +
    '}' +
    "function onKey(ev){if(ev.key==='Escape')closeModal();}" +
    'function onMessage(ev){' +
    'if(ev.origin!==ORIGIN)return;' +
    'var d=ev.data;' +
    "if(!d||typeof d!=='object')return;" +
    "if(d.type==='hir:order_placed'){" +
    'try{' +
    "document.dispatchEvent(new CustomEvent('hir:order_placed',{detail:{orderId:d.orderId||null,total:d.total||null,ts:d.ts||Date.now()}}));" +
    '}catch(e){}' +
    '}' +
    "if(d.type==='hir:close'){closeModal();}" +
    '}' +
    '})();'
  ).replace(
    '@media-shim;',
    "if(window.matchMedia&&window.matchMedia('(min-width:640px)').matches){" +
      "frame.style.width='480px';frame.style.height='86vh';frame.style.maxHeight='760px';frame.style.borderRadius='16px';" +
      '}',
  );
}

const body = buildScript('https://hir.ro');
const raw = Buffer.byteLength(body, 'utf8');
const gz = gzipSync(body).length;

const BUDGET = 10 * 1024;
console.log(`embed.js raw   : ${raw.toLocaleString()} B  (${(raw / 1024).toFixed(2)} KB)`);
console.log(`embed.js gzip  : ${gz.toLocaleString()} B  (${(gz / 1024).toFixed(2)} KB)`);
console.log(`budget         : ${BUDGET.toLocaleString()} B  (${(BUDGET / 1024).toFixed(0)} KB raw)`);
console.log(`status         : ${raw <= BUDGET ? 'OK ✓' : 'OVER BUDGET ✗'}`);
process.exit(raw <= BUDGET ? 0 : 1);
