/* ZEVRA · ayuda de instalación (Android: botón nativo · iPhone: instrucciones de Safari) */
(function () {
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone || window.top !== window.self) return;
  var KEY = 'zevra-install-dismissed';
  try { if (Date.now() - Number(localStorage.getItem(KEY) || 0) < 3 * 864e5) return; } catch (e) {}

  var ua = navigator.userAgent;
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/.test(ua);
  var isIOSSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|Instagram|FBAN|FBAV/.test(ua);
  var deferred = null;

  var css = '#zv-inst{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:2147483000;max-width:420px;margin:0 auto;' +
    'background:#18181B;color:#F6F0EB;border:1px solid rgba(246,240,235,.12);border-radius:18px;padding:14px;display:flex;gap:12px;align-items:center;' +
    'font:500 14px/1.35 Manrope,system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.55);animation:zvUp .35s cubic-bezier(.22,1,.36,1)}' +
    '@keyframes zvUp{from{transform:translateY(120%);opacity:0}}@media (prefers-reduced-motion:reduce){#zv-inst{animation:none}}' +
    '#zv-inst img{width:44px;height:44px;border-radius:11px;flex:none}#zv-inst b{display:block;font-weight:800;font-size:15px}' +
    '#zv-inst .t{flex:1;min-width:0}#zv-inst .s{color:#909095;font-size:12.5px;margin-top:2px}' +
    '#zv-inst button{font:800 14px Manrope,system-ui,sans-serif;border:0;cursor:pointer;border-radius:12px}' +
    '#zv-inst .go{background:#FF3B6B;color:#0E0E10;min-height:40px;padding:0 14px;white-space:nowrap}' +
    '#zv-inst .x{background:none;color:#909095;width:36px;height:36px;font-size:20px;line-height:1;flex:none}' +
    '#zv-inst svg{display:inline-block;width:16px;height:16px;vertical-align:-3px;stroke:#FF86A4;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}';

  var shareIc = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';

  function show(mode) {
    if (document.getElementById('zv-inst')) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var el = document.createElement('div'); el.id = 'zv-inst'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Instalar ZEVRA');
    var body;
    if (mode === 'prompt') body = '<div class="t"><b>Instala ZEVRA</b><div class="s">Ábrela como una app, a pantalla completa.</div></div><button class="go" type="button">Instalar</button>';
    else if (mode === 'ios') body = '<div class="t"><b>Instala ZEVRA en tu iPhone</b><div class="s">Pulsa ' + shareIc + ' <b style="display:inline;font-size:12.5px;color:#F6F0EB">Compartir</b> y luego «Añadir a pantalla de inicio».</div></div>';
    else if (mode === 'ios-other') body = '<div class="t"><b>Instala ZEVRA en tu iPhone</b><div class="s">Abre este enlace en <b style="display:inline;font-size:12.5px;color:#F6F0EB">Safari</b> para añadirla a la pantalla de inicio.</div></div>';
    else body = '<div class="t"><b>Instala ZEVRA</b><div class="s">Menú ⋮ del navegador › «Instalar app» o «Añadir a pantalla de inicio».</div></div>';
    el.innerHTML = '<img src="/icons/icon-192.png" alt="">' + body + '<button class="x" type="button" aria-label="Cerrar">×</button>';
    document.body.appendChild(el);
    el.querySelector('.x').onclick = function () { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} el.remove(); };
    var go = el.querySelector('.go');
    if (go) go.onclick = function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(function () { deferred = null; el.remove(); });
    };
  }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; setTimeout(function () { show('prompt'); }, 2500); });
  window.addEventListener('appinstalled', function () { var el = document.getElementById('zv-inst'); if (el) el.remove(); });
  window.zevraInstall = function () { if (deferred) { deferred.prompt(); } else { show(isIOS ? (isIOSSafari ? 'ios' : 'ios-other') : 'manual'); } };

  setTimeout(function () {
    if (deferred) return;
    if (isIOS) show(isIOSSafari ? 'ios' : 'ios-other');
    else if (isAndroid) show('manual');
  }, 6000);
})();
