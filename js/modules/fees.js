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

/* Called from Settings when a new term/session is started. Every
   currently-active fee record gets archived (kept for history, hidden
   from the normal Fee Collection view) — and for anyone who still had
   an unpaid balance, a fresh "Previous Balance b/f" bill is created in
   the new term so that debt doesn't just vanish, but also doesn't
   clutter the new term's fresh billing with old line items. */
function rolloverFeesForNewTerm(newTerm){
  const activeFees = DB.all('fees').filter(f=>!f.archived);
  let carriedCount = 0;
  activeFees.forEach(f=>{
    DB.update('fees', f.id, {archived:true});
    if(f.balance > 0){
      DB.add('fees', {
        studentId: f.studentId,
        term: newTerm,
        items: [{category:'Previous Balance b/f', amount: f.balance}],
        amount: f.balance, paid: 0, balance: f.balance, status: 'Pending',
        dueDate: new Date().toISOString().slice(0,10),
        carriedForward: true,
      });
      carriedCount++;
    }
  });
  return { archivedCount: activeFees.length, carriedCount };
}

MODULES.fees = function(container, ctx){
  const canEdit = ['Super Admin','Principal','Accountant'].includes(ctx.user.role);
  const students = DB.all('students');
  const studentMap = Object.fromEntries(students.map(s=>[s.id, s]));

  container.innerHTML = `
    ${UI.pageHeader('Finance', 'Fees & Finance Management')}
    <div class="tabs">
      <div class="tab active" data-tab="collection">Fee Collection</div>
      <div class="tab" data-tab="items">Billing Items</div>
      ${canEdit ? `<div class="tab" data-tab="overview">Financial Overview</div>` : ''}
    </div>
    <div id="tab-body"></div>
  `;
  const body = container.querySelector('#tab-body');
  container.querySelectorAll('.tab').forEach(t=>{
    t.addEventListener('click', ()=>{
      container.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
      ({items:renderBillingItems, overview:renderFinancialOverview}[t.dataset.tab] || renderCollection)();
    });
  });

  /* ---------------- Fee Collection tab ---------------- */
  let showArchived = false;
  function totals(){
    const fees = DB.all('fees').filter(f=>!f.archived);
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
        <button class="btn btn-outline" id="toggle-archived">${showArchived ? 'Hide previous terms' : 'Show previous terms'}</button>
        ${canEdit ? `<button class="btn btn-outline" id="export-fees">${ICONS.download(15)} Export</button>` : ''}
        ${canEdit ? `<button class="btn btn-outline" id="bill-multiple">${ICONS.plus(15)} Bill Multiple</button>` : ''}
        ${canEdit ? `<button class="btn btn-primary" id="bill-student">${ICONS.plus(16)} Bill a Student</button>` : ''}
      </div>
      <div class="table-wrap" id="fee-tbl"></div>
    `;

    const activeFees = DB.all('fees').filter(f=>!f.archived);
    const byCategory = {};
    const catalogNames = DB.all('feeItems').map(i=>i.name);
    (catalogNames.length ? catalogNames : FEE_CATEGORIES).forEach(cat=> byCategory[cat] = 0);
    activeFees.forEach(f=> (f.items||[]).forEach(it=> byCategory[it.category] = (byCategory[it.category]||0) + it.amount));
    CHARTS.bar('fee-bar', {
      labels: Object.keys(byCategory),
      datasets:[{label:'Billed', data: Object.values(byCategory), color:'#2D6A4F'}]
    });
    const statusCounts = {Paid:0, Partial:0, Pending:0};
    activeFees.forEach(f=> statusCounts[f.status] = (statusCounts[f.status]||0)+1);
    CHARTS.doughnut('fee-doughnut', {labels:Object.keys(statusCounts), data:Object.values(statusCounts), colors:['#2D6A4F','#DE9B3A','#C1443D']});

    body.querySelector('#toggle-archived').addEventListener('click', ()=>{
      showArchived = !showArchived; renderCollection();
    });
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
    body.querySelector('#bill-multiple')?.addEventListener('click', openBillMultiple);

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
    const rows = DB.all('fees')
      .filter(f=> showArchived ? true : !f.archived)
      .map(f=>({...f, studentName: studentMap[f.studentId]?.name || 'Unknown', class: studentMap[f.studentId]?.class}));
    UI.dataTable(body.querySelector('#fee-tbl'), {
      rows,
      searchKeys:['studentName'],
      searchPlaceholder:'Search by student…',
      filters:[{key:'status', label:'Status', options:['Paid','Partial','Pending']}, {key:'class', label:'Class', options:getClassNames()}],
      columns:[
        {label:'Student', key:'studentName'},
        {label:'Class', key:'class'},
        {label:'Term', render:r=>`${r.term||'—'}${r.archived?' '+UI.badge('Archived','gray'):''}`},
        {label:'Billed', render:r=>UI.fmtMoney(r.amount)},
        {label:'Paid', render:r=>UI.fmtMoney(r.paid)},
        {label:'Balance', render:r=>UI.fmtMoney(r.balance)},
        {label:'Status', render:r=>UI.badge(r.status, UI.statusTone(r.status))},
      ],
      actions: r => `
        <button class="icon-action" data-view="${r.id}">${ICONS.eye(14)}</button>
        ${canEdit && r.status!=='Paid' ? `<button class="btn btn-sm btn-primary" data-pay="${r.id}">Collect</button>` : ''}
        ${canEdit ? `<button class="icon-action" data-del="${r.id}">${ICONS.trash(14)}</button>` : ''}
      `,
      onRender:(el)=>{
        el.querySelectorAll('[data-pay]').forEach(b=>b.addEventListener('click', ()=>openCollect(DB.get('fees', b.dataset.pay))));
        el.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click', ()=>viewBreakdown(DB.get('fees', b.dataset.view))));
        el.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click', ()=>{
          const fee = DB.get('fees', b.dataset.del);
          const student = studentMap[fee.studentId];
          const warn = fee.paid > 0
            ? `${student?.name||'This student'} has already paid ${UI.fmtMoney(fee.paid)} against this bill. Deleting it removes that payment record too — this can't be undone. Delete anyway?`
            : `Delete this bill for ${student?.name||'this student'}? This can't be undone.`;
          UI.confirmDialog(warn, ()=>{
            DB.remove('fees', b.dataset.del);
            UI.toast('Fee record deleted');
            renderCollection();
          });
        }));
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

  /* Bill multiple students at once for one named item, each with their
     own amount — for exactly the case where the item is the same in
     kind (e.g. "Previous Balance b/f", a custom uniform charge, a
     damaged-book replacement) but the amount genuinely differs per
     student, and typing it in one at a time via "Bill a Student"
     would be tedious. Note: for carrying forward unpaid balances into
     a new term specifically, "Start New Term" in Settings already
     does this automatically using each student's real balance — this
     tool is for anything that needs a manually-entered custom amount
     per student instead. */
  function openBillMultiple(){
    let classFilter = '';
    const itemField = [{name:'itemName', label:'Item name', type:'text-datalist', options: DB.all('feeItems').map(i=>i.name), required:true, full:true, placeholder:'e.g. Previous Balance b/f'}];

    function studentRowsHTML(){
      const list = students.filter(s=> !classFilter || s.class===classFilter);
      return list.map(s=>`
        <div class="card-flat" data-srow="${s.id}" style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
          <input type="checkbox" data-scheck="${s.id}" style="width:16px;height:16px;flex-shrink:0;"/>
          <div style="flex:1;">
            <div class="row-name">${s.name}</div>
            <div class="row-sub">${s.class}</div>
          </div>
          <input type="number" data-samount="${s.id}" placeholder="Amount" style="width:110px;" disabled/>
        </div>`).join('') || '<div class="row-sub">No students in this class</div>';
    }

    const { close } = UI.openModal({
      title:'Bill multiple students',
      large:true,
      bodyHTML:`
        ${UI.renderForm(itemField, {})}
        <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 8px;">
          <div class="section-title" style="margin:0;">Select students and enter their amount</div>
          <select id="bm-class-filter" style="width:auto;">
            <option value="">All classes</option>
            ${getClassNames().map(c=>`<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div id="bm-student-list">${studentRowsHTML()}</div>
        <div class="row-sub" style="text-align:right;margin-top:10px;font-size:14px;">Total: <b id="bm-total">${UI.fmtMoney(0)}</b> across <b id="bm-count">0</b> student(s)</div>
      `,
      footHTML:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Create bills</button>`,
      onMount:(modalEl, closeFn)=>{
        function wireRows(){
          modalEl.querySelectorAll('[data-scheck]').forEach(cb=>cb.addEventListener('change', recalc));
          modalEl.querySelectorAll('[data-samount]').forEach(inp=>inp.addEventListener('input', recalc));
        }
        function recalc(){
          let total = 0, count = 0;
          modalEl.querySelectorAll('[data-scheck]').forEach(cb=>{
            const amountInput = modalEl.querySelector(`[data-samount="${cb.dataset.scheck}"]`);
            amountInput.disabled = !cb.checked;
            if(cb.checked){ total += Number(amountInput.value||0); count++; }
          });
          modalEl.querySelector('#bm-total').textContent = UI.fmtMoney(total);
          modalEl.querySelector('#bm-count').textContent = count;
        }
        modalEl.querySelector('#bm-class-filter').addEventListener('change', (e)=>{
          classFilter = e.target.value;
          modalEl.querySelector('#bm-student-list').innerHTML = studentRowsHTML();
          wireRows(); recalc();
        });
        wireRows();

        modalEl.querySelector('[data-cancel]').addEventListener('click', closeFn);
        modalEl.querySelector('[data-save]').addEventListener('click', ()=>{
          const itemName = modalEl.querySelector('[name="itemName"]').value.trim();
          if(!itemName){ UI.toast('Name the item first','error'); return; }
          const checked = Array.from(modalEl.querySelectorAll('[data-scheck]:checked'));
          if(!checked.length){ UI.toast('Select at least one student','error'); return; }
          let billed = 0;
          checked.forEach(cb=>{
            const amount = Number(modalEl.querySelector(`[data-samount="${cb.dataset.scheck}"]`).value || 0);
            if(amount<=0) return; // skip anyone left at 0 — nothing to bill them for
            DB.add('fees', {
              studentId: cb.dataset.scheck, term: DB.settings().term || 'Current Term',
              items:[{category:itemName, amount}], amount, paid:0, balance:amount, status:'Pending',
              dueDate: new Date().toISOString().slice(0,10)
            });
            DB.update('students', cb.dataset.scheck, {feeStatus:'Pending'});
            billed++;
          });
          if(!billed){ UI.toast('Enter an amount greater than 0 for at least one student','error'); return; }
          UI.toast(`Billed ${billed} student(s)`); closeFn(); renderCollection();
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

  /* ---------------- Financial Overview tab ---------------- */
  /* Income = every naira actually collected from fees, ever — including
     from archived (previous-term) bills, since money that was genuinely
     paid stays real income regardless of which term it belonged to.
     Expenditure = every naira spent, ever. Available balance is simply
     the difference: what's left of everything the school has taken in
     after everything it's spent. This is a running total, not scoped
     to the current term — matches how an actual bank balance works. */
  function renderFinancialOverview(){
    const allFees = DB.all('fees');
    const allExpenditures = DB.all('expenditures');
    const totalIncome = allFees.reduce((s,f)=>s+(f.paid||0), 0);
    const totalExpenditure = allExpenditures.reduce((s,e)=>s+(e.amount||0), 0);
    const balance = totalIncome - totalExpenditure;
    const totalBilled = allFees.reduce((s,f)=>s+(f.amount||0), 0);
    const totalOutstanding = totalBilled - totalIncome;

    body.innerHTML = `
      <div class="grid grid-3" style="margin-bottom:20px;">
        <div class="card stat-card"><div class="top"><div class="ic-wrap">${ICONS.trend(20)}</div></div><div class="label">Total Income (collected)</div><div class="value">${UI.fmtMoney(totalIncome)}</div></div>
        <div class="card stat-card"><div class="top"><div class="ic-wrap" style="background:#FBE4E2;color:#8F2A25;">${ICONS.money(20)}</div></div><div class="label">Total Expenditure</div><div class="value">${UI.fmtMoney(totalExpenditure)}</div></div>
        <div class="card stat-card"><div class="top"><div class="ic-wrap" style="background:${balance>=0?'#E4EDF7':'#FBE4E2'};color:${balance>=0?'#2A5686':'#8F2A25'};">${ICONS.fees(20)}</div></div><div class="label">Available Balance</div><div class="value" style="color:${balance>=0?'inherit':'#C1443D'};">${UI.fmtMoney(balance)}</div></div>
      </div>
      <div class="card" style="margin-bottom:20px;">
        <div class="section-title">Income vs. Expenditure by month</div>
        <div style="height:240px;"><canvas id="fin-overview-chart"></canvas></div>
      </div>
      <div class="grid grid-2">
        <div class="card-flat"><div class="row-sub">Total billed (all time)</div><div class="row-name">${UI.fmtMoney(totalBilled)}</div></div>
        <div class="card-flat"><div class="row-sub">Still outstanding (unpaid)</div><div class="row-name">${UI.fmtMoney(totalOutstanding)}</div></div>
      </div>
    `;

    // Monthly breakdown for the trend chart
    const byMonth = {};
    function bucket(dateStr){
      if(!dateStr) return null;
      const key = dateStr.slice(0,7);
      if(!byMonth[key]) byMonth[key] = {income:0, expenditure:0};
      return byMonth[key];
    }
    allExpenditures.forEach(e=>{ const b = bucket(e.purchaseDate); if(b) b.expenditure += (e.amount||0); });
    // Fees don't carry a "payment date" per collection event today, only
    // a due date — approximate income timing with dueDate so the chart
    // has something meaningful; the headline totals above are exact
    // regardless.
    allFees.forEach(f=>{ const b = bucket(f.dueDate); if(b && f.paid) b.income += f.paid; });
    const months = Object.keys(byMonth).sort();
    CHARTS.bar('fin-overview-chart', {
      labels: months,
      datasets:[
        {label:'Income', data: months.map(m=>byMonth[m].income), color:'#2D6A4F'},
        {label:'Expenditure', data: months.map(m=>byMonth[m].expenditure), color:'#C1443D'},
      ]
    });
  }

  renderCollection();
};
