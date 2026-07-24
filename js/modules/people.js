/* Greenwood SMS — Student / Teacher / Staff management */
window.MODULES = window.MODULES || {};

/* Nursery + Primary only. Order matters — used for promotion "next class" logic. */
const CLASS_NAMES = ['Pre-Nursery','Nursery 1','Nursery 2','Nursery 3','Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6'];

function classLevel(className){
  return (className||'').startsWith('Primary') ? 'primary' : 'nursery';
}
function nextClassName(className){
  const i = CLASS_NAMES.indexOf(className);
  if(i===-1 || i===CLASS_NAMES.length-1) return null; // last class = about to graduate
  return CLASS_NAMES[i+1];
}

const NURSERY_SUBJECTS = ['Numeracy','Literacy','Basic Science','Social Habits','Rhymes & Phonics','Drawing & Colouring','Physical & Health Education'];
const PRIMARY_SUBJECTS = ['Mathematics','English Language','Basic Science & Technology','Social Studies','Agricultural Science','Home Economics','Religious Studies','Civic Education','Computer Studies (ICT)'];
// Kept for any leftover references — always resolve per-class subjects via subjectsForClass().
const SUBJECT_NAMES = [...new Set([...NURSERY_SUBJECTS, ...PRIMARY_SUBJECTS])];

function subjectsForClass(className){
  return classLevel(className)==='primary' ? PRIMARY_SUBJECTS : NURSERY_SUBJECTS;
}

/* ---------------- Class scoping for Teachers ----------------
   Returns null when the current user can see every class (any
   admin-type role). Returns an array of class names when the
   user is a Teacher — every module that lists/filters by class
   should intersect its options against this. */
function getScopedClasses(ctx){
  if(!ctx || !ctx.user) return null;
  if(ctx.user.role !== 'Teacher') return null;
  const teacher = DB.get('teachers', ctx.user.linkedTeacherId);
  if(!teacher) return [];
  return (teacher.classes && teacher.classes.length) ? teacher.classes.slice() : [];
}
/* Classes a module's dropdowns/filters should offer right now. */
function visibleClasses(ctx){
  const scoped = getScopedClasses(ctx);
  return scoped === null ? CLASS_NAMES.slice() : scoped;
}

/* ---------------- Salary ledger (shared by Academic & Non-Academic Staff) ----------------
   Salary is tracked per calendar month rather than a single flag, so the
   Financial Officer (Accountant) and Super Admin can look back or ahead
   and see exactly which months are settled for any staff member —
   including leadership roles like the Principal, as long as they have a
   record here. Access to view/tick months is restricted to those two
   roles; everyone else with edit rights only sees the read-only summary.
   Marking a month paid drops a targeted notification into that person's
   linked user account (via linkedTeacherId for teachers, linkedStaffId
   for everyone else) — nobody else's bell/feed sees it. */
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function monthKey(year, monthIdx){ return `${year}-${String(monthIdx+1).padStart(2,'0')}`; }
function currentMonthKey(){ const d = new Date(); return monthKey(d.getFullYear(), d.getMonth()); }
function canManageSalary(ctx){ return ['Super Admin','Accountant'].includes(ctx.user.role); }

function notifySalaryPaidForMonth(collection, record, key){
  const [y,m] = key.split('-');
  const label = `${MONTH_NAMES[Number(m)-1]} ${y}`;
  const linkedField = collection==='teachers' ? 'linkedTeacherId' : 'linkedStaffId';
  const user = DB.all('users').find(u => u[linkedField] === record.id);
  DB.add('activities', {
    text: `Your salary for ${label} (${UI.fmtMoney(record.salary)}) has been paid.`,
    type: 'salary',
    time: 'Just now',
    read: false,
    forUserId: user ? user.id : null,
  });
  return user;
}

function openSalaryLedger(collection, record, ctx, onChange){
  const manage = canManageSalary(ctx);
  let year = new Date().getFullYear();
  const yearOptions = [year-1, year, year+1];

  function bodyHTML(){
    const rec = DB.get(collection, record.id);
    const payments = rec.salaryPayments || {};
    return `
      <div class="row-sub" style="margin-bottom:14px;">${rec.name} · Monthly salary: <b>${rec.salary?UI.fmtMoney(rec.salary):'Not set'}</b></div>
      <div class="field" style="max-width:160px;margin-bottom:10px;">
        <label>Year</label>
        <select id="ledger-year">${yearOptions.map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('')}</select>
      </div>
      <div id="ledger-months">
        ${MONTH_NAMES.map((m,i)=>{
          const key = monthKey(year, i);
          const p = payments[key];
          const paid = !!(p && p.paid);
          return `<div class="activity-item">
            <div class="activity-dot" style="background:${paid?'var(--green-500)':'var(--ink-faint)'}"></div>
            <div style="flex:1;">
              <div class="t">${m} ${year}</div>
              <div class="d">${paid ? 'Paid on '+UI.fmtDate(p.paidDate) : 'Not yet paid'}</div>
            </div>
            ${manage
              ? (paid ? `<button class="btn btn-sm btn-outline" data-unpay="${key}">Undo</button>` : `<button class="btn btn-sm btn-primary" data-pay="${key}" ${rec.salary?'':'disabled'}>Mark paid</button>`)
              : UI.badge(paid?'Paid':'Pending', paid?'green':'gray')}
          </div>`;
        }).join('')}
      </div>`;
  }

  UI.openModal({
    title:'Salary ledger', large:true,
    bodyHTML: bodyHTML(),
    footHTML:`<button class="btn btn-primary" data-close>Close</button>`,
    onMount:(modalEl)=>{
      function rewire(){
        modalEl.querySelector('.modal-body').innerHTML = bodyHTML();
        modalEl.querySelector('#ledger-year').addEventListener('change', e=>{ year = Number(e.target.value); rewire(); });
        modalEl.querySelectorAll('[data-pay]').forEach(b=>b.addEventListener('click', ()=>{
          const rec = DB.get(collection, record.id);
          const payments = {...(rec.salaryPayments||{})};
          payments[b.dataset.pay] = {paid:true, paidDate:new Date().toISOString().slice(0,10)};
          DB.update(collection, record.id, {salaryPayments: payments});
          const user = notifySalaryPaidForMonth(collection, rec, b.dataset.pay);
          UI.toast(user ? 'Marked as paid — they\'ve been notified' : 'Marked as paid (no linked account to notify)');
          rewire(); if(onChange) onChange();
        }));
        modalEl.querySelectorAll('[data-unpay]').forEach(b=>b.addEventListener('click', ()=>{
          const rec = DB.get(collection, record.id);
          const payments = {...(rec.salaryPayments||{})};
          delete payments[b.dataset.unpay];
          DB.update(collection, record.id, {salaryPayments: payments});
          UI.toast('Marked as unpaid');
          rewire(); if(onChange) onChange();
        }));
      }
      rewire();
    }
  });
}

function salaryColumn(r){
  if(!r.salary) return '<span class="row-sub">Not set</span>';
  const p = (r.salaryPayments||{})[currentMonthKey()];
  const paidThisMonth = !!(p && p.paid);
  return `<div class="row-name">${UI.fmtMoney(r.salary)}</div><div class="row-sub">${UI.badge(paidThisMonth?'Paid this month':'Pending this month', paidThisMonth?'green':'amber')}</div>`;
}

/* ---------------- Students ---------------- */
MODULES.students = function(container, ctx){
  const canEdit = ['Super Admin','Principal','Head Teacher'].includes(ctx.user.role);
  const classOptions = visibleClasses(ctx);
  const scoped = getScopedClasses(ctx);

  function studentFields(){
    return [
      {name:'name', label:'Full name', required:true, full:true},
      {name:'admissionNo', label:'Admission No.', required:true},
      {name:'gender', label:'Gender', type:'select', options:['Male','Female']},
      {name:'class', label:'Class', type:'select', options:CLASS_NAMES, required:true},
      {name:'dob', label:'Date of birth', type:'date'},
      {name:'guardian', label:'Guardian name'},
      {name:'phone', label:'Phone'},
      {name:'email', label:'Email', type:'email'},
      {name:'address', label:'Address', full:true},
      {name:'status', label:'Status', type:'select', options:['Active','Inactive']},
    ];
  }

  function openForm(record){
    const fields = studentFields();
    UI.openModal({
      title: record ? 'Edit student' : 'Add student',
      large:true,
      bodyHTML: UI.renderForm(fields, record||{status:'Active', gender:'Male', class:CLASS_NAMES[0]}),
      footHTML: `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${record?'Save changes':'Add student'}</button>`,
      onMount:(modal, close)=>{
        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-save]').addEventListener('click', ()=>{
          const data = UI.readForm(modal, fields);
          if(!data.name || !data.admissionNo){ UI.toast('Name and admission number are required','error'); return; }
          if(record){ DB.update('students', record.id, data); UI.toast('Student updated'); }
          else { data.feeStatus='Pending'; DB.add('students', data); UI.toast('Student added'); }
          close(); renderTable();
        });
      }
    });
  }

  container.innerHTML = `
    ${UI.pageHeader('People', 'Student Management', canEdit ? `<button class="btn btn-primary" id="add-student">${ICONS.plus(16)} Add Student</button>` : '')}
    ${scoped ? `<p class="row-sub" style="margin-bottom:14px;">Showing students in your assigned class${scoped.length===1?'':'es'}: <strong>${scoped.join(', ')||'none assigned yet'}</strong></p>` : ''}
    <div class="table-wrap" id="tbl"></div>
  `;
  if(canEdit) container.querySelector('#add-student').addEventListener('click', ()=>openForm(null));

  function renderTable(){
    let rows = DB.all('students');
    if(scoped) rows = rows.filter(s=>scoped.includes(s.class));
    UI.dataTable(container.querySelector('#tbl'), {
      rows,
      searchKeys:['name','admissionNo','email','guardian'],
      searchPlaceholder:'Search students…',
      filters:[
        {key:'class', label:'Class', options:classOptions},
        {key:'status', label:'Status', options:['Active','Inactive']},
      ],
      columns:[
        {label:'Student', render:r=>`<div style="display:flex;align-items:center;gap:10px;"><div class="avatar" style="background:var(--green-500);width:30px;height:30px;font-size:11px;">${UI.initials(r.name)}</div><div><div class="row-name">${r.name}</div><div class="row-sub">${r.admissionNo}</div></div></div>`},
        {label:'Class', key:'class'},
        {label:'Guardian', key:'guardian'},
        {label:'Contact', render:r=>`<div class="row-sub">${r.phone||'—'}</div>`},
        {label:'Fee status', render:r=>UI.badge(r.feeStatus, UI.statusTone(r.feeStatus))},
        {label:'Status', render:r=>UI.badge(r.status, UI.statusTone(r.status))},
      ],
      actions: r => canEdit ? `
        <button class="icon-action" data-view="${r.id}">${ICONS.eye(14)}</button>
        <button class="icon-action" data-edit="${r.id}">${ICONS.edit(14)}</button>
        <button class="icon-action" data-del="${r.id}">${ICONS.trash(14)}</button>
      ` : `<button class="icon-action" data-view="${r.id}">${ICONS.eye(14)}</button>`,
      onRender:(el)=>{
        el.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', ()=>openForm(DB.get('students', b.dataset.edit))));
        el.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click', ()=>viewStudent(DB.get('students', b.dataset.view))));
        el.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click', ()=>{
          UI.confirmDialog('Remove this student record? This cannot be undone.', ()=>{ DB.remove('students', b.dataset.del); UI.toast('Student removed'); renderTable(); });
        }));
      }
    });
  }
  renderTable();

  function viewStudent(s){
    const fee = DB.all('fees').find(f=>f.studentId===s.id);
    UI.openModal({
      title: s.name,
      bodyHTML:`
        <div style="display:flex;gap:14px;align-items:center;margin-bottom:16px;">
          <div class="avatar" style="width:52px;height:52px;font-size:18px;">${UI.initials(s.name)}</div>
          <div><div style="font-weight:700;font-size:16px;">${s.name}</div><div class="row-sub">${s.admissionNo} · ${s.class}</div></div>
        </div>
        <div class="grid grid-2" style="gap:10px;">
          <div class="card-flat"><div class="row-sub">Guardian</div><div class="row-name">${s.guardian||'—'}</div></div>
          <div class="card-flat"><div class="row-sub">Phone</div><div class="row-name">${s.phone||'—'}</div></div>
          <div class="card-flat"><div class="row-sub">Email</div><div class="row-name">${s.email||'—'}</div></div>
          <div class="card-flat"><div class="row-sub">Date of birth</div><div class="row-name">${UI.fmtDate(s.dob)}</div></div>
          <div class="card-flat"><div class="row-sub">Blood group</div><div class="row-name">${s.bloodGroup||'—'}</div></div>
          <div class="card-flat"><div class="row-sub">Fee balance</div><div class="row-name">${fee?UI.fmtMoney(fee.balance):'—'}</div></div>
        </div>`,
      footHTML:`<button class="btn btn-outline" data-close>Close</button>`
    });
  }
};

/* ---------------- Academic Staff (Teachers) ---------------- */
MODULES.teachers = function(container, ctx){
  const canEdit = ['Super Admin','Principal','Head Teacher'].includes(ctx.user.role);
  const canManageSalaryHere = canManageSalary(ctx);

  function fields(){
    return [
      {name:'name', label:'Full name', required:true, full:true},
      {name:'staffNo', label:'Staff No.', required:true},
      {name:'gender', label:'Gender', type:'select', options:['Male','Female']},
      {name:'qualification', label:'Qualification'},
      {name:'phone', label:'Phone'},
      {name:'email', label:'Email', type:'email'},
      {name:'joined', label:'Date joined', type:'date'},
      {name:'status', label:'Status', type:'select', options:['Active','Inactive','On Leave']},
      {name:'salary', label:'Monthly salary', type:'number'},
      {name:'classes', label:'Assigned classes — a class can have more than one teacher, and a teacher can be assigned to more than one class', type:'multiselect', options:CLASS_NAMES, full:true},
    ];
  }
  function openForm(record){
    const f = fields();
    UI.openModal({
      title: record?'Edit academic staff':'Add academic staff', large:true,
      bodyHTML: UI.renderForm(f, record||{status:'Active', gender:'Male'}),
      footHTML:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${record?'Save changes':'Add academic staff'}</button>`,
      onMount:(modal, close)=>{
        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-save]').addEventListener('click', ()=>{
          const data = UI.readForm(modal, f);
          if(!data.name){ UI.toast('Name is required','error'); return; }
          if(record){ DB.update('teachers', record.id, data); UI.toast('Academic staff updated'); }
          else { data.salaryPayments = {}; DB.add('teachers', data); UI.toast('Academic staff added'); }
          close(); renderTable();
        });
      }
    });
  }

  container.innerHTML = `
    ${UI.pageHeader('People', 'Academic Staff Management', canEdit? `<button class="btn btn-primary" id="add-teacher">${ICONS.plus(16)} Add Academic Staff</button>`:'')}
    <div class="table-wrap" id="tbl"></div>`;
  if(canEdit) container.querySelector('#add-teacher').addEventListener('click', ()=>openForm(null));

  function renderTable(){
    UI.dataTable(container.querySelector('#tbl'), {
      rows: DB.all('teachers'),
      searchKeys:['name','staffNo','email'],
      searchPlaceholder:'Search academic staff…',
      filters:[{key:'status', label:'Status', options:['Active','Inactive','On Leave']}],
      columns:[
        {label:'Academic staff', render:r=>`<div style="display:flex;align-items:center;gap:10px;"><div class="avatar" style="width:30px;height:30px;font-size:11px;">${UI.initials(r.name)}</div><div><div class="row-name">${r.name}</div><div class="row-sub">${r.staffNo}</div></div></div>`},
        {label:'Assigned classes', render:r=> (r.classes&&r.classes.length) ? r.classes.map(c=>UI.badge(c,'blue')).join(' ') : '<span class="row-sub">Not assigned</span>'},
        {label:'Qualification', key:'qualification'},
        {label:'Contact', render:r=>`<div class="row-sub">${r.phone||'—'}</div>`},
        {label:'Salary', render:salaryColumn},
        {label:'Status', render:r=>UI.badge(r.status, UI.statusTone(r.status))},
      ],
      actions: r=> `
        ${canManageSalaryHere && r.salary ? `<button class="btn btn-sm btn-outline" data-salary="${r.id}">Salary</button>` : ''}
        ${canEdit? `<button class="icon-action" data-edit="${r.id}">${ICONS.edit(14)}</button><button class="icon-action" data-del="${r.id}">${ICONS.trash(14)}</button>` : ''}
      `,
      onRender:(el)=>{
        el.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', ()=>openForm(DB.get('teachers', b.dataset.edit))));
        el.querySelectorAll('[data-salary]').forEach(b=>b.addEventListener('click', ()=> openSalaryLedger('teachers', DB.get('teachers', b.dataset.salary), ctx, renderTable)));
        el.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click', ()=>{
          UI.confirmDialog('Remove this academic staff record?', ()=>{ DB.remove('teachers', b.dataset.del); UI.toast('Academic staff removed'); renderTable(); });
        }));
      }
    });
  }
  renderTable();
};

/* ---------------- Non-Academic Staff ---------------- */
MODULES.staff = function(container, ctx){
  const canEdit = ['Super Admin','Principal'].includes(ctx.user.role);
  const canManageSalaryHere = canManageSalary(ctx);
  // This roster doubles as the general payroll list, so leadership roles
  // that don't have their own module (Principal, Head Teacher, Super
  // Admin) can still get a salary record here if you need to pay them.
  const roles = ['Accountant','Principal','Head Teacher','Vice Principal','Super Admin','Groundskeeper','Nurse','Security','Receptionist','Cook','Cleaner'];

  function fields(){
    return [
      {name:'name', label:'Full name', required:true, full:true},
      {name:'staffNo', label:'Staff No.', required:true},
      {name:'role', label:'Role', type:'select', options:roles},
      {name:'department', label:'Department', type:'select', options:['Administration','Finance','Facilities','Health','Operations']},
      {name:'phone', label:'Phone'},
      {name:'email', label:'Email', type:'email'},
      {name:'status', label:'Status', type:'select', options:['Active','Inactive']},
      {name:'salary', label:'Monthly salary', type:'number'},
    ];
  }
  function openForm(record){
    const f = fields();
    UI.openModal({
      title: record?'Edit non-academic staff':'Add non-academic staff', large:true,
      bodyHTML: UI.renderForm(f, record||{status:'Active'}),
      footHTML:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${record?'Save changes':'Add non-academic staff'}</button>`,
      onMount:(modal, close)=>{
        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-save]').addEventListener('click', ()=>{
          const data = UI.readForm(modal, f);
          if(!data.name){ UI.toast('Name is required','error'); return; }
          if(record){ DB.update('staff', record.id, data); UI.toast('Non-academic staff updated'); }
          else { data.salaryPayments = {}; DB.add('staff', data); UI.toast('Non-academic staff added'); }
          close(); renderTable();
        });
      }
    });
  }

  container.innerHTML = `
    ${UI.pageHeader('People', 'Non-Academic Staff Management', canEdit? `<button class="btn btn-primary" id="add-staff">${ICONS.plus(16)} Add Non-Academic Staff</button>`:'')}
    <div class="table-wrap" id="tbl"></div>`;
  if(canEdit) container.querySelector('#add-staff').addEventListener('click', ()=>openForm(null));

  function renderTable(){
    UI.dataTable(container.querySelector('#tbl'), {
      rows: DB.all('staff'),
      searchKeys:['name','staffNo','role','department'],
      searchPlaceholder:'Search non-academic staff…',
      filters:[{key:'role', label:'Role', options:roles}],
      columns:[
        {label:'Non-academic staff', render:r=>`<div style="display:flex;align-items:center;gap:10px;"><div class="avatar" style="width:30px;height:30px;font-size:11px;background:var(--blue-500);">${UI.initials(r.name)}</div><div><div class="row-name">${r.name}</div><div class="row-sub">${r.staffNo}</div></div></div>`},
        {label:'Role', key:'role'},
        {label:'Department', key:'department'},
        {label:'Contact', render:r=>`<div class="row-sub">${r.phone||'—'}</div>`},
        {label:'Salary', render:salaryColumn},
        {label:'Status', render:r=>UI.badge(r.status, UI.statusTone(r.status))},
      ],
      actions: r=> `
        ${canManageSalaryHere && r.salary ? `<button class="btn btn-sm btn-outline" data-salary="${r.id}">Salary</button>` : ''}
        ${canEdit? `<button class="icon-action" data-edit="${r.id}">${ICONS.edit(14)}</button><button class="icon-action" data-del="${r.id}">${ICONS.trash(14)}</button>` : ''}
      `,
      onRender:(el)=>{
        el.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', ()=>openForm(DB.get('staff', b.dataset.edit))));
        el.querySelectorAll('[data-salary]').forEach(b=>b.addEventListener('click', ()=> openSalaryLedger('staff', DB.get('staff', b.dataset.salary), ctx, renderTable)));
        el.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click', ()=>{
          UI.confirmDialog('Remove this non-academic staff record?', ()=>{ DB.remove('staff', b.dataset.del); UI.toast('Non-academic staff removed'); renderTable(); });
        }));
      }
    });
  }
  renderTable();
};
