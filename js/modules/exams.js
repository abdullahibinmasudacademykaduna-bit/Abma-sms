/* Greenwood SMS — Examination & Result management
   Scoring: CA1 (0-20) + CA2 (0-20) + Exam (0-60) = Total (100).
   Results are stored one record per (student, exam): a subjects
   array plus behavioural ratings, comments and next-term info —
   everything the printed report card needs in one place.

   Printing uses a self-contained hidden iframe (a fresh Blob
   document with its own <style>, no dependency on the app's own
   CSS or JS) rather than trying to isolate part of the current
   page — that's what avoids blank leading pages and guarantees
   the printout always looks the same regardless of app theme. */
window.MODULES = window.MODULES || {};

const DEFAULT_GRADING_SCALE = [
  {min:80, max:100, grade:'A', remark:'Excellent'},
  {min:70, max:79,  grade:'B', remark:'Very Good'},
  {min:60, max:69,  grade:'C', remark:'Good'},
  {min:50, max:59,  grade:'D', remark:'Pass'},
  {min:0,  max:49,  grade:'F', remark:'Fail'},
];
const AFFECTIVE_TRAITS = ['Punctuality','Neatness','Politeness','Honesty','Cooperation','Attentiveness'];
const PSYCHOMOTOR_TRAITS = ['Handwriting','Games & Sports','Drawing & Painting','Craft Work','Verbal Fluency'];

function gradingScale(){
  const s = DB.settings().gradingScale;
  return (s && s.length) ? s : DEFAULT_GRADING_SCALE;
}
function gradeFor(total){
  const scale = gradingScale();
  return scale.find(b => total>=b.min && total<=b.max) || scale[scale.length-1];
}
function gradeClass(g){ return {A:'rc-grade-a',B:'rc-grade-b',C:'rc-grade-c',D:'rc-grade-d',F:'rc-grade-f'}[g] || ''; }
function ordinal(n){
  const s = ['th','st','nd','rd'], v = n%100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}
function attendanceStats(studentId){
  const recs = DB.all('attendanceRecords').filter(r=>r.studentId===studentId);
  const opened = new Set(recs.map(r=>r.date)).size;
  const present = recs.filter(r=>r.status!=='Absent').length;
  return { opened, present };
}
function classStats(examId, className){
  const students = DB.all('students').filter(s=>s.class===className);
  const results = DB.all('results').filter(r=>r.examId===examId && students.some(s=>s.id===r.studentId));
  const ranked = results.slice().sort((a,b)=> b.overallTotal - a.overallTotal);
  return { classSize: students.length, ranked };
}
function positionFor(examId, className, studentId){
  const {classSize, ranked} = classStats(examId, className);
  const idx = ranked.findIndex(r=>r.studentId===studentId);
  return { classSize, position: idx===-1 ? null : idx+1 };
}

/* Professional, position-aware auto comment. Used as a suggestion
   whenever the teacher/head leaves their remark field blank. */
function autoComment(avg, position, classSize, isHead){
  const rankPhrase = (position && classSize)
    ? (position===1 ? `, ranking 1st out of ${classSize} pupils this term`
       : position<=3 ? `, placing ${ordinal(position)} out of ${classSize} pupils this term`
       : '')
    : '';
  if(avg>=80) return isHead
    ? `An outstanding academic performance${rankPhrase}. Well done — this standard of work is commendable and should be sustained.`
    : `An outstanding performance this term${rankPhrase}. Keep up the excellent work and continue striving for the very best.`;
  if(avg>=70) return isHead
    ? `A very good result${rankPhrase}. Consistent effort is evident; continued encouragement will help push this further.`
    : `A very good result this term${rankPhrase}. Your consistent effort is clearly paying off — keep it up.`;
  if(avg>=60) return isHead
    ? `A good result${rankPhrase}. Steady progress is being made; more consistent practice at home would help.`
    : `A good result this term${rankPhrase}. There is still room to improve with more consistent practice.`;
  if(avg>=50) return isHead
    ? `A fair result this term. Additional encouragement and closer monitoring of homework are recommended.`
    : `A fair result this term. More effort and regular revision are needed to see stronger improvement next term.`;
  return isHead
    ? `This result falls below expectation. Extra academic support and closer parental involvement are strongly recommended.`
    : `This result falls below expectation this term. Extra support and more consistent study habits are strongly recommended.`;
}

MODULES.exams = function(container, ctx){
  const canSchedule = ['Super Admin','Principal','Head Teacher'].includes(ctx.user.role);
  const canPromote = ['Super Admin','Principal','Head Teacher'].includes(ctx.user.role);
  const classOptions = visibleClasses(ctx);

  const tabs = [
    {key:'exams', label:'Exams'},
    {key:'results', label:'Results'},
    {key:'performance', label:'Performance'},
  ];
  if(canPromote) tabs.push({key:'promotion', label:'Promotion'});

  container.innerHTML = `
    ${UI.pageHeader('Academics', 'Examination & Result Management', canSchedule? `<button class="btn btn-primary" id="add-exam">${ICONS.plus(16)} Schedule Exam</button>`:'')}
    <div class="tabs">${tabs.map((t,i)=>`<div class="tab ${i===0?'active':''}" data-tab="${t.key}">${t.label}</div>`).join('')}</div>
    <div id="tab-body"></div>
  `;
  const body = container.querySelector('#tab-body');
  const renderers = {exams:renderExams, results:renderResults, performance:renderPerformance, promotion:renderPromotion};
  container.querySelectorAll('.tab').forEach(t=>{
    t.addEventListener('click', ()=>{
      container.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
      renderers[t.dataset.tab]();
    });
  });

  function examFields(){
    return [
      {name:'name', label:'Exam name', required:true, full:true},
      {name:'term', label:'Term', type:'select', options:['Term 1','Term 2','Term 3']},
      {name:'session', label:'Session', placeholder:'e.g. 2025/2026'},
      {name:'startDate', label:'Start date', type:'date'},
      {name:'endDate', label:'End date', type:'date'},
      {name:'status', label:'Status', type:'select', options:['Scheduled','Ongoing','Completed']},
    ];
  }
  function openExamForm(record){
    const f = examFields();
    UI.openModal({
      title: record?'Edit exam':'Schedule exam',
      bodyHTML: UI.renderForm(f, record||{term:'Term 2', session:DB.settings().session||'2025/2026', status:'Scheduled'}),
      footHTML:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save</button>`,
      onMount:(modal, close)=>{
        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-save]').addEventListener('click', ()=>{
          const data = UI.readForm(modal, f);
          if(!data.name){ UI.toast('Exam name required','error'); return; }
          if(record) DB.update('exams', record.id, data); else DB.add('exams', data);
          UI.toast('Exam saved'); close(); renderExams();
        });
      }
    });
  }
  container.querySelector('#add-exam')?.addEventListener('click', ()=>openExamForm(null));

  function renderExams(){
    body.innerHTML = `<div class="table-wrap" id="exam-tbl"></div>`;
    UI.dataTable(body.querySelector('#exam-tbl'), {
      rows: DB.all('exams'),
      searchKeys:['name','term'],
      searchPlaceholder:'Search exams…',
      filters:[{key:'status', label:'Status', options:['Scheduled','Ongoing','Completed']}],
      columns:[
        {label:'Exam', key:'name'},
        {label:'Term', render:r=>`${r.term} ${r.session?'· '+r.session:''}`},
        {label:'Start', render:r=>UI.fmtDate(r.startDate)},
        {label:'End', render:r=>UI.fmtDate(r.endDate)},
        {label:'Status', render:r=>UI.badge(r.status, UI.statusTone(r.status))},
      ],
      actions: r=>canSchedule? `<button class="icon-action" data-edit="${r.id}">${ICONS.edit(14)}</button><button class="icon-action" data-del="${r.id}">${ICONS.trash(14)}</button>` : '',
      onRender:(el)=>{
        el.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', ()=>openExamForm(DB.get('exams', b.dataset.edit))));
        el.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click', ()=>UI.confirmDialog('Delete this exam?', ()=>{DB.remove('exams', b.dataset.del); renderExams(); UI.toast('Exam removed');})));
      }
    });
  }

  /* ---------------- Results ---------------- */
  function renderResults(){
    if(!classOptions.length){
      body.innerHTML = UI.emptyState('No class assigned yet', 'Ask a Super Admin or Principal to assign you a class in Teacher Management.');
      return;
    }
    const exams = DB.all('exams');
    if(!exams.length){
      body.innerHTML = UI.emptyState('No exams scheduled yet', 'Schedule an exam first from the Exams tab.');
      return;
    }
    body.innerHTML = `
      <div class="card" style="margin-bottom:16px;">
        <div class="section-title">
          Enter results
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <select id="res-exam" style="width:auto;">${exams.map(e=>`<option value="${e.id}">${e.name} (${e.term})</option>`).join('')}</select>
            <select id="res-class" style="width:auto;">${classOptions.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
            <select id="res-student" style="width:auto;"></select>
          </div>
        </div>
        <div id="res-form"></div>
      </div>
      <div class="card">
        <div class="section-title">
          Saved results for this class &amp; exam
          <button class="btn btn-sm btn-outline" id="print-class-btn">${ICONS.print(13)} Print whole class</button>
        </div>
        <div id="res-list"></div>
      </div>
    `;
    const examSel = body.querySelector('#res-exam');
    const classSel = body.querySelector('#res-class');
    const studentSel = body.querySelector('#res-student');

    function refreshStudentOptions(){
      const students = DB.all('students').filter(s=>s.class===classSel.value);
      studentSel.innerHTML = students.map(s=>`<option value="${s.id}">${s.name}</option>`).join('') || `<option value="">No students</option>`;
    }
    function renderScoreForm(){
      const examId = examSel.value, studentId = studentSel.value;
      const student = DB.get('students', studentId);
      const host = body.querySelector('#res-form');
      if(!student){ host.innerHTML = UI.emptyState('No student selected'); return; }
      const subjects = subjectsForClass(student.class);
      const existing = DB.all('results').find(r=>r.studentId===studentId && r.examId===examId);
      const canEditHeadRemark = ['Super Admin','Principal','Head Teacher'].includes(ctx.user.role);

      host.innerHTML = `
        <div class="table-wrap" style="margin-top:14px;"><div class="scroll-x"><table>
          <thead><tr><th>Subject</th><th>CA1 (20)</th><th>CA2 (20)</th><th>Exam (60)</th><th>Total</th><th>Grade</th></tr></thead>
          <tbody>
          ${subjects.map((sub,i)=>{
            const ex = existing?.subjects.find(s=>s.name===sub);
            return `<tr data-subject="${sub}">
              <td class="row-name">${sub}</td>
              <td><input type="number" min="0" max="20" data-field="ca1" style="width:64px;" value="${ex?ex.ca1:''}"/></td>
              <td><input type="number" min="0" max="20" data-field="ca2" style="width:64px;" value="${ex?ex.ca2:''}"/></td>
              <td><input type="number" min="0" max="60" data-field="exam" style="width:64px;" value="${ex?ex.exam:''}"/></td>
              <td class="mono" data-total>${ex?ex.total:'—'}</td>
              <td data-grade>${ex?UI.badge(ex.grade, ex.grade==='F'?'red':(ex.grade==='A'?'green':'blue')):'—'}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table></div></div>

        <div class="grid grid-2" style="margin-top:16px;">
          <div class="card-flat">
            <div class="section-title" style="margin-bottom:10px;">Affective skills (1–5)</div>
            ${AFFECTIVE_TRAITS.map(t=>`<div class="field" style="margin-bottom:8px;"><label>${t}</label><select data-trait="${t}">${[1,2,3,4,5].map(n=>`<option value="${n}" ${existing?.behavioural?.[t]==n?'selected':''}>${n}</option>`).join('')}</select></div>`).join('')}
          </div>
          <div class="card-flat">
            <div class="section-title" style="margin-bottom:10px;">Psychomotor skills (1–5)</div>
            ${PSYCHOMOTOR_TRAITS.map(t=>`<div class="field" style="margin-bottom:8px;"><label>${t}</label><select data-trait="${t}">${[1,2,3,4,5].map(n=>`<option value="${n}" ${existing?.behavioural?.[t]==n?'selected':''}>${n}</option>`).join('')}</select></div>`).join('')}
          </div>
        </div>

        <div class="grid grid-2" style="margin-top:16px;">
          <div class="field"><label>Class Teacher's remark <span class="row-sub">(leave blank to auto-generate)</span></label><textarea id="remark-class" rows="3">${existing?.remarkClass||''}</textarea></div>
          <div class="field"><label>Head Teacher's remark ${canEditHeadRemark?'<span class="row-sub">(leave blank to auto-generate)</span>':'(read-only for your role)'}</label><textarea id="remark-head" rows="3" ${canEditHeadRemark?'':'disabled'}>${existing?.remarkHead||''}</textarea></div>
          <div class="field"><label>Next term begins</label><input type="date" id="next-begin" value="${existing?.nextTermBegin||''}"/></div>
          <div class="field"><label>Next term fee</label><input type="number" id="next-fee" value="${existing?.nextTermFee||''}"/></div>
        </div>
        <div style="margin-top:16px;text-align:right;display:flex;gap:10px;justify-content:flex-end;">
          ${existing? `<button class="btn btn-outline" id="view-card">${ICONS.eye(14)} View report card</button>` : ''}
          <button class="btn btn-primary" id="save-result">${ICONS.check(15)} Save result</button>
        </div>
      `;

      function recalcRow(tr){
        const ca1 = Number(tr.querySelector('[data-field="ca1"]').value)||0;
        const ca2 = Number(tr.querySelector('[data-field="ca2"]').value)||0;
        const exam = Number(tr.querySelector('[data-field="exam"]').value)||0;
        const total = ca1+ca2+exam;
        const band = gradeFor(total);
        tr.querySelector('[data-total]').textContent = total;
        tr.querySelector('[data-grade]').innerHTML = UI.badge(band.grade, band.grade==='F'?'red':(band.grade==='A'?'green':'blue'));
      }
      host.querySelectorAll('tr[data-subject] input').forEach(inp=>{
        inp.addEventListener('input', ()=> recalcRow(inp.closest('tr')));
      });

      host.querySelector('#save-result')?.addEventListener('click', ()=>{
        const subjectRows = Array.from(host.querySelectorAll('tr[data-subject]')).map(tr=>{
          const ca1 = Number(tr.querySelector('[data-field="ca1"]').value)||0;
          const ca2 = Number(tr.querySelector('[data-field="ca2"]').value)||0;
          const exam = Number(tr.querySelector('[data-field="exam"]').value)||0;
          const total = ca1+ca2+exam;
          const band = gradeFor(total);
          return {name: tr.dataset.subject, ca1, ca2, exam, total, grade: band.grade, remark: band.remark};
        });
        const overallTotal = subjectRows.reduce((s,r)=>s+r.total,0);
        const avg = Math.round(overallTotal/subjectRows.length);
        const behavioural = {};
        host.querySelectorAll('[data-trait]').forEach(sel=> behavioural[sel.dataset.trait] = Number(sel.value));
        const typedClassRemark = host.querySelector('#remark-class').value.trim();
        const typedHeadRemark = host.querySelector('#remark-head').value.trim();

        // Step 1: save with a provisional (position-less) auto comment if left blank,
        // so this result counts toward the class ranking used in step 2.
        const payload = {
          studentId, examId, subjects: subjectRows, overallTotal, behavioural,
          remarkClass: typedClassRemark || autoComment(avg, null, null, false),
          remarkHead: canEditHeadRemark ? (typedHeadRemark || autoComment(avg, null, null, true)) : (existing?.remarkHead || autoComment(avg, null, null, true)),
          nextTermBegin: host.querySelector('#next-begin').value,
          nextTermFee: Number(host.querySelector('#next-fee').value)||0,
          session: DB.get('exams', examId)?.session || '',
          savedAt: new Date().toISOString(),
        };
        const saved = existing ? DB.update('results', existing.id, payload) : DB.add('results', payload);

        // Step 2: now that this result is counted, refine any auto-generated
        // remark with the real position/class-size context.
        if(!typedClassRemark || (canEditHeadRemark && !typedHeadRemark)){
          const {position, classSize} = positionFor(examId, student.class, studentId);
          const patch = {};
          if(!typedClassRemark) patch.remarkClass = autoComment(avg, position, classSize, false);
          if(canEditHeadRemark && !typedHeadRemark) patch.remarkHead = autoComment(avg, position, classSize, true);
          DB.update('results', saved.id, patch);
        }

        UI.toast('Result saved');
        renderScoreForm();
        renderSavedList();
      });

      host.querySelector('#view-card')?.addEventListener('click', ()=> openReportCard(studentId, examId));
    }

    function renderSavedList(){
      const students = DB.all('students').filter(s=>s.class===classSel.value);
      const rows = DB.all('results').filter(r=>r.examId===examSel.value && students.some(s=>s.id===r.studentId))
        .map(r=>({...r, studentName: students.find(s=>s.id===r.studentId)?.name, avg: Math.round(r.overallTotal/r.subjects.length)}));
      const listHost = body.querySelector('#res-list');
      if(!rows.length){ listHost.innerHTML = UI.emptyState('No results saved yet for this class & exam'); return; }
      listHost.innerHTML = `<div class="table-wrap"><div class="scroll-x"><table>
        <thead><tr><th>Student</th><th>Average</th><th>Position</th><th></th></tr></thead>
        <tbody>${rows.sort((a,b)=>b.overallTotal-a.overallTotal).map((r,i)=>`
          <tr><td class="row-name">${r.studentName}</td><td class="mono">${r.avg}%</td><td>${ordinal(i+1)}</td>
          <td><button class="btn btn-sm btn-outline" data-card="${r.studentId}">${ICONS.print(13)} Report</button></td></tr>
        `).join('')}</tbody>
      </table></div></div>`;
      listHost.querySelectorAll('[data-card]').forEach(b=>b.addEventListener('click', ()=> launchPrint([{studentId:b.dataset.card, examId:examSel.value}])));
    }

    examSel.addEventListener('change', ()=>{ renderScoreForm(); renderSavedList(); });
    classSel.addEventListener('change', ()=>{ refreshStudentOptions(); renderScoreForm(); renderSavedList(); });
    studentSel.addEventListener('change', renderScoreForm);
    body.querySelector('#print-class-btn').addEventListener('click', ()=>{
      const students = DB.all('students').filter(s=>s.class===classSel.value);
      const items = DB.all('results')
        .filter(r=>r.examId===examSel.value && students.some(s=>s.id===r.studentId))
        .map(r=>({studentId:r.studentId, examId:r.examId}));
      if(!items.length){ UI.toast('No saved results to print for this class & exam','error'); return; }
      launchPrint(items);
    });

    refreshStudentOptions();
    renderScoreForm();
    renderSavedList();
  }

  /* ---------------- Performance ---------------- */
  function renderPerformance(){
    const scoped = getScopedClasses(ctx);
    const students = scoped ? DB.all('students').filter(s=>scoped.includes(s.class)) : DB.all('students');
    const studentIds = new Set(students.map(s=>s.id));
    const flatSubjects = DB.all('results').filter(r=>studentIds.has(r.studentId)).flatMap(r=>r.subjects);
    const subjectNames = [...new Set(flatSubjects.map(s=>s.name))];
    const avgBySubject = subjectNames.map(name=>{
      const scores = flatSubjects.filter(s=>s.name===name).map(s=>s.total);
      return scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
    });
    const gradeCount = {A:0,B:0,C:0,D:0,F:0};
    flatSubjects.forEach(s=> gradeCount[s.grade] = (gradeCount[s.grade]||0)+1);
    body.innerHTML = flatSubjects.length ? `
      <div class="grid grid-2">
        <div class="card"><div class="section-title">Average score by subject</div><div style="height:260px;"><canvas id="perf-bar"></canvas></div></div>
        <div class="card"><div class="section-title">Grade distribution</div><div style="height:260px;"><canvas id="perf-doughnut"></canvas></div></div>
      </div>` : UI.emptyState('No results recorded yet', 'Enter some results first from the Results tab.');
    if(flatSubjects.length){
      CHARTS.bar('perf-bar', {labels:subjectNames, datasets:[{label:'Average score', data:avgBySubject}]});
      CHARTS.doughnut('perf-doughnut', {labels:Object.keys(gradeCount), data:Object.values(gradeCount)});
    }
  }

  /* ---------------- Promotion ---------------- */
  function renderPromotion(){
    body.innerHTML = `
      <div class="card">
        <div class="section-title">
          Batch promote students
          <select id="promo-class" style="width:auto;">${CLASS_NAMES.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
        </div>
        <p class="row-sub" style="margin-bottom:14px;">Select students to move up to the next class at the end of term/year.</p>
        <div id="promo-list"></div>
      </div>
    `;
    const classSel = body.querySelector('#promo-class');
    classSel.addEventListener('change', renderList);
    function renderList(){
      const cls = classSel.value;
      const next = nextClassName(cls);
      const students = DB.all('students').filter(s=>s.class===cls && s.status==='Active');
      body.querySelector('#promo-list').innerHTML = `
        <div class="table-wrap"><div class="scroll-x"><table>
          <thead><tr><th><input type="checkbox" id="promo-all"/></th><th>Student</th><th>Current class</th></tr></thead>
          <tbody>${students.map(s=>`<tr><td><input type="checkbox" class="promo-check" data-sid="${s.id}"/></td><td class="row-name">${s.name}</td><td>${s.class}</td></tr>`).join('') || `<tr><td colspan="3">${UI.emptyState('No active students in this class')}</td></tr>`}</tbody>
        </table></div></div>
        ${students.length ? `
        <div style="margin-top:14px;display:flex;gap:10px;align-items:center;justify-content:flex-end;">
          <span class="row-sub">Promote checked students to:</span>
          <select id="promo-target" style="width:auto;">${next ? `<option value="${next}">${next}</option>` : `<option value="">Graduate (no further class)</option>`}${CLASS_NAMES.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
          <button class="btn btn-primary" id="promo-go">${ICONS.check(15)} Promote selected</button>
        </div>` : ''}
      `;
      body.querySelector('#promo-all')?.addEventListener('change', e=>{
        body.querySelectorAll('.promo-check').forEach(cb=> cb.checked = e.target.checked);
      });
      body.querySelector('#promo-go')?.addEventListener('click', ()=>{
        const target = body.querySelector('#promo-target').value;
        const chosen = Array.from(body.querySelectorAll('.promo-check:checked')).map(cb=>cb.dataset.sid);
        if(!chosen.length){ UI.toast('Select at least one student','error'); return; }
        if(!target){ UI.toast('Choose a target class','error'); return; }
        UI.confirmDialog(`Move ${chosen.length} student(s) from ${cls} to ${target}?`, ()=>{
          chosen.forEach(id=> DB.update('students', id, {class: target}));
          UI.toast(`${chosen.length} student(s) promoted to ${target}`);
          renderList();
        });
      });
    }
    renderList();
  }

  renderExams();
};

/* =========================================================
   Report card: HTML builder + on-screen preview + printing
   ========================================================= */

/* Pure HTML string builder — no DOM side effects — reused by
   both the on-screen preview modal and the print pipeline. */
function buildReportCardHTML(studentId, examId, isPrint){
  const student = DB.get('students', studentId);
  const exam = DB.get('exams', examId);
  const result = DB.all('results').find(r=>r.studentId===studentId && r.examId===examId);
  if(!student || !exam || !result) return '<div class="rc"><p>No result found for this student.</p></div>';
  const settings = DB.settings();
  const {classSize, position} = positionFor(examId, student.class, studentId);
  const {opened, present} = attendanceStats(studentId);
  const avg = Math.round(result.overallTotal/result.subjects.length);
  const overallMax = result.subjects.length*100;
  const posText = position ? `${ordinal(position)} out of ${classSize} Pupils` : '—';
  const qrData = JSON.stringify({school:settings.schoolName, name:student.name, admissionNo:student.admissionNo, class:student.class, term:exam.term, session:result.session||exam.session, average:avg});
  const qrId = `qr-${studentId}-${examId}`;

  if(!isPrint){
    setTimeout(()=>{
      const host = document.getElementById(qrId);
      if(host && typeof QRCode!=='undefined'){
        host.innerHTML='';
        try{ new QRCode(host, {text:qrData, width:54, height:54, colorDark:'#000000', colorLight:'#ffffff'}); }catch(e){}
      }
    }, 60);
  }

  return `
  <div class="rc-school-header">
    <div class="rc-logo-wrap">${settings.logoDataUrl ? `<img src="${settings.logoDataUrl}"/>` : '&#127891;'}</div>
    <div>
      <div class="rc-school-name">${settings.schoolName||'Your School Name'}</div>
      <div class="rc-school-address">${settings.address||'School address, city'}</div>
      <div class="rc-motto">${settings.motto||'Your school motto'}</div>
    </div>
  </div>
  <div class="rc-section-bar">Academic Performance Report Sheet</div>
  <table class="rc-info-grid">
    <colgroup><col style="width:16%"><col style="width:26%"><col style="width:11%"><col style="width:16%"><col style="width:9%"><col style="width:22%"></colgroup>
    <tr><td class="rc-info-label">FULL NAME</td><td class="rc-info-value name" colspan="5">${student.name}</td></tr>
    <tr><td class="rc-info-label">ADMISSION NO</td><td class="rc-info-value">${student.admissionNo}</td><td class="rc-info-label">CLASS</td><td class="rc-info-value">${student.class}</td><td class="rc-info-label">SEX</td><td class="rc-info-value">${student.gender}</td></tr>
    <tr><td class="rc-info-label">TERM</td><td class="rc-info-value" colspan="2">${exam.term}</td><td class="rc-info-label">SESSION</td><td class="rc-info-value" colspan="2">${result.session||exam.session||'—'}</td></tr>
    <tr><td class="rc-info-label">NO. TIMES SCHOOL OPENED</td><td class="rc-info-value" colspan="2">${opened||'—'}</td><td class="rc-info-label">NO. TIMES PRESENT</td><td class="rc-info-value" colspan="2">${present||'—'}</td></tr>
  </table>
  <div class="rc-main-row">
    <div class="rc-subjects-col">
      <table class="rc-subjects"><thead><tr><th style="width:22px;">#</th><th style="text-align:left;">Subjects</th><th>CA1</th><th>CA2</th><th>Exam</th><th>Tot</th><th>Grd</th><th>Remark</th></tr></thead>
        <tbody>${result.subjects.map((s,i)=>`<tr><td>${i+1}</td><td>${s.name}</td><td>${s.ca1}</td><td>${s.ca2}</td><td>${s.exam}</td><td style="font-weight:700;">${s.total}</td><td class="${gradeClass(s.grade)}">${s.grade}</td><td>${s.remark}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="rc-side-col">
      <table class="rc-skills-table"><thead><tr><th>Affective Skills</th><th>Rtg</th></tr></thead>
        <tbody>${AFFECTIVE_TRAITS.map(t=>`<tr><td>${t}</td><td>${result.behavioural?.[t]??'—'}</td></tr>`).join('')}</tbody></table>
      <table class="rc-skills-table"><thead><tr><th>Psychomotor Skills</th><th>Rtg</th></tr></thead>
        <tbody>${PSYCHOMOTOR_TRAITS.map(t=>`<tr><td>${t}</td><td>${result.behavioural?.[t]??'—'}</td></tr>`).join('')}</tbody></table>
      <div class="rc-sig-panel"><div class="rc-sig-panel-label">Class Teacher's Signature</div><div class="rc-sig-panel-box"></div></div>
    </div>
  </div>
  <div class="rc-summary-row">
    <div class="rc-summary-box"><div class="rc-summary-label">Score Obtained</div><div class="rc-summary-value">${result.overallTotal}</div></div>
    <div class="rc-summary-box"><div class="rc-summary-label">Average Score</div><div class="rc-summary-value">${avg}</div></div>
    <div class="rc-summary-box"><div class="rc-summary-label">No in Class</div><div class="rc-summary-value">${classSize||'—'}</div></div>
    <div class="rc-summary-box"><div class="rc-summary-label">Position</div><div class="rc-summary-value">${position?ordinal(position):'—'}</div></div>
    <div class="rc-summary-box"><div class="rc-summary-label">Total</div><div class="rc-summary-value">${overallMax}</div></div>
  </div>
  <div class="rc-bottom-grid">
    <div>
      <div class="rc-sub-bar">Score Range / Grading Key</div>
      <table class="rc-grading"><thead><tr><th>Score Range</th><th>Grade</th><th>Remark</th></tr></thead>
      <tbody>${gradingScale().map(g=>`<tr><td>${g.min} - ${g.max}</td><td style="font-weight:700;">${g.grade}</td><td class="${g.grade==='F'?'rc-fail':''}">${g.remark}</td></tr>`).join('')}</tbody></table>
    </div>
    <div>
      <div class="rc-sub-bar">Rating Key</div>
      <div class="rc-rating-key">
        ${[[5,'Excellent'],[4,'Very Good'],[3,'Good'],[2,'Fair'],[1,'Poor']].map(([n,label])=>`<div class="rc-rating-line"><span class="rc-rating-num">${n}</span><span class="rc-rating-dots"></span><span class="rc-rating-label">${label}</span></div>`).join('')}
      </div>
    </div>
  </div>
  <div class="rc-term-row"><span>NEXT TERM BEGINS: <span class="val">${result.nextTermBegin?UI.fmtDate(result.nextTermBegin):'To be announced'}</span></span><span>NEXT TERM FEE: <span class="val">${result.nextTermFee?UI.fmtMoney(result.nextTermFee):'—'}</span></span></div>
  <div class="rc-remarks-box">
    <div class="rc-remark-row"><span class="rc-remark-label">Class Teacher's Remark:</span><span class="rc-remark-text">${result.remarkClass}</span></div>
    <div class="rc-remark-row"><span class="rc-remark-label">Head Teacher's Remark:</span><span class="rc-remark-text">${result.remarkHead}</span></div>
  </div>
  <div class="rc-footer">
    <div class="rc-footer-sig"><div class="rc-footer-sig-line"></div><div class="rc-footer-sig-label">Head Teacher's Signature</div></div>
    <div class="rc-stamp-box"><div>Official</div><div>Stamp</div></div>
    <div class="rc-qr"><div id="${qrId}" data-qrtext="${encodeURIComponent(qrData)}" style="width:54px;height:54px;"></div><div class="rc-qr-label">Scan to verify</div></div>
  </div>`;
}

/* On-screen preview modal (view + print single from here too). */
window.openReportCard = function(studentId, examId){
  const result = DB.all('results').find(r=>r.studentId===studentId && r.examId===examId);
  if(!result){ UI.toast('No result found for this student yet', 'error'); return; }
  UI.openModal({
    title: 'Report Card',
    large:true,
    bodyHTML: `<div id="report-printable"><div class="rc">${buildReportCardHTML(studentId, examId, false)}</div></div>`,
    footHTML: `<button class="btn btn-outline" data-close>Close</button><button class="btn btn-primary" id="print-card">${ICONS.print(15)} Print</button>`,
    onMount:(modalEl)=>{
      modalEl.querySelector('#print-card').addEventListener('click', ()=> launchPrint([{studentId, examId}]));
    }
  });
};

/* Self-contained print pipeline: renders one or many report cards
   into a hidden iframe with its own document (own <style>, no QR
   library needed there — QR codes are pre-rendered to PNG data
   URLs before the iframe is built), then calls print() inside it. */
const PRINT_CSS = `
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{height:auto;}
  body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#111;font-size:10.5px;}
  @page{size:A4 portrait;margin:8mm 10mm;}
  .pw{page-break-after:always;} .pw:last-child{page-break-after:avoid;}
  .rc{color:#111;font-size:10.5px;line-height:1.3;border:2px solid #1a6b4a;padding:14px 18px;}
  .rc-school-header{display:flex;align-items:center;gap:12px;margin-bottom:7px;padding-bottom:7px;border-bottom:3px double #1a6b4a;}
  .rc-logo-wrap{width:54px;height:54px;border-radius:50%;border:2px solid #1a6b4a;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:22px;background:#f0f7f3;overflow:hidden;}
  .rc-logo-wrap img{width:100%;height:100%;object-fit:cover;border-radius:50%;}
  .rc-school-name{font-size:15px;font-weight:900;color:#1a6b4a;text-transform:uppercase;letter-spacing:.3px;line-height:1.2;}
  .rc-school-address{font-size:9.5px;color:#333;margin-top:2px;line-height:1.4;font-weight:600;}
  .rc-motto{font-style:italic;font-weight:700;color:#c8922a;font-size:10px;margin-top:1px;}
  .rc-section-bar{text-align:center;font-weight:700;font-size:9.5px;letter-spacing:2px;padding:2px 0 6px;text-transform:uppercase;color:#1a6b4a;}
  .rc-info-grid{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:8px;font-size:10.5px;}
  .rc-info-grid td{border:1px solid #a8c9b8;padding:3.5px 7px;vertical-align:middle;overflow:hidden;}
  .rc-info-label{font-weight:700;color:#1a6b4a;background:#eaf4ee;font-size:9.5px;letter-spacing:.2px;white-space:normal;}
  .rc-info-value{font-weight:400;color:#111;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .rc-info-value.name{font-weight:900;font-size:12.5px;}
  .rc-main-row{display:flex;gap:12px;align-items:flex-start;margin-bottom:8px;}
  .rc-subjects-col{flex:1;min-width:0;}
  .rc-side-col{width:185px;flex-shrink:0;display:flex;flex-direction:column;gap:6px;}
  .rc-subjects{width:100%;border-collapse:collapse;font-size:10px;}
  .rc-subjects th{background:#1a6b4a;color:white;padding:4px 5px;text-align:center;font-weight:700;font-size:9px;}
  .rc-subjects th:nth-child(2){text-align:left;}
  .rc-subjects td{border:1px solid #ccc;padding:3px 5px;text-align:center;vertical-align:middle;}
  .rc-subjects td:nth-child(2){text-align:left;font-weight:500;}
  .rc-subjects tr:nth-child(even) td{background:#f4f9f6;}
  .rc-grade-a{color:#1a6b4a;font-weight:700;} .rc-grade-b{color:#2c4a7c;font-weight:700;}
  .rc-grade-c{color:#c8922a;font-weight:700;} .rc-grade-d{color:#888;font-weight:700;} .rc-grade-f{color:#b83232;font-weight:700;}
  .rc-skills-table{width:100%;border-collapse:collapse;font-size:9px;}
  .rc-skills-table th{background:#1a6b4a;color:white;padding:3px 6px;text-align:left;font-weight:700;font-size:8.5px;text-transform:uppercase;letter-spacing:.4px;}
  .rc-skills-table th:last-child{text-align:center;}
  .rc-skills-table td{border:1px solid #ccc;padding:2px 6px;vertical-align:middle;}
  .rc-skills-table td:last-child{text-align:center;font-weight:700;}
  .rc-skills-table tr:nth-child(even) td{background:#f4f9f6;}
  .rc-sig-panel{border:1px solid #ccc;padding:4px 6px;}
  .rc-sig-panel-label{font-size:8.5px;font-weight:700;color:#1a6b4a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;}
  .rc-sig-panel-box{height:20px;border-bottom:1px solid #999;}
  .rc-summary-row{display:flex;gap:5px;margin-bottom:8px;}
  .rc-summary-box{flex:1;border:1px solid #1a6b4a;text-align:center;}
  .rc-summary-label{background:#1a6b4a;color:white;font-size:7.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:3px 2px;}
  .rc-summary-value{font-size:13px;font-weight:900;padding:4px 2px;color:#111;}
  .rc-bottom-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:12px;margin-bottom:8px;}
  .rc-sub-bar{background:#1a6b4a;color:white;font-weight:700;font-size:9px;letter-spacing:.6px;padding:3px 7px;text-transform:uppercase;}
  .rc-grading{width:100%;border-collapse:collapse;font-size:9.5px;}
  .rc-grading th{background:#1a6b4a;color:white;padding:2px 7px;font-size:9px;font-weight:700;text-align:center;}
  .rc-grading td{border:1px solid #ccc;padding:2px 7px;text-align:center;vertical-align:middle;}
  .rc-grading tr:nth-child(even) td{background:#f4f9f6;}
  .rc-fail{color:#b83232;font-weight:700;}
  .rc-rating-key{border:1px solid #ccc;padding:5px 8px;font-size:9.5px;}
  .rc-rating-line{display:flex;align-items:baseline;gap:6px;margin-bottom:2px;}
  .rc-rating-num{font-weight:900;color:#1a6b4a;}
  .rc-rating-dots{flex:1;border-bottom:1px dotted #999;margin-bottom:2px;}
  .rc-rating-label{color:#333;}
  .rc-term-row{display:flex;justify-content:space-between;font-size:10px;font-weight:700;margin-bottom:6px;padding:4px 8px;background:#f4f9f6;border:1px solid #ccc;}
  .rc-term-row span.val{font-weight:400;}
  .rc-remarks-box{border:1px solid #ccc;padding:6px 8px;}
  .rc-remark-row{display:flex;gap:8px;margin-bottom:3px;font-size:10.5px;align-items:flex-start;}
  .rc-remark-row:last-child{margin-bottom:0;}
  .rc-remark-label{font-weight:700;white-space:nowrap;min-width:100px;color:#1a6b4a;}
  .rc-remark-text{color:#222;border-bottom:1px solid #bbb;flex:1;padding-bottom:1px;min-height:13px;}
  .rc-footer{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;margin-top:10px;gap:10px;}
  .rc-footer-sig{justify-self:start;text-align:left;}
  .rc-footer-sig-line{width:120px;border-bottom:1.3px solid #333;margin-bottom:3px;}
  .rc-footer-sig-label{font-size:8px;font-weight:700;color:#1a6b4a;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;}
  .rc-stamp-box{justify-self:center;border:1.5px dashed #aaa;width:62px;height:62px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:7.5px;color:#aaa;letter-spacing:.5px;font-weight:600;text-transform:uppercase;gap:2px;}
  .rc-qr{justify-self:end;text-align:center;flex-shrink:0;}
  .rc-qr canvas,.rc-qr img{width:54px;height:54px;border:1px solid #ddd;padding:3px;background:white;}
  .rc-qr-label{font-size:7px;color:#666;margin-top:2px;}
`;

function launchPrint(items){
  const cardHTMLs = items.map(it => buildReportCardHTML(it.studentId, it.examId, true));

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
        try{ new QRCode(div, {text:qrText, width:70, height:70, colorDark:'#000000', colorLight:'#ffffff'}); }catch(e){}
        setTimeout(()=>{
          const canvas = div.querySelector('canvas');
          const dataURL = canvas ? canvas.toDataURL('image/png') : '';
          const placeholder = new RegExp(`<div[^>]*data-qrtext="${encoded}"[^>]*>(</div>)?`, 'g');
          job.html = job.html.replace(placeholder, dataURL ? `<img src="${dataURL}" style="width:54px;height:54px;border:1px solid #ddd;padding:3px;background:white;"/>` : '');
          pending--;
          if(pending===0){ document.body.removeChild(tempHolder); callback(jobs.map(j=>j.html)); }
        }, 250);
      });
    });
  }

  resolveQRCodes(cardHTMLs, (resolvedHTMLs)=>{
    const pagesHtml = resolvedHTMLs.map(h=>`<div class="pw rc">${h}</div>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Report Card</title><style>${PRINT_CSS}</style></head><body>${pagesHtml}<script>window.onload=function(){window.print();};<\/script></body></html>`;
    const blob = new Blob([html], {type:'text/html'});
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    iframe.src = url;
    document.body.appendChild(iframe);
    setTimeout(()=>{ URL.revokeObjectURL(url); iframe.remove(); }, 60000);
  });
}
