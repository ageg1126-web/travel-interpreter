// The travel tools screen shows one tool at a time, picked from the row on top.
(() => {
  const buttons = document.querySelectorAll('#toolNav [data-tool]');
  const panes = document.querySelectorAll('#tab-tools main > [data-tool]');
  function show(name) {
    buttons.forEach(b => b.classList.toggle('on', b.dataset.tool === name));
    panes.forEach(p => { p.hidden = p.dataset.tool !== name; });
    try { localStorage.setItem('tools.tab', name); } catch {}
    document.dispatchEvent(new CustomEvent('toolchange', { detail: name }));
  }
  buttons.forEach(b => { b.onclick = () => show(b.dataset.tool); });
  let first = 'fx';
  try { const t = localStorage.getItem('tools.tab'); if (t && [...buttons].some(b => b.dataset.tool === t)) first = t; } catch {}
  show(first);
})();
