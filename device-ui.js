/* AxiomPilotCode | explicit browser approval for native CLI device authorization */
(() => {
  'use strict';
  const input = document.getElementById('device-user-code');
  const button = document.getElementById('approve-device');
  const note = document.getElementById('device-status');
  if (!input || !button || !note) return;
  const key = 'axiom-account-session-v1';
  const origin = String(window.AXIOM_ACCOUNT_API?.baseURL ?? '').replace(/\/$/, '');
  const supplied = new URLSearchParams(location.search).get('device');
  if (supplied && /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/i.test(supplied)) {
    input.value = supplied.toUpperCase();
    document.getElementById('open-account')?.click();
  }
  function show(text, ok = false) { note.textContent = text;note.style.color = ok ? '#356d5c' : '#9b5350'; }
  button.addEventListener('click', async () => {
    const userCode = input.value.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(userCode)) return show('Enter the 8-character code displayed by your CLI.');
    if (!/^https:\/\//.test(origin)) return show('Account server is not connected yet.');
    const bearer = sessionStorage.getItem(key);
    if (!bearer) return show('Please sign in before connecting your terminal.');
    button.disabled = true;
    show('');
    try {
      const response = await fetch(`${origin}/api/device?action=approve`, {
        method: 'POST',mode: 'cors',credentials: 'omit',
        headers: {'Content-Type':'application/json','Authorization':`Bearer ${bearer}`},
        body: JSON.stringify({userCode}),cache:'no-store'
      });
      const body = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(body.error || 'Code could not be approved.');
      show('Approved. Return to your terminal to finish signing in.', true);
      input.value = '';
      if (new URLSearchParams(location.search).has('device')) history.replaceState({},'',location.pathname+location.hash);
    } catch (error) { show(error.message || 'Could not connect the CLI.'); }
    finally { button.disabled = false; }
  });
})();
