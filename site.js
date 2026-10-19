    const lines=document.getElementById('terminal-lines');
    const prompt=document.getElementById('terminal-prompt');
    const modeTag=document.getElementById('active-mode');
    function setMode(mode){const deep=mode==='deep';modeTag.textContent=mode.toUpperCase();prompt.textContent=deep?'Create a polished analytics dashboard.':'Refactor this component for clarity.';lines.replaceChildren();const entries=deep?[['✓','Map out component architecture'],['✓','Build responsive layout'],['✓','Review styles and run checks'],['◇','Ready for your review']]:[['✓','Read the requested component'],['✓','Apply a focused edit'],['◇','Changes ready to inspect']];for(const [mark,label] of entries){const row=document.createElement('div');row.className='line';const sign=document.createElement('span');sign.textContent=mark;sign.className=mark==='✓'?'check':'dim';const copy=document.createElement('span');copy.textContent=label;if(mark!=='✓')copy.className='dim';row.append(sign,copy);lines.append(row)}for(const v of ['fast','deep']){const b=document.getElementById(v+'-btn');b.classList.toggle('on',v===mode);b.setAttribute('aria-pressed',String(v===mode))}}
    document.getElementById('fast-btn').addEventListener('click',()=>setMode('fast'));document.getElementById('deep-btn').addEventListener('click',()=>setMode('deep'));
    document.getElementById('copy-command').addEventListener('click',async e=>{const b=e.currentTarget;try{await navigator.clipboard.writeText('npm install -g .\npilotcode');b.textContent='Copied';setTimeout(()=>b.textContent='Copy',1800)}catch{b.textContent='Use the commands shown';setTimeout(()=>b.textContent='Copy',1800)}});
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if ('IntersectionObserver' in window && !reducedMotion) {
      const targets = document.querySelectorAll('.reveal');
      document.documentElement.classList.add('motion-ready');
      const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      }, { threshold: .08 });
      targets.forEach(target => observer.observe(target));
    } else {
      document.querySelectorAll('.reveal').forEach(target => target.classList.add('in'));
    }