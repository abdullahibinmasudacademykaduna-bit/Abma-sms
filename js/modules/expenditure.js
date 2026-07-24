/* Greenwood SMS — Expenditure tracking
   Traces money spent on items/services bought for the school:
   what was bought, how much it cost, who it was bought from,
   and who logged the purchase. Total cost is quantity × unit
   cost, computed automatically so it can't drift out of sync. */
window.MODULES = window.MODULES || {};

const EXPENDITURE_CATEGORIES = ['Stationery','Electronics','Learning Materials','Furniture','Maintenance & Repairs','Utilities','Transport','Health','Other'];

MODULES.expenditure = function(container, ctx){
  const canEdit = ['Super Admin','Principal','Accountant'].includes(ctx.user.role);

  function totals(){
    const rows = DB.all('expenditures');
    const total = rows.reduce((s,r)=>s+(r.amount||0),0);
    const thisMonth = rows.filter(r=>{
      const d = new Date(r.purchaseDate);
      const now = new Date();
      return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    }).reduce((s,r)=>s+(r.amount||0),0);
    const topCategory = Object.entries(rows.reduce((acc,r)=>{ acc[r.category]=(acc[r.category]||0)+(r.amount||0); return acc; },{}))
      .sort((a,b)=>b[1]-a[1])[0];
    return {total, count: rows.length, thisMonth, topCategory: topCategory ? topCategory[0] : '—'};
  }

  function fields(){
    return [
      {name:'item', label:'Item / service', required:true, full:true},
      {name:'category', label:'Category', type:'select', options:EXPENDITURE_CATEGORIES},
      {name:'quantity', label:'Quantity', type:'number'},
      {name:'unitCost', label:'Unit cost', type:'number'},
      {name:'vendor', label:'Vendor / supplier'},
      {name:'purchaseDate', label:'Purchase date', type:'date'},
      {name:'purchasedBy', label:'Purchased by'},
      {name:'notes', label:'Notes', type:'textarea', full:true},
    ];
  }

  function openForm(record){
    const f = fields();
    const defaults = record || {quantity:1, unitCost:0, purchaseDate:new Date().toISOString().slice(0,10), purchasedBy:ctx.user.name, category:EXPENDITURE_CATEGORIES[0]};
    UI.openModal({
      title: record ? 'Edit expenditure' : 'Log an expenditure',
      large:true,
      bodyHTML: UI.renderForm(f, defaults),
      footHTML: `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${record?'Save changes':'Log expenditure'}</button>`,
      onMount:(modal, close)=>{
        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-save]').addEventListener('click', ()=>{
          const data = UI.readForm(modal, f);
          if(!data.item){ UI.toast('Item / service is required', 'error'); return; }
          data.quantity = Number(data.quantity) || 1;
          data.unitCost = Number(data.unitCost) || 0;
          data.amount = data.quantity * data.unitCost;
          if(record) DB.update('expenditures', record.id, data);
          else DB.add('expenditures', data);
          UI.toast(record ? 'Expenditure updated' : 'Expenditure logged');
          close(); renderAll();
        });
      }
    });
  }

  function renderAll(){
    const t = totals();
    container.innerHTML = `
      ${UI.pageHeader('Finance', 'Expenditure Tracking', canEdit ? `
        <button class="btn btn-outline" id="export-exp">${ICONS.download(15)} Export</button>
        <button class="btn btn-primary" id="add-exp">${ICONS.plus(16)} Log Expenditure</button>
      ` : '')}
      <div class="grid grid-4" style="margin-bottom:20px;">
        <div class="card stat-card"><div class="top"><div class="ic-wrap" style="background:#FCEED8;color:#8A5A17;">${ICONS.money(20)}</div></div><div class="label">Total Spent</div><div class="value">${UI.fmtMoney(t.total)}</div></div>
        <div class="card stat-card"><div class="top"><div class="ic-wrap">${ICONS.trend(20)}</div></div><div class="label">This Month</div><div class="value">${UI.fmtMoney(t.thisMonth)}</div></div>
        <div class="card stat-card"><div class="top"><div class="ic-wrap">${ICONS.inventory(20)}</div></div><div class="label">Records logged</div><div class="value">${t.count}</div></div>
        <div class="card stat-card"><div class="top"><div class="ic-wrap">${ICONS.reports(20)}</div></div><div class="label">Top category</div><div class="value" style="font-size:16px;">${t.topCategory}</div></div>
      </div>
      <div class="card" style="margin-bottom:20px;">
        <div class="section-title">Spending by category</div>
        <div style="height:220px;"><canvas id="exp-bar"></canvas></div>
      </div>
      <div class="table-wrap" id="exp-tbl"></div>
    `;

    const byCategory = {};
    EXPENDITURE_CATEGORIES.forEach(c=> byCategory[c]=0);
    DB.all('expenditures').forEach(r=> byCategory[r.category] = (byCategory[r.category]||0) + (r.amount||0));
    CHARTS.bar('exp-bar', {
      labels: Object.keys(byCategory),
      datasets:[{label:'Spent', data: Object.values(byCategory), color:'#C1443D'}]
    });

    container.querySelector('#add-exp')?.addEventListener('click', ()=>openForm(null));
    container.querySelector('#export-exp')?.addEventListener('click', ()=>{
      const rows = DB.all('expenditures').map(r=>({
        item:r.item, category:r.category, quantity:r.quantity, unitCost:r.unitCost, amount:r.amount,
        vendor:r.vendor, purchaseDate:r.purchaseDate, purchasedBy:r.purchasedBy, notes:r.notes
      }));
      if(!rows.length) return;
      const headers = Object.keys(rows[0]);
      const csv = [headers.join(',')].concat(rows.map(r=>headers.map(h=>`"${String(r[h]??'').replace(/"/g,'""')}"`).join(','))).join('\n');
      const blob = new Blob([csv], {type:'text/csv'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'expenditure-report.csv'; a.click();
      UI.toast('Expenditure report exported');
    });

    renderTable();
  }

  function renderTable(){
    UI.dataTable(container.querySelector('#exp-tbl'), {
      rows: DB.all('expenditures'),
      searchKeys:['item','vendor','purchasedBy'],
      searchPlaceholder:'Search expenditures…',
      filters:[{key:'category', label:'Category', options:EXPENDITURE_CATEGORIES}],
      columns:[
        {label:'Item / service', render:r=>`<div class="row-name">${r.item}</div><div class="row-sub">${r.vendor||'—'}</div>`},
        {label:'Category', render:r=>UI.badge(r.category,'blue')},
        {label:'Qty × Unit cost', render:r=>`${r.quantity} × ${UI.fmtMoney(r.unitCost)}`},
        {label:'Total cost', render:r=>`<b>${UI.fmtMoney(r.amount)}</b>`},
        {label:'Purchased by', key:'purchasedBy'},
        {label:'Date', render:r=>UI.fmtDate(r.purchaseDate)},
      ],
      actions: r => canEdit ? `<button class="icon-action" data-edit="${r.id}">${ICONS.edit(14)}</button><button class="icon-action" data-del="${r.id}">${ICONS.trash(14)}</button>` : '',
      onRender:(el)=>{
        el.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', ()=>openForm(DB.get('expenditures', b.dataset.edit))));
        el.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click', ()=>{
          UI.confirmDialog('Remove this expenditure record?', ()=>{ DB.remove('expenditures', b.dataset.del); UI.toast('Expenditure removed'); renderAll(); });
        }));
      }
    });
  }

  renderAll();
};
