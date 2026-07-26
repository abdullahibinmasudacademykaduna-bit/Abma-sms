/* Greenwood SMS — Fees & Finance management
   Each fee record carries an itemised breakdown (School Fee,
   Uniform, Textbooks, etc.) that sums to the total billed —
   collection/payment is still tracked as one running balance
   against that total, which matches how parents actually pay.

   The breakdown items themselves come from a school-editable
   catalog (Billing Items tab) — set a name and a price once,
   then use it to bill any student. Collecting payment stays a
   separate step (the "Collect" button), same as before. */
window.MODULES = window.MODULES || {};

const FEE_CATEGORIES = ['Tuition','Feeding','Transport Levy','PTA Dues','Books & Materials','Uniform'];

MODULES.fees = function(container, ctx){
  const canEdit = ['Super Admin','Principal','Accountant'].includes(ctx.user.role);
  const students = DB.all('students');
  const studentMap = Object.fromEntries(students.map(s=>[s.id, s]));

  container.innerHTML = `
    ${UI.pageHeader('Finance', 'Fees & Finance Management')}
    <div class="tabs">
      <div class="tab active" data-tab="collection">Fee Collection</div>
      <div class="tab" data-tab="items">Billing Items</div>
    </div>
    <div id="tab-body"></div>
  `;
  const body = container.querySelector('#tab-body');
  container.querySelectorAll('.tab').forEach(t=>{
    t.addEventListener('click', ()=>{
      container.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
      (t.dataset.tab==='items' ? renderBillingItems : renderCollection)();
    });
  });

  /* ---------------- Fee Collection tab ---------------- */
  function totals(){
    const fees = DB.all('fees');
    const total = fees.reduce((s,f)=>s+f.amount,0);
    const collected = fees.reduce((s,f)=>s+f.paid,0);
    return {total, collected, pending: total-collected, count: fees.length, owing: fees.filter(f=>f.status!=='Paid').length};
  }

  function renderCollection(){
    const t = totals();
    body.innerHTML = `
      <div class="grid grid-4" style="margin-bottom:20px;">
        <div class="card stat-card"><div class="top"><div class="ic-wrap">${ICONS.fees(20)}</div></div><div class="label">Total Billed</div><div class="value">${UI.fmtMoney(t.total)}</div></div>
        <div class="card stat-card"><div class="top"><div class="ic-wrap">${ICONS.trend(20)}</div></div><div class="label">Collected</div><div class="value">${UI.fmtMoney(t.collected)}</div><div class="delta up">${t.total?Math.round(t.collected/t.total*100):0}%</div></div>
        <div class="card stat-card"><div class="top"><div class="ic-wrap" style="background:#FCEED8;color:#8A5A17;">${ICONS.money(20)}</div></div><div class="label">Pending</div><div class="value">${UI.fmtMoney(t.pending)}</div></div>
        <div class="card stat-card"><div class="top"><div class="ic-wrap" style="background:#FBE4E2;color:#8F2A25;">${ICONS.students(20)}</div></div><div class="label">Students owing</div><div class="value">${t.owing}</div></div>
      </div>
      <div class="grid grid-3" style="margin-bottom:20px;">
        <div class="card" style="grid-column:span 2;">
          <div class="section-title">Collection by category</div>
          <div style="height:220px;"><canvas id="fee-bar"></canvas></div>
        </div>
        <div class="card">
          <div class="section-title">Status breakdown</div>
          <div style="height:220px;"><canvas id="fee-doughnut"></canvas></div>
        </div>
      </div>
      <div class="page-actions" style="margin-bottom:12px;justify-content:flex-end;display:flex;gap:8px;">
        ${canEdit ? `<button class="btn btn-outline" id="export-fees">${ICONS.download(15)} Export</button>` : ''}
        ${canEdit ? `<button class="btn btn-primary" id="bill-student">${ICONS.plus(16)} Bill a Student</button>` : ''}
      </div>
      <div class="table-wrap" id="fee-tbl"></div>
    `;

    const byCategory = {};
    const catalogNames = DB.all('feeItems').map(i=>i.name);
    (catalogNames.length ? catalogNames : FEE_CATEGORIES).forEach(cat=> byCategory[cat] = 0);
    DB.all('fees').forEach(f=> (f.items||[]).forEach(it=> byCategory[it.category] = (byCategory[it.category]||0) + it.amount));
    CHARTS.bar('fee-bar', {
      labels: Object.keys(byCategory),
      datasets:[{label:'Billed', data: Object.values(byCategory), color:'#2D6A4F'}]
    });
    const statusCounts = {Paid:0, Partial:0, Pending:0};
    DB.all('fees').forEach(f=> statusCounts[f.status] = (statusCounts[f.status]||0)+1);
    CHARTS.doughnut('fee-doughnut', {labels:Object.keys(statusCounts), data:Object.values(statusCounts), colors:['#2D6A4F','#DE9B3A','#C1443D']});

    body.querySelector('#export-fees')?.addEventListener('click', ()=>{
      const rows = DB.all('fees').map(f=>({
        student: studentMap[f.studentId]?.name, class: studentMap[f.studentId]?.class,
        term:f.term, amount:f.amount, paid:f.paid, balance:f.balance, status:f.status,
        breakdown: (f.items||[]).map(it=>`${it.category}: ${it.amount}`).join(' | ')
      }));
      downloadCSV(rows, 'fees-report.csv');
      UI.toast('Fees report exported');
    });
    body.querySelector('#bill-student')?.addEventListener('click', openBillStudent);

    renderTable();
  }

  function downloadCSV(rows, filename){
    if(!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(',')].concat(rows.map(r=>headers.map(h=>`"${String(r[h]??'').replace(/"/g,'""')}"`).join(','))).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  }

  function renderTable(){
    const rows = DB.all('fees').map(f=>({...f, studentName: studentMap[f.studentId]?.name || 'Unknown', class: studentMap[f.studentId]?.class}));
    UI.dataTable(body.querySelector('#fee-tbl'), {
      rows,
      searchKeys:['studentName'],
      searchPlaceholder:'Search by student…',
      filters:[{key:'status', label:'Status', options:['Paid','Partial','Pending']}, {key:'class', label:'Class', options:getClassNames()}],
      columns:[
        {label:'Student', key:'studentName'},
        {label:'Class', key:'class'},
        {label:'Billed', render:r=>UI.fmtMoney(r.amount)},
        {label:'Paid', render:r=>UI.fmtMoney(r.paid)},
        {label:'Balance', render:r=>UI.fmtMoney(r.balance)},
        {label:'Status', render:r=>UI.badge(r.status, UI.statusTone(r.status))},
      ],
      actions: r => `
        <button class="icon-action" data-view="${r.id}">${ICONS.eye(14)}</button>
        ${canEdit && r.status!=='Paid' ? `<button class="btn btn-sm btn-primary" data-pay="${r.id}">Collect</button>` : ''}
      `,
      onRender:(el)=>{
        el.querySelectorAll('[data-pay]').forEach(b=>b.addEventListener('click', ()=>openCollect(DB.get('fees', b.dataset.pay))));
        el.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click', ()=>viewBreakdown(DB.get('fees', b.dataset.view))));
      }
    });
  }

  function viewBreakdown(fee){
    const student = studentMap[fee.studentId];
    UI.openModal({
      title: `Fee breakdown — ${student?.name||''}`,
      bodyHTML: `
        <div class="table-wrap"><table>
          <thead><tr><th>Category</th><th>Amount</th></tr></thead>
          <tbody>${(fee.items||[]).map(it=>`<tr><td>${it.category}</td><td>${UI.fmtMoney(it.amount)}</td></tr>`).join('') || `<tr><td colspan="2">No breakdown recorded</td></tr>`}</tbody>
          <tfoot><tr><td><b>Total</b></td><td><b>${UI.fmtMoney(fee.amount)}</b></td></tr></tfoot>
        </table></div>
        <div class="row-sub" style="margin-top:12px;">Paid so far: <b>${UI.fmtMoney(fee.paid)}</b> · Balance: <b>${UI.fmtMoney(fee.balance)}</b></div>
      `,
      footHTML:`<button class="btn btn-outline" data-close>Close</button>`
    });
  }

  function openCollect(fee){
    const student = studentMap[fee.studentId];
    UI.openModal({
      title:'Collect fee payment',
      bodyHTML:`
        <div class="row-sub" style="margin-bottom:14px;">${student?.name} · Balance due: <b>${UI.fmtMoney(fee.balance)}</b></div>
        ${UI.renderForm([{name:'amount', label:'Amount received', type:'number', required:true, full:true}], {amount: fee.balance})}
      `,
      footHTML:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Record payment</button>`,
      onMount:(modal, close)=>{
        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-save]').addEventListener('click', ()=>{
          const amount = Number(modal.querySelector('[name="amount"]').value || 0);
          if(amount<=0){ UI.toast('Enter a valid amount','error'); return; }
          const paid = Math.min(fee.amount, fee.paid + amount);
          const balance = fee.amount - paid;
          const status = balance<=0 ? 'Paid' : (paid>0 ? 'Partial' : 'Pending');
          DB.update('fees', fee.id, {paid, balance, status});
          DB.update('students', fee.studentId, {feeStatus: status});
          UI.toast('Payment recorded'); close(); renderTable();
        });
      }
    });
  }

  /* Bill a student: pick items from the catalog (checkbox + editable
     price, defaulting to the catalog price), total is computed live,
     and saving creates a new fee record awaiting collection. */
  function openBillStudent(){
    const catalog = DB.all('feeItems');
    if(!catalog.length){ UI.toast('Add at least one billing item first', 'error'); return; }
    const studentOptions = students.map(s=>({value:s.id, label:`${s.name} (${s.class})`}));

    function rowsHTML(){
      return catalog.map(it=>`
        <div class="card-flat" data-item-row="${it.id}" style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <input type="checkbox" data-item-check="${it.id}" style="width:16px;height:16px;flex-shrink:0;"/>
          <div style="flex:1;font-weight:600;">${it.name}</div>
          <input type="number" data-item-price="${it.id}" value="${it.price}" style="width:110px;" disabled/>
        </div>`).join('');
    }

    const {modal, close} = UI.openModal({
      title:'Bill a student',
      large:true,
      bodyHTML:`
        ${UI.renderForm([{name:'studentId', label:'Student', type:'select', options:studentOptions, required:true, full:true}], {})}
        <div class="section-title" style="margin-top:6px;">Select what to bill for</div>
        ${rowsHTML()}
        <div class="row-sub" style="text-align:right;margin-top:10px;font-size:14px;">Total: <b id="bill-total">${UI.fmtMoney(0)}</b></div>
      `,
      footHTML:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Create bill</button>`,
      onMount:(modalEl, closeFn)=>{
        function recalc(){
          let total = 0;
          catalog.forEach(it=>{
            const checked = modalEl.querySelector(`[data-item-check="${it.id}"]`).checked;
            const priceInput = modalEl.querySelector(`[data-item-price="${it.id}"]`);
            priceInput.disabled = !checked;
            if(checked) total += Number(priceInput.value||0);
          });
          modalEl.querySelector('#bill-total').textContent = UI.fmtMoney(total);
        }
        modalEl.querySelectorAll('[data-item-check]').forEach(cb=>cb.addEventListener('change', recalc));
        modalEl.querySelectorAll('[data-item-price]').forEach(inp=>inp.addEventListener('input', recalc));

        modalEl.querySelector('[data-cancel]').addEventListener('click', closeFn);
        modalEl.querySelector('[data-save]').addEventListener('click', ()=>{
          const studentId = modalEl.querySelector('[name="studentId"]').value;
          if(!studentId){ UI.toast('Choose a student','error'); return; }
          const items = catalog.filter(it=> modalEl.querySelector(`[data-item-check="${it.id}"]`).checked)
            .map(it=>({category: it.name, amount: Number(modalEl.querySelector(`[data-item-price="${it.id}"]`).value||0)}));
          if(!items.length){ UI.toast('Select at least one item to bill','error'); return; }
          const amount = items.reduce((s,it)=>s+it.amount,0);
          DB.add('fees', {
            studentId, term: DB.settings().term || 'Current Term',
            items, amount, paid:0, balance:amount, status:'Pending',
            dueDate: new Date().toISOString().slice(0,10)
          });
          DB.update('students', studentId, {feeStatus:'Pending'});
          UI.toast('Student billed'); closeFn(); renderCollection();
        });
      }
    });
  }

  /* ---------------- Billing Items tab ---------------- */
  function renderBillingItems(){
    const items = DB.all('feeItems').slice();
    function drawTable(){
      body.innerHTML = `
        <div class="card">
          <div class="section-title">Billing catalog <span class="row-sub" style="font-weight:400;">What students can be billed for, and how much each one costs — used by "Bill a Student" above</span></div>
          <div class="table-wrap"><div class="scroll-x"><table>
            <thead><tr><th>Item name</th><th>Price</th>${canEdit?'<th></th>':''}</tr></thead>
            <tbody>
              ${items.map((it,i)=>`<tr data-i="${i}">
                <td><input type="text" data-f="name" value="${it.name}" ${canEdit?'':'disabled'}/></td>
                <td><input type="number" data-f="price" value="${it.price}" style="width:110px;" ${canEdit?'':'disabled'}/></td>
                ${canEdit?`<td><button class="icon-action" data-remove="${i}">${ICONS.trash(13)}</button></td>`:''}
              </tr>`).join('') || `<tr><td colspan="${canEdit?3:2}">No billing items yet</td></tr>`}
            </tbody>
          </table></div></div>
          ${canEdit ? `<div style="margin-top:14px;display:flex;justify-content:space-between;">
            <button class="btn btn-outline btn-sm" id="add-item">${ICONS.plus(13)} Add item</button>
            <button class="btn btn-primary" id="save-items">Save billing items</button>
          </div>` : ''}
        </div>`;
      if(canEdit){
        body.querySelector('#add-item').addEventListener('click', ()=>{
          items.push({id: DB.uid('fit'), name:'', price:0}); drawTable();
        });
        body.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click', ()=>{
          items.splice(Number(b.dataset.remove),1); drawTable();
        }));
        body.querySelector('#save-items').addEventListener('click', ()=>{
          const rows = body.querySelectorAll('tr[data-i]');
          const updated = Array.from(rows).map((tr,i)=>({
            id: items[i].id || DB.uid('fit'),
            name: tr.querySelector('[data-f="name"]').value.trim() || 'Untitled item',
            price: Number(tr.querySelector('[data-f="price"]').value) || 0,
          }));
          persistFeeItems(updated);
          UI.toast('Billing items saved');
        });
      }
    }
    drawTable();
  }

  function persistFeeItems(updated){
    // feeItems is a plain collection — replace it wholesale via remove+add
    // since there's no bulk-replace helper on DB.
    DB.all('feeItems').forEach(it=> DB.remove('feeItems', it.id));
    updated.forEach(it=> DB.add('feeItems', {id:it.id, name:it.name, price:it.price}));
  }

  renderCollection();
};
