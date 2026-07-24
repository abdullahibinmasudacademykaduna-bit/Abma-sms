/* =========================================================
   Greenwood SMS — shared UI helpers
   ========================================================= */

const UI = (function(){

  function el(html){
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function toast(message, type){
    const host = document.getElementById('toast-host');
    const t = el(`<div class="toast ${type==='error'?'error':''}">${ICONS.check(16)}<span>${message}</span></div>`);
    host.appendChild(t);
    setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),300); }, 2600);
  }

  function fmtMoney(n){
    const cur = window.__CURRENCY__ || 'GHS';
    return cur + ' ' + Number(n||0).toLocaleString(undefined,{minimumFractionDigits:0});
  }

  function fmtDate(iso){
    if(!iso) return '—';
    const d = new Date(iso);
    if(isNaN(d)) return iso;
    return d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
  }

  function initials(name){
    return (name||'?').split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
  }

  function badge(text, tone){
    return `<span class="badge badge-${tone||'gray'}">${text}</span>`;
  }

  function statusTone(status){
    const s = (status||'').toLowerCase();
    if(['active','paid','present','delivered','completed','open','confirmed'].includes(s)) return 'green';
    if(['pending','partial','late','scheduled','tentative'].includes(s)) return 'amber';
    if(['inactive','absent','overdue','closed','cancelled','failed'].includes(s)) return 'red';
    return 'gray';
  }

  // ---------------- Modal ----------------
  let modalStack = [];
  function openModal({title, bodyHTML, footHTML, large, onMount, onClose}){
    const overlay = el(`<div class="modal-overlay"></div>`);
    const modal = el(`
      <div class="modal ${large?'modal-lg':''}">
        <div class="modal-head"><h3>${title}</h3><button class="icon-action" data-close>${ICONS.close(16)}</button></div>
        <div class="modal-body">${bodyHTML}</div>
        ${footHTML? `<div class="modal-foot">${footHTML}</div>` : ''}
      </div>`);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.body.style.overflow='hidden';
    function close(){
      overlay.remove();
      document.body.style.overflow='';
      modalStack.pop();
      if(onClose) onClose();
    }
    overlay.addEventListener('click', e=>{ if(e.target===overlay) close(); });
    modal.querySelectorAll('[data-close]').forEach(btn=> btn.addEventListener('click', close));
    modal.querySelectorAll('[data-multiselect] .chip').forEach(chip=>{
      chip.addEventListener('click', ()=> chip.classList.toggle('active'));
    });
    modalStack.push(close);
    if(onMount) onMount(modal, close);
    return {modal, close};
  }

  function confirmDialog(message, onConfirm){
    openModal({
      title:'Please confirm',
      bodyHTML:`<p style="font-size:14px;color:var(--ink-soft);line-height:1.6;">${message}</p>`,
      footHTML:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-danger" data-ok>Confirm</button>`,
      onMount:(modal, close)=>{
        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-ok]').addEventListener('click', ()=>{ onConfirm(); close(); });
      }
    });
  }

  // ---------------- Form builder ----------------
  // fields: [{name,label,type,options,required,full,value,placeholder}]
  function renderForm(fields, values){
    values = values || {};
    return `<div class="form-grid">${fields.map(f=>{
      const val = values[f.name] ?? f.value ?? '';
      const req = f.required ? 'required' : '';
      const cls = f.full ? 'full' : '';
      let input;
      if(f.type==='select'){
        input = `<select name="${f.name}" ${req}>${(f.options||[]).map(o=>{
          const ov = typeof o==='object'?o.value:o;
          const ol = typeof o==='object'?o.label:o;
          return `<option value="${ov}" ${String(val)===String(ov)?'selected':''}>${ol}</option>`;
        }).join('')}</select>`;
      } else if(f.type==='multiselect'){
        const selected = Array.isArray(val) ? val.map(String) : [];
        input = `<div class="chip-list" data-multiselect="${f.name}">${(f.options||[]).map(o=>{
          const ov = typeof o==='object'?o.value:o;
          const ol = typeof o==='object'?o.label:o;
          return `<span class="chip ${selected.includes(String(ov))?'active':''}" data-value="${ov}">${ol}</span>`;
        }).join('')}</div>`;
      } else if(f.type==='textarea'){
        input = `<textarea name="${f.name}" rows="${f.rows||3}" placeholder="${f.placeholder||''}" ${req}>${val}</textarea>`;
      } else {
        input = `<input type="${f.type||'text'}" name="${f.name}" value="${val}" placeholder="${f.placeholder||''}" ${req} ${f.step?`step="${f.step}"`:''}/>`;
      }
      return `<div class="field ${cls}"><label>${f.label}</label>${input}</div>`;
    }).join('')}</div>`;
  }

  function readForm(modal, fields){
    const data = {};
    fields.forEach(f=>{
      if(f.type==='multiselect'){
        const host = modal.querySelector(`[data-multiselect="${f.name}"]`);
        data[f.name] = host ? Array.from(host.querySelectorAll('.chip.active')).map(c=>c.dataset.value) : [];
        return;
      }
      const node = modal.querySelector(`[name="${f.name}"]`);
      if(!node) return;
      data[f.name] = f.type==='number' ? Number(node.value) : node.value;
    });
    return data;
  }

  // ---------------- Table builder ----------------
  // opts: {columns:[{key,label,render}], rows, pageSize, searchKeys, filters:[{key,label,options}], onRowAction}
  function dataTable(container, opts){
    let page = 1;
    const pageSize = opts.pageSize || 8;
    let query = '';
    let activeFilters = {};

    function filteredRows(){
      let rows = opts.rows;
      if(query){
        const q = query.toLowerCase();
        rows = rows.filter(r => (opts.searchKeys||[]).some(k => String(r[k]||'').toLowerCase().includes(q)));
      }
      Object.entries(activeFilters).forEach(([k,v])=>{
        if(v) rows = rows.filter(r => String(r[k]) === String(v));
      });
      return rows;
    }

    function render(){
      const rows = filteredRows();
      const totalPages = Math.max(1, Math.ceil(rows.length/pageSize));
      page = Math.min(page, totalPages);
      const pageRows = rows.slice((page-1)*pageSize, page*pageSize);

      container.innerHTML = `
        <div class="table-toolbar">
          <div class="search-box" style="max-width:260px;">${ICONS.search(15)}<input type="text" placeholder="${opts.searchPlaceholder||'Search…'}" value="${query}" data-tbl-search/></div>
          ${(opts.filters||[]).map(f=>`
            <select data-tbl-filter="${f.key}" style="width:auto;">
              <option value="">${f.label}: All</option>
              ${f.options.map(o=>`<option value="${o}" ${activeFilters[f.key]===o?'selected':''}>${o}</option>`).join('')}
            </select>`).join('')}
          ${opts.toolbarExtra||''}
          <div style="margin-left:auto;font-size:12px;color:var(--ink-faint);">${rows.length} record${rows.length===1?'':'s'}</div>
        </div>
        <div class="scroll-x">
        <table>
          <thead><tr>${opts.columns.map(c=>`<th>${c.label}</th>`).join('')}${opts.actions?'<th></th>':''}</tr></thead>
          <tbody>
            ${pageRows.length ? pageRows.map(r=>`
              <tr data-id="${r.id}">
                ${opts.columns.map(c=> `<td>${c.render ? c.render(r) : (r[c.key] ?? '—')}</td>`).join('')}
                ${opts.actions ? `<td><div class="row-actions">${opts.actions(r)}</div></td>` : ''}
              </tr>`).join('') : `<tr><td colspan="${opts.columns.length + (opts.actions?1:0)}"><div class="empty-state"><h3>No records found</h3><p>Try adjusting your search or filters.</p></div></td></tr>`}
          </tbody>
        </table>
        </div>
        <div class="pagination">
          <span>Page ${page} of ${totalPages}</span>
          <div class="btns">
            <button class="icon-action" data-prev ${page<=1?'disabled':''}>${ICONS.chevronLeft(15)}</button>
            <button class="icon-action" data-next ${page>=totalPages?'disabled':''}>${ICONS.chevronRight(15)}</button>
          </div>
        </div>
      `;

      container.querySelector('[data-tbl-search]').addEventListener('input', e=>{ query=e.target.value; page=1; render(); });
      container.querySelectorAll('[data-tbl-filter]').forEach(sel=>{
        sel.addEventListener('change', e=>{ activeFilters[sel.dataset.tblFilter] = e.target.value; page=1; render(); });
      });
      const prev = container.querySelector('[data-prev]');
      const next = container.querySelector('[data-next]');
      if(prev) prev.addEventListener('click', ()=>{ if(page>1){page--; render();} });
      if(next) next.addEventListener('click', ()=>{ if(page<totalPages){page++; render();} });
      if(opts.onRender) opts.onRender(container);
    }
    render();
    return { refresh:(rows)=>{ if(rows) opts.rows=rows; render(); } };
  }

  function pageHeader(crumb, title, actionsHTML){
    return `<div class="page-head">
      <div><div class="crumb">${crumb}</div><h2>${title}</h2></div>
      <div class="page-actions">${actionsHTML||''}</div>
    </div>`;
  }

  function emptyState(title, sub){
    return `<div class="empty-state"><h3>${title}</h3><p>${sub||''}</p></div>`;
  }

  return { el, toast, fmtMoney, fmtDate, initials, badge, statusTone, openModal, confirmDialog, renderForm, readForm, dataTable, pageHeader, emptyState };
})();
