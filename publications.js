(function(){
  function $(id){ return document.getElementById(id); }
  function normalizeSpaces(s){ return String(s || '').replace(/\s+/g,' ').trim(); }

  // Minimal BibTeX parser: keeps entry order as in the file.
  function parseBibTeX(text){
    const entries = [];
    const chunks = text.split(/@(?=[a-zA-Z]+\s*\{)/g).filter(Boolean);

    for(const raw of chunks){
      const head = raw.match(/^([a-zA-Z]+)\s*\{\s*([^,]+)\s*,/);
      if(!head) continue;

      const type = head[1].toLowerCase();
      const citekey = normalizeSpaces(head[2]);

      let body = raw.slice(head[0].length);
      body = body.replace(/\}\s*$/,'').trim();

      const fields = {};
      const fieldRe = /(\w+)\s*=\s*(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|[^,\n]+)\s*,?/g;
      let m;
      while((m = fieldRe.exec(body))){
        const k = m[1].toLowerCase();
        let v = m[2].trim();

        if(v.startsWith('{') && v.endsWith('}')) v = v.slice(1,-1);
        if(v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1);

        v = v.replace(/\\&/g,'&').replace(/\s+/g,' ').trim();
        fields[k] = v;
      }

      const yearNum = fields.year ? parseInt(fields.year, 10) : NaN;

      entries.push({
        type, citekey,
        year: Number.isFinite(yearNum) ? yearNum : null,
        author: normalizeSpaces(fields.author || ''),
        title: normalizeSpaces(fields.title || ''),
        journal: normalizeSpaces(fields.journal || ''),
        booktitle: normalizeSpaces(fields.booktitle || ''),
        volume: normalizeSpaces(fields.volume || ''),
        pages: normalizeSpaces(fields.pages || ''),
        doi: normalizeSpaces(fields.doi || ''),
        url: normalizeSpaces(fields.url || ''),
      });
    }

    // De-duplicate by citekey (keep the FIRST occurrence, preserving BibTeX order)
    const seen = new Set();
    const out = [];
    for(const e of entries){
      if(!(e.title || e.author)) continue;
      if(seen.has(e.citekey)) continue;
      seen.add(e.citekey);
      out.push(e);
    }
    // Preserve order index for stable rendering inside years
    out.forEach((e, idx) => { e.__idx = idx; });
    return out;
  }

  // Extract number from citekey like Durajski-12-2019 => 12
  function numberFromCitekey(citekey){
    const m = String(citekey || '').match(/-(\d+)(?:-|$)/);
    if(!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  function buildDisplay(entry){
    const parts = [];
    if(entry.author) parts.push(entry.author);
    if(entry.title) parts.push(entry.title);
    const venue = entry.journal || entry.booktitle;
    const metaBits = [];
    if(venue) metaBits.push(venue);
    if(entry.volume) metaBits.push(entry.volume);
    if(entry.pages) metaBits.push(entry.pages);
    if(entry.year) metaBits.push(String(entry.year));
    return { main: parts.join('. '), meta: metaBits.join(', ') };
  }

  function render(entries, opts){
    const root = $('pubRoot');
    const q = (opts.query || '').toLowerCase();

    // Global numbering:
    // - Prefer explicit numbers from citekeys (Durajski-1-2012 => 1, Durajski-2-2012 => 2, ...)
    // - If some citekeys don't contain a number, append them after the max explicit number
    const numberByKey = new Map();
    let maxExplicit = 0;

    for(const e of entries){
      const n = numberFromCitekey(e.citekey);
      if(n != null){
        numberByKey.set(e.citekey, n);
        if(n > maxExplicit) maxExplicit = n;
      }
    }
    let next = maxExplicit + 1;
    for(const e of entries){
      if(!numberByKey.has(e.citekey)){
        numberByKey.set(e.citekey, next++);
      }
    }

    // Filter by search (KEEP BibTeX order)
    const filtered = entries.filter(e => {
      if(!q) return true;
      const hay = `${e.citekey} ${e.author} ${e.title} ${e.journal} ${e.booktitle} ${e.year ?? ''}`.toLowerCase();
      return hay.includes(q);
    });

    // Group by year (KEEP BibTeX order within each group)
    const groups = new Map();
    for(const e of filtered){
      const y = e.year == null ? 'Unknown year' : String(e.year);
      if(!groups.has(y)) groups.set(y, []);
      groups.get(y).push(e);
    }

    // Order year groups based on chosen sort (newest/oldest)
    const yearKeys = Array.from(groups.keys()).sort((a,b) => {
      if(a === 'Unknown year') return 1;
      if(b === 'Unknown year') return -1;
      const ai = parseInt(a,10), bi = parseInt(b,10);
      return (opts.sort === 'oldest') ? (ai - bi) : (bi - ai);
    });

    root.innerHTML = '';
    if(yearKeys.length === 0){
      root.innerHTML = '<div class="smallnote">No results.</div>';
      return;
    }

    const openFirst = yearKeys[0];

    for(const y of yearKeys){
      const det = document.createElement('details');
      det.className = 'year';
      det.open = true;

      const sum = document.createElement('summary');
      const left = document.createElement('span');
      left.textContent = y;
      const right = document.createElement('span');
      right.className = 'year-count';
      right.textContent = `${groups.get(y).length}`;
      sum.appendChild(left);
      sum.appendChild(right);
      det.appendChild(sum);

      const ol = document.createElement('ol');
      ol.className = 'pub-list';

      // IMPORTANT: within a year, display entries so that numbering increases from bottom (i.e., sort by global number descending).
      const yearEntries = groups.get(y).slice().sort((a,b) => (numberByKey.get(b.citekey)||0) - (numberByKey.get(a.citekey)||0));

      for(const e of yearEntries){
        const li = document.createElement('li');
        li.className = 'pub-item';

        const no = document.createElement('span');
        no.className = 'pub-no';
        no.textContent = `${numberByKey.get(e.citekey) ?? ''}.`;

        const disp = buildDisplay(e);

        const span = document.createElement('span');
        span.className = 'pub-meta';
        span.textContent = disp.main + (disp.meta ? ` — ${disp.meta}` : '');

        const links = document.createElement('span');
        links.className = 'pub-links';

        const url = e.url || '';
        const doi = e.doi || '';
        if(url){
          const a = document.createElement('a');
          a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.textContent = 'Link';
          links.appendChild(a);
        }
        if(doi){
          const a = document.createElement('a');
          const href = doi.startsWith('http') ? doi : `https://doi.org/${doi}`;
          a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.textContent = 'DOI';
          links.appendChild(a);
        }

        li.appendChild(no);
        li.appendChild(span);
        if(links.childNodes.length) li.appendChild(links);
        ol.appendChild(li);
      }

      det.appendChild(ol);
      root.appendChild(det);
    }
  }

  function init(){
    const input = $('q');
    const sort = $('sort');

    fetch('BibTeX.txt')
      .then(r => r.text())
      .then(text => {
        const entries = parseBibTeX(text);
        const state = { query: '', sort: 'newest' };

        function rerender(){ render(entries, state); }
        rerender();

        if(input) input.addEventListener('input', () => { state.query = input.value.trim(); rerender(); });
        if(sort) sort.addEventListener('change', () => { state.sort = sort.value; rerender(); });
      })
      .catch(() => {
        const root = $('pubRoot');
        if(root) root.innerHTML = '<div class="smallnote">Could not load BibTeX.txt</div>';
      });
  }

  if(document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();