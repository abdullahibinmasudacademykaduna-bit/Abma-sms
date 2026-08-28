/* Greenwood SMS — Student / Teacher / Staff management */
window.MODULES = window.MODULES || {};

/* Nursery + Primary suggestions only — used as datalist suggestions
   when adding a class, and as a fallback so dropdowns aren't empty
   before any real classes exist. The actual list of classes lives in
   the 'classes' collection now (see getClassList/getClassNames below)
   so schools can add, rename, reorder, and delete classes freely
   instead of being stuck with this fixed set. */
const DEFAULT_CLASS_NAMES = ['Pre-Nursery','Nursery 1','Nursery 2','Nursery 3','Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6'];

/* Real classes, sorted by their "order" field (used for promotion
   sequencing — see nextClassName). Classes without an explicit order
   (e.g. old data) sort after ones that have it, in creation order.
   Deliberately does NOT fall back to DEFAULT_CLASS_NAMES when empty —
   an admin who deletes every class should see zero classes, not have
   the old defaults reappear. DEFAULT_CLASS_NAMES is only ever used as
   datalist suggestions when adding a class (see academics.js). */
function getClassList(){
  return DB.all('classes').slice().sort((a,b)=> (a.order??9999) - (b.order??9999));
}
function getClassNames(){
  return getClassList().map(c=>c.name);
}

function classLevel(className){
  const rec = DB.all('classes').find(c=>c.name===className);
  if(rec && rec.level) return rec.level;
  return (className||'').startsWith('Primary') ? 'primary' : 'nursery';
}

/* Groups students by class (in the school's own class order — see
   getClassList's "order" field, the same order Classes management
   lets you reorder) so a class's students always appear together
   instead of scattered by whatever order they were entered in. Used
   anywhere a full/multi-class student list is shown: the Students
   table, and the student pickers in billing. */
function sortByClassThenName(list){
  const classOrder = getClassNames();
  return list.slice().sort((a,b)=>{
    const ca = classOrder.indexOf(a.class), cb = classOrder.indexOf(b.class);
    const oa = ca===-1 ? 9999 : ca, ob = cb===-1 ? 9999 : cb;
    if(oa !== ob) return oa - ob;
    return (a.name||'').localeCompare(b.name||'');
  });
}

/* Small hand-rolled CSV parser (handles quoted fields, escaped ""
   quotes, and commas/newlines inside quotes) — no external library
   needed for a format this simple. */
function parseCSV(text){
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i=0;i<text.length;i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if(c === '"') inQuotes = true;
      else if(c === ','){ row.push(field); field = ''; }
      else if(c === '\n' || c === '\r'){
        if(c === '\r' && text[i+1] === '\n') i++;
        row.push(field); field = '';
        if(row.some(f=>f!=='')) rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if(field.length || row.length){ row.push(field); if(row.some(f=>f!=='')) rows.push(row); }
  return rows;
}

const CSV_STUDENT_COLUMNS = [
  {header:'Name', key:'name', required:true},
  {header:'Admission No', key:'admissionNo', required:true},
  {header:'Gender', key:'gender'},
  {header:'Class', key:'class', required:true},
  {header:'Date of Birth', key:'dob'},
  {header:'Guardian', key:'guardian'},
  {header:'Phone', key:'phone'},
  {header:'Email', key:'email'},
  {header:'Address', key:'address'},
  {header:'Status', key:'status'},
];
function nextClassName(className){
  const names = getClassNames();
  const i = names.indexOf(className);
  if(i===-1 || i===names.length-1) return null; // last class = about to graduate
  return names[i+1];
}

/* Printable student ID cards. No student photo field exists yet, so
   each card uses the same colored-initials avatar already used
   throughout the app rather than a blank photo box. QR encodes the
   admission number, scannable to quickly confirm a card is genuine
   without needing the app open. */
function buildIDCardHTML(student, settings){
  const qrText = encodeURIComponent(`${settings.schoolName||'School'} · ${student.name} · ${student.admissionNo}`);
  return `
    <div class="idc">
      <div class="idc-head">
        ${settings.logoDataUrl ? `<img class="idc-logo" src="${settings.logoDataUrl}"/>` : ''}
        <div class="idc-school">${settings.schoolName||''}</div>
      </div>
      <div class="idc-body">
        <div class="idc-avatar">${UI.initials(student.name)}</div>
        <div class="idc-info">
          <div class="idc-name">${student.name}</div>
          <div class="idc-row"><b>Adm. No:</b> ${student.admissionNo||'—'}</div>
          <div class="idc-row"><b>Class:</b> ${student.class||'—'}</div>
          <div class="idc-row"><b>Guardian:</b> ${student.guardian||'—'}</div>
          <div class="idc-row"><b>Phone:</b> ${student.phone||'—'}</div>
        </div>
      </div>
      <div class="idc-foot">
        <div data-qrtext="${qrText}" class="idc-qr"></div>
        <div class="idc-session">${settings.session||''}</div>
      </div>
    </div>`;
}

const IDC_PRINT_CSS = `
  @page { size: A4; margin: 12mm; }
  body{ font-family: 'Segoe UI', Arial, sans-serif; margin:0; }
  .idc-grid{ display:flex; flex-wrap:wrap; gap:8mm; }
  .idc{ width:54mm; height:86mm; border:1px solid #ccc; border-radius:10px; overflow:hidden; display:flex; flex-direction:column; break-inside:avoid; }
  .idc-head{ background:#1a6b4a; color:#fff; padding:6px 8px; display:flex; align-items:center; gap:6px; }
  .idc-logo{ width:20px; height:20px; border-radius:50%; object-fit:cover; background:#fff; }
  .idc-school{ font-size:9px; font-weight:700; line-height:1.15; }
  .idc-body{ flex:1; padding:10px 8px; text-align:center; }
  .idc-avatar{ width:46px; height:46px; border-radius:50%; background:#e4f0ea; color:#1a6b4a; font-weight:700; font-size:15px; display:flex; align-items:center; justify-content:center; margin:0 auto 8px; }
  .idc-name{ font-weight:700; font-size:12px; margin-bottom:6px; }
  .idc-row{ font-size:9px; text-align:left; margin-bottom:2px; color:#333; }
  .idc-foot{ padding:6px 8px; border-top:1px dashed #ccc; display:flex; align-items:center; justify-content:space-between; }
  .idc-qr img{ width:34px; height:34px; }
  .idc-session{ font-size:8px; color:#777; }
`;

function printIDCards(studentsList){
  const settings = DB.settings();
  const cardHTMLs = studentsList.map(s=>buildIDCardHTML(s, settings));

  function resolveQRCodes(htmlStrings, callback){
    if(typeof QRCode === 'undefined'){ callback(htmlStrings); return; }
    const tempHolder = document.createElement('div');
    tempHolder.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
    document.body.appendChild(tempHolder);

    const jobs = htmlStrings.map(html => ({ html, matches:[...html.matchAll(/data-qrtext="([^"]+)"/g)] }));
    let pending = jobs.reduce((n,j)=>n+j.matches.length, 0);
    if(pending === 0){ document.body.removeChild(tempHolder); callback(htmlStrings); return; }

    jobs.forEach(job=>{
      job.matches.forEach(match=>{
        const encoded = match[1];
        const qrText = decodeURIComponent(encoded);
        const div = document.createElement('div');
        tempHolder.appendChild(div);
        try{ new QRCode(div, {text:qrText, width:60, height:60, colorDark:'#000000', colorLight:'#ffffff'}); }catch(e){}
        setTimeout(()=>{
          const canvas = div.querySelector('canvas');
          const dataURL = canvas ? canvas.toDataURL('image/png') : '';
          const placeholder = new RegExp(`<div[^>]*data-qrtext="${encoded}"[^>]*>(</div>)?`, 'g');
          job.html = job.html.replace(placeholder, dataURL ? `<img src="${dataURL}"/>` : '');
          pending--;
          if(pending===0){ document.body.removeChild(tempHolder); callback(jobs.map(j=>j.html)); }
        }, 250);
      });
    });
  }

  resolveQRCodes(cardHTMLs, (resolvedHTMLs)=>{
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Student ID Cards</title><style>${IDC_PRINT_CSS}</style></head>
      <body><div class="idc-grid">${resolvedHTMLs.join('')}</div>
      <script>window.onload=function(){window.print();};<\/script></body></html>`;
    const blob = new Blob([html], {type:'text/html'});
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    iframe.src = url;
    document.body.appendChild(iframe);
    setTimeout(()=>{ URL.revokeObjectURL(url); iframe.remove(); }, 60000);
  });
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
  return scoped === null ? getClassNames() : scoped;
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
  // Only create a notification when it can be aimed at the actual
  // person — falling back to forUserId:null would broadcast it to
  // every signed-in account (including whoever's doing the paying),
  // which is misleading when there's genuinely no one specific to tell.
  if(user){
    DB.add('activities', {
      text: `Your salary for ${label} (${UI.fmtMoney(record.salary)}) has been paid.`,
      type: 'salary',
      time: 'Just now',
      read: false,
      forUserId: user.id,
    });
  }
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
      {name:'class', label:'Class', type:'select', options:getClassNames(), required:true},
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
      bodyHTML: UI.renderForm(fields, record||{status:'Active', gender:'Male', class:getClassNames()[0]}),
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
    ${UI.pageHeader('People', 'Student Management', `
      <button class="btn btn-outline" id="print-idcards">${ICONS.id(15)} Print ID Cards</button>
      ${canEdit ? `<button class="btn btn-outline" id="import-students">${ICONS.upload(15)} Import CSV</button>` : ''}
      ${canEdit ? `<button class="btn btn-primary" id="add-student">${ICONS.plus(16)} Add Student</button>` : ''}
    `)}
    ${scoped ? `<p class="row-sub" style="margin-bottom:14px;">Showing students in your assigned class${scoped.length===1?'':'es'}: <strong>${scoped.join(', ')||'none assigned yet'}</strong></p>` : ''}
    <div class="table-wrap" id="tbl"></div>
  `;
  if(canEdit) container.querySelector('#add-student').addEventListener('click', ()=>openForm(null));
  if(canEdit) container.querySelector('#import-students')?.addEventListener('click', openImportStudents);
  container.querySelector('#print-idcards').addEventListener('click', ()=>{
    const options = (scoped && scoped.length) ? scoped : getClassNames();
    UI.openModal({
      title:'Print ID Cards',
      bodyHTML: UI.renderForm([{name:'className', label:'Class', type:'select', options, required:true, full:true}], {}),
      footHTML:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-print>Print</button>`,
      onMount:(modal, close)=>{
        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-print]').addEventListener('click', ()=>{
          const className = modal.querySelector('[name="className"]').value;
          const list = sortByClassThenName(DB.all('students').filter(s=>s.class===className));
          if(!list.length){ UI.toast('No students in that class yet','error'); return; }
          printIDCards(list);
          close();
        });
      }
    });
  });

  function renderTable(){
    let rows = DB.all('students');
    if(scoped) rows = rows.filter(s=>scoped.includes(s.class));
    rows = sortByClassThenName(rows);
    UI.dataTable(container.querySelector('#tbl'), {
      stateKey:'students',
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
      footHTML:`<button class="btn btn-outline" data-attendance style="margin-right:auto;">${ICONS.attendance(14)} Attendance History</button><button class="btn btn-outline" data-idcard>${ICONS.id(14)} ID Card</button><button class="btn btn-outline" data-close>Close</button>`,
      onMount:(modal)=>{
        modal.querySelector('[data-attendance]').addEventListener('click', ()=> openStudentAttendance(s));
        modal.querySelector('[data-idcard]').addEventListener('click', ()=> printIDCards([s]));
      }
    });
  }

  /* Attendance is normally only ever entered, day by day, from the
     Attendance page — there was no way to look back at a student's
     history, or fix a mistake (wrong student marked, wrong status
     picked, a stray entry on a non-school day). This is that missing
     view: every record for this student, editable in place, plus a
     delete for entries that shouldn't exist at all. */
  const MONTH_NAMES_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const STATUS_ABBR = {Present:'PRE', Absent:'ABS', Late:'LAT', Sick:'SIC', Travel:'TRV'};

  /* Attendance used to be a flat list of every entry ever made — fine
     for corrections, but not something you'd hand a parent at PTA or
     Open Day. This is a proper month calendar (the view most parents
     already read intuitively) with month navigation and a clean print
     output, plus the original correction list still available behind
     a toggle for staff who need to fix a mistaken entry. */
  function openStudentAttendance(s){
    const canEditAttendance = ['Super Admin','Principal','Head Teacher','Teacher'].includes(ctx.user.role);
    const now = new Date();
    let viewYear = now.getFullYear();
    let viewMonth = now.getMonth(); // 0-indexed
    let mode = 'calendar'; // 'calendar' | 'list'

    function records(){
      return DB.all('attendanceRecords').filter(r=>r.studentId===s.id);
    }
    function overallSummary(){
      const recs = records();
      const total = recs.length;
      const present = recs.filter(r=>attendanceCountsPresent(r.status)).length;
      const pct = total ? Math.round(present/total*100) : 0;
      return {total, present, pct};
    }

    function calendarHTML(){
      const byDate = {};
      records().forEach(r=> byDate[r.date] = r);
      const firstOfMonth = new Date(viewYear, viewMonth, 1);
      const startWeekday = firstOfMonth.getDay();
      const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
      const todayStr = new Date().toISOString().slice(0,10);
      const weekdayHead = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
        .map(d=>`<div style="text-align:center;font-size:11px;font-weight:700;color:var(--ink-faint);padding:4px 0;">${d}</div>`).join('');

      let cells = '';
      for(let i=0;i<startWeekday;i++) cells += `<div></div>`;
      for(let d=1; d<=daysInMonth; d++){
        const dateStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const rec = byDate[dateStr];
        const schoolDay = isSchoolDay(dateStr);
        const isFuture = dateStr > todayStr;
        const isToday = dateStr === todayStr;
        let badge = '';
        if(rec){
          badge = `<div style="margin-top:3px;font-size:10px;font-weight:700;letter-spacing:.03em;color:#fff;background:${attendanceDotColor(rec.status)};border-radius:5px;padding:2px 0;">${STATUS_ABBR[rec.status]||rec.status.slice(0,3).toUpperCase()}</div>`;
        } else if(!schoolDay){
          badge = `<div style="margin-top:3px;font-size:9.5px;color:var(--ink-faint);">off</div>`;
        } else if(!isFuture){
          badge = `<div style="margin-top:3px;font-size:10px;color:var(--ink-faint);">—</div>`;
        }
        cells += `<div style="text-align:center;padding:6px 2px;border-radius:8px;${isToday?'outline:2px solid var(--green-500);':''}${!schoolDay?'opacity:.55;':''}">
          <div style="font-size:12.5px;font-weight:${isToday?'700':'500'};">${d}</div>${badge}
        </div>`;
      }
      return `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">${weekdayHead}${cells}</div>`;
    }

    function legendHTML(){
      const items = [['Present','Present'],['Late','Late'],['Absent','Absent'],['Sick','Sick'],['Travel','Travel']];
      return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;font-size:11px;color:var(--ink-faint);">
        ${items.map(([status,label])=>`<span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:3px;background:${attendanceDotColor(status)};display:inline-block;"></span>${label}</span>`).join('')}
      </div>`;
    }

    function listHTML(){
      const recs = records().slice().sort((a,b)=> b.date.localeCompare(a.date));
      return `
        <div id="att-hist-list">
          ${recs.length ? recs.map(r=>`
            <div class="activity-item">
              <div class="activity-dot" style="background:${attendanceDotColor(r.status)}"></div>
              <div style="flex:1;"><div class="t">${UI.fmtDate(r.date)}</div></div>
              ${canEditAttendance ? `
                <select data-status="${r.id}" style="width:auto;margin-right:8px;">
                  ${ATTENDANCE_STATUSES.map(st=>`<option value="${st}" ${r.status===st?'selected':''}>${st}</option>`).join('')}
                </select>
                <button class="icon-action" data-del-att="${r.id}">${ICONS.trash(13)}</button>
              ` : UI.badge(r.status, attendanceBadgeTone(r.status))}
            </div>`).join('') : UI.emptyState('No attendance recorded yet for this student')}
        </div>
      `;
    }

    function bodyHTML(){
      const sum = overallSummary();
      return `
        <div class="grid grid-3" style="gap:10px;margin-bottom:16px;">
          <div class="card-flat"><div class="row-sub">Days recorded</div><div class="value mono" style="font-size:18px;">${sum.total}</div></div>
          <div class="card-flat"><div class="row-sub">Days present</div><div class="value mono" style="font-size:18px;">${sum.present}</div></div>
          <div class="card-flat"><div class="row-sub">Attendance rate</div><div class="value mono" style="font-size:18px;">${sum.pct}%</div></div>
        </div>
        <div class="tabs" style="margin-bottom:14px;">
          <div class="tab ${mode==='calendar'?'active':''}" data-mode="calendar">Calendar</div>
          ${canEditAttendance ? `<div class="tab ${mode==='list'?'active':''}" data-mode="list">List / Corrections</div>` : ''}
        </div>
        ${mode==='calendar' ? `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <button class="icon-action" data-month="-1">${ICONS.chevronLeft(15)}</button>
            <div style="font-weight:700;">${MONTH_NAMES_FULL[viewMonth]} ${viewYear}</div>
            <button class="icon-action" data-month="1">${ICONS.chevronRight(15)}</button>
          </div>
          ${calendarHTML()}
          ${legendHTML()}
        ` : listHTML()}
      `;
    }

    UI.openModal({
      title: `Attendance — ${s.name}`,
      large:true,
      bodyHTML: bodyHTML(),
      footHTML:`<button class="btn btn-outline print-hide" data-print-att style="margin-right:auto;">${ICONS.print(14)} Print</button><button class="btn btn-primary" data-close>Close</button>`,
      onMount:(modal)=>{
        function rewire(){
          modal.querySelector('.modal-body').innerHTML = bodyHTML();
          modal.querySelectorAll('[data-mode]').forEach(t=>t.addEventListener('click', ()=>{ mode = t.dataset.mode; rewire(); }));
          modal.querySelectorAll('[data-month]').forEach(b=>b.addEventListener('click', ()=>{
            viewMonth += Number(b.dataset.month);
            if(viewMonth<0){ viewMonth=11; viewYear--; }
            if(viewMonth>11){ viewMonth=0; viewYear++; }
            rewire();
          }));
          modal.querySelectorAll('[data-status]').forEach(sel=>sel.addEventListener('change', ()=>{
            DB.update('attendanceRecords', sel.dataset.status, {status: sel.value});
            UI.toast('Attendance corrected');
            rewire();
          }));
          modal.querySelectorAll('[data-del-att]').forEach(b=>b.addEventListener('click', ()=>{
            UI.confirmDialog('Remove this attendance entry entirely? Use this for records that shouldn\'t exist (wrong student, wrong day) rather than for a genuine absence.', ()=>{
              DB.remove('attendanceRecords', b.dataset.delAtt);
              UI.toast('Attendance entry removed');
              rewire();
            });
          }));
        }
        rewire();
        modal.querySelector('[data-print-att]').addEventListener('click', ()=> printAttendanceRecord(s, records()));
      }
    });
  }

  /* Clean, letterheaded, printable attendance record — built for
     handing to a parent at PTA or Open Day, not for on-screen editing.
     Groups every recorded day by month, with the same overall summary
     shown in the modal. */
  function printAttendanceRecord(student, recs){
    const settings = DB.settings();
    const sorted = recs.slice().sort((a,b)=> a.date.localeCompare(b.date));
    const total = sorted.length;
    const present = sorted.filter(r=>attendanceCountsPresent(r.status)).length;
    const pct = total ? Math.round(present/total*100) : 0;

    const byMonth = {};
    sorted.forEach(r=>{
      const key = r.date.slice(0,7);
      if(!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(r);
    });

    const monthSections = Object.keys(byMonth).sort().map(key=>{
      const [y,m] = key.split('-').map(Number);
      const rows = byMonth[key].map(r=>`<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">${UI.fmtDate(r.date)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;">${r.status}</td></tr>`).join('');
      return `<div style="margin-bottom:18px; break-inside:avoid;">
        <h3 style="font-size:13px;margin:0 0 6px;color:#1a6b4a;">${MONTH_NAMES_FULL[m-1]} ${y}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr><th style="text-align:left;padding:4px 8px;border-bottom:2px solid #1a6b4a;">Date</th><th style="text-align:left;padding:4px 8px;border-bottom:2px solid #1a6b4a;">Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Attendance — ${student.name}</title>
    <style>
      body{font-family:Georgia,'Times New Roman',serif; padding:34px; color:#222;}
      .header{display:flex;align-items:center;gap:14px;border-bottom:2px solid #1a6b4a;padding-bottom:14px;margin-bottom:22px;}
      .header img{width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #1a6b4a;}
      .school-name{font-size:18px;font-weight:bold;color:#1a6b4a;}
      .summary{display:flex;gap:16px;margin-bottom:26px;}
      .summary div{border:1px solid #ddd;border-radius:8px;padding:10px 18px;text-align:center;}
      .summary b{display:block;font-size:20px;color:#1a6b4a;}
      .cols{columns:2; column-gap:28px;}
      @media print { .cols{columns:2;} }
    </style></head>
    <body>
      <div class="header">
        ${settings.logoDataUrl?`<img src="${settings.logoDataUrl}"/>`:''}
        <div>
          <div class="school-name">${settings.schoolName||''}</div>
          <div style="font-size:11px;">${settings.address||''}</div>
        </div>
      </div>
      <h2 style="margin:0 0 2px;">Attendance Record</h2>
      <div style="font-size:13px;color:#555;margin-bottom:20px;">${student.name} · ${student.admissionNo} · ${student.class}</div>
      <div class="summary">
        <div><b>${total}</b>Days Recorded</div>
        <div><b>${present}</b>Days Present</div>
        <div><b>${pct}%</b>Attendance Rate</div>
      </div>
      <div class="cols">${monthSections || '<p>No attendance recorded yet.</p>'}</div>
    </body></html>`;

    const blob = new Blob([html], {type:'text/html'});
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    iframe.onload = ()=>{ iframe.contentWindow.focus(); iframe.contentWindow.print(); };
    iframe.src = url;
    setTimeout(()=>{ URL.revokeObjectURL(url); iframe.remove(); }, 60000);
  }

  /* Bulk-add students from a CSV export (Excel/Google Sheets). Shows a
     preview before committing anything — rows missing a required
     field, or naming a class that doesn't exist yet in Academics, are
     flagged and simply skipped rather than silently guessed at or
     blocking the whole import. */
  function openImportStudents(){
    let parsedRows = [];
    UI.openModal({
      title:'Import students from CSV',
      large:true,
      bodyHTML:`
        <div class="row-sub" style="margin-bottom:12px;">
          Expected columns: ${CSV_STUDENT_COLUMNS.map(c=>c.header).join(', ')}.<br/>
          Class names must exactly match a class already set up in Academics → Classes &amp; Subjects.
          <a href="#" id="download-template">Download a template CSV</a> to see the exact format.
        </div>
        <input type="file" accept=".csv" id="csv-file"/>
        <div id="csv-preview" style="margin-top:16px;"></div>
      `,
      footHTML:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" id="confirm-import" disabled>Import</button>`,
      onMount:(modal, close)=>{
        modal.querySelector('[data-cancel]').addEventListener('click', close);

        modal.querySelector('#download-template').addEventListener('click', (e)=>{
          e.preventDefault();
          const headerLine = CSV_STUDENT_COLUMNS.map(c=>c.header).join(',');
          const sampleClass = getClassNames()[0] || 'Primary 1';
          const example = `Aisha Bello,ABMA/2025/0100,Female,${sampleClass},2018-04-12,Bello Musa,08012345678,,No 4 Example Street,Active`;
          const blob = new Blob([headerLine+'\n'+example], {type:'text/csv'});
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = 'student-import-template.csv'; a.click();
        });

        modal.querySelector('#csv-file').addEventListener('change', (e)=>{
          const file = e.target.files[0];
          if(!file) return;
          const reader = new FileReader();
          reader.onload = ev=>{
            const rows = parseCSV(ev.target.result);
            if(!rows.length){ UI.toast('That file looks empty','error'); return; }
            const headerRow = rows[0].map(h=>h.trim());
            const colIndex = {};
            CSV_STUDENT_COLUMNS.forEach(c=>{
              colIndex[c.key] = headerRow.findIndex(h=>h.toLowerCase()===c.header.toLowerCase());
            });
            const existingClasses = getClassNames();
            parsedRows = rows.slice(1).map(r=>{
              const rec = {};
              CSV_STUDENT_COLUMNS.forEach(c=>{
                rec[c.key] = colIndex[c.key]>=0 ? (r[colIndex[c.key]]||'').trim() : '';
              });
              rec._reason = !rec.name ? 'Missing name'
                : !rec.admissionNo ? 'Missing admission no.'
                : !rec.class ? 'Missing class'
                : !existingClasses.includes(rec.class) ? `Class "${rec.class}" doesn't exist yet`
                : '';
              rec._valid = !rec._reason;
              return rec;
            });

            const validCount = parsedRows.filter(r=>r._valid).length;
            modal.querySelector('#csv-preview').innerHTML = `
              <div class="row-sub" style="margin-bottom:8px;">${validCount} of ${parsedRows.length} row(s) ready to import.</div>
              <div class="table-wrap"><div class="scroll-x"><table>
                <thead><tr><th>Name</th><th>Admission No</th><th>Class</th><th>Status</th></tr></thead>
                <tbody>${parsedRows.slice(0,50).map(r=>`<tr>
                  <td>${r.name||'—'}</td><td>${r.admissionNo||'—'}</td><td>${r.class||'—'}</td>
                  <td>${r._valid ? UI.badge('Ready','green') : UI.badge(r._reason,'red')}</td>
                </tr>`).join('')}</tbody>
              </table></div></div>
              ${parsedRows.length>50 ? `<div class="row-sub" style="margin-top:6px;">Showing first 50 of ${parsedRows.length} rows.</div>` : ''}
            `;
            modal.querySelector('#confirm-import').disabled = validCount===0;
          };
          reader.readAsText(file);
        });

        modal.querySelector('#confirm-import').addEventListener('click', ()=>{
          const toImport = parsedRows.filter(r=>r._valid);
          toImport.forEach(r=>{
            DB.add('students', {
              name:r.name, admissionNo:r.admissionNo, gender:r.gender||'', class:r.class,
              dob:r.dob||'', guardian:r.guardian||'', phone:r.phone||'', email:r.email||'',
              address:r.address||'', status:r.status||'Active', feeStatus:'Pending'
            });
          });
          UI.toast(`Imported ${toImport.length} student(s)`); close(); renderTable();
        });
      }
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
      {name:'classes', label:'Assigned classes — a class can have more than one teacher, and a teacher can be assigned to more than one class', type:'multiselect', options:getClassNames(), full:true},
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
      stateKey:'teachers',
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
      stateKey:'staff',
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
