/* Greenwood SMS — Portals (Parent/Student/Teacher), Reports, Roles */
window.MODULES = window.MODULES || {};

function resultAvg(r){
  return (!r || !r.subjects || !r.subjects.length) ? 0 : Math.round(r.overallTotal / r.subjects.length);
}

/* ---------------- Parent Portal ---------------- */
MODULES.parentPortal = function(container, ctx){
  const child = DB.get('students', ctx.user.linkedStudentId) || DB.all('students')[0];
  const fee = DB.all('fees').find(f=>f.studentId===child.id);
  const myResults = DB.all('results').filter(r=>r.studentId===child.id);
  const latestResult = myResults[myResults.length-1];
  const attendanceToday = DB.all('attendanceRecords').filter(r=>r.studentId===child.id);
  const notices = DB.all('notices').filter(n=>n.audience==='All' || n.audience==='Parents');

  container.innerHTML = `
    ${UI.pageHeader('Portal', 'Parent Portal')}
    <div class="card" style="margin-bottom:20px;display:flex;gap:16px;align-items:center;">
      <div class="avatar" style="width:56px;height:56px;font-size:20px;">${UI.initials(child.name)}</div>
      <div>
        <div style="font-weight:700;font-size:17px;">${child.name}</div>
        <div class="row-sub">${child.class} · Admission No. ${child.admissionNo}</div>
      </div>
    </div>
    <div class="grid grid-3" style="margin-bottom:20px;">
      <div class="card stat-card"><div class="label">Fee balance</div><div class="value">${UI.fmtMoney(fee?.balance||0)}</div><div class="delta ${fee?.status==='Paid'?'up':'down'}">${fee?.status||'—'}</div></div>
      <div class="card stat-card"><div class="label">Attendance status today</div><div class="value" style="font-size:20px;">${attendanceToday[0]?.status || 'Not marked'}</div></div>
      <div class="card stat-card"><div class="label">Latest average score</div><div class="value">${latestResult ? resultAvg(latestResult)+'%' : '—'}</div></div>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <div class="section-title">Latest results ${latestResult?`<button class="btn btn-sm btn-outline" id="view-report">${ICONS.eye(13)} View report</button>`:''}</div>
        ${latestResult ? latestResult.subjects.map(s=>`<div class="activity-item"><div class="activity-dot" style="background:var(--green-500)"></div><div><div class="t">${s.name}</div><div class="d">Score: ${s.total} · Grade ${s.grade}</div></div></div>`).join('') : UI.emptyState('No results published yet')}
      </div>
      <div class="card">
        <div class="section-title">Notices for parents</div>
        ${notices.map(n=>`<div class="activity-item"><div class="activity-dot" style="background:var(--amber-500)"></div><div><div class="t">${n.title}</div><div class="d">${UI.fmtDate(n.date)}</div></div></div>`).join('') || UI.emptyState('No notices yet')}
      </div>
    </div>
  `;
  container.querySelector('#view-report')?.addEventListener('click', ()=> openReportCard(child.id, latestResult.examId));
};

/* ---------------- Student Portal ---------------- */
MODULES.studentPortal = function(container, ctx){
  const student = DB.get('students', ctx.user.linkedStudentId) || DB.all('students')[0];
  const myResults = DB.all('results').filter(r=>r.studentId===student.id);
  const latestResult = myResults[myResults.length-1];
  const homework = DB.all('assignments').filter(a=>a.class===student.class);
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const timetableToday = DB.all('timetable').filter(t=>t.class===student.class && t.day===dayNames[new Date().getDay()]);

  container.innerHTML = `
    ${UI.pageHeader('Portal', 'Student Portal')}
    <div class="card" style="margin-bottom:20px;display:flex;gap:16px;align-items:center;">
      <div class="avatar" style="width:56px;height:56px;font-size:20px;">${UI.initials(student.name)}</div>
      <div><div style="font-weight:700;font-size:17px;">${student.name}</div><div class="row-sub">${student.class}</div></div>
    </div>
    <div class="grid grid-3">
      <div class="card">
        <div class="section-title">Today's timetable</div>
        ${timetableToday.length ? timetableToday.map(t=>`<div class="activity-item"><div class="activity-dot" style="background:var(--blue-500)"></div><div><div class="t">${t.subject}</div><div class="d">${t.period} · ${t.teacher||''}</div></div></div>`).join('') : UI.emptyState('Nothing scheduled today')}
      </div>
      <div class="card">
        <div class="section-title">Homework</div>
        ${homework.length ? homework.map(h=>`<div class="activity-item"><div class="activity-dot" style="background:${h.status==='Open'?'var(--amber-500)':'var(--green-500)'}"></div><div><div class="t">${h.title}</div><div class="d">${h.subject} · Due ${UI.fmtDate(h.dueDate)}</div></div></div>`).join('') : UI.emptyState('No homework assigned')}
      </div>
      <div class="card">
        <div class="section-title">My results ${latestResult?`<button class="btn btn-sm btn-outline" id="view-report">${ICONS.eye(13)}</button>`:''}</div>
        ${latestResult ? latestResult.subjects.slice(0,6).map(s=>`<div class="activity-item"><div class="activity-dot" style="background:var(--green-500)"></div><div><div class="t">${s.name}</div><div class="d">Score ${s.total} · Grade ${s.grade}</div></div></div>`).join('') : UI.emptyState('No results yet')}
      </div>
    </div>
  `;
  container.querySelector('#view-report')?.addEventListener('click', ()=> openReportCard(student.id, latestResult.examId));
};

/* ---------------- Teacher Portal ---------------- */
MODULES.teacherPortal = function(container, ctx){
  const teacher = DB.get('teachers', ctx.user.linkedTeacherId);

  if(!teacher){
    container.innerHTML = `
      ${UI.pageHeader('Portal', 'Teacher Portal')}
      <div class="card">${UI.emptyState('Your account isn\'t linked to a staff record yet',
        'Ask a Super Admin to add you in Academic Staff, then link your login to that record in User Management — this connects your login to your classes and homework.')}</div>
    `;
    return;
  }

  const myClasses = (teacher.classes && teacher.classes.length) ? teacher.classes : [];
  const homework = DB.all('assignments').filter(a=>myClasses.includes(a.class));
  const students = DB.all('students').filter(s=>myClasses.includes(s.class));

  container.innerHTML = `
    ${UI.pageHeader('Portal', 'Teacher Portal')}
    <div class="grid grid-4" style="margin-bottom:20px;">
      <div class="card stat-card"><div class="label">My classes</div><div class="value">${myClasses.length}</div></div>
      <div class="card stat-card"><div class="label">My students</div><div class="value">${students.length}</div></div>
      <div class="card stat-card"><div class="label">Open assignments</div><div class="value">${homework.filter(h=>h.status==='Open').length}</div></div>
      <div class="card stat-card"><div class="label">Qualification</div><div class="value" style="font-size:16px;">${teacher.qualification||'—'}</div></div>
    </div>
    ${myClasses.length ? '' : `<div class="card" style="margin-bottom:20px;">${UI.emptyState('No classes assigned yet', 'Ask a Super Admin or Principal to assign you a class in Teacher Management.')}</div>`}
    <div class="grid grid-2">
      <div class="card">
        <div class="section-title">My classes<span class="link" data-go="attendance">Mark attendance</span></div>
        ${myClasses.map(c=>`<div class="activity-item"><div class="activity-dot" style="background:var(--green-500)"></div><div><div class="t">${c}</div><div class="d">${DB.all('students').filter(s=>s.class===c).length} students</div></div></div>`).join('') || UI.emptyState('—')}
      </div>
      <div class="card">
        <div class="section-title">Assignments<span class="link" data-go="homework">Manage</span></div>
        ${homework.length ? homework.map(h=>`<div class="activity-item"><div class="activity-dot" style="background:var(--amber-500)"></div><div><div class="t">${h.title}</div><div class="d">${h.class} · Due ${UI.fmtDate(h.dueDate)}</div></div></div>`).join('') : UI.emptyState('No assignments yet')}
      </div>
    </div>
  `;
  container.querySelectorAll('[data-go]').forEach(n=>n.addEventListener('click', ()=> location.hash='#/'+n.dataset.go));
};

/* ---------------- Reports & Analytics ---------------- */
MODULES.reports = function(container, ctx){
  const students = DB.all('students');
  const fees = DB.all('fees');
  const attendance = dailyAttendanceAggregates();
  const results = DB.all('results');

  container.innerHTML = `
    ${UI.pageHeader('Insights', 'Reports & Analytics', `<button class="btn btn-outline" id="print-report">${ICONS.print(15)} Print</button>`)}
    <div class="grid grid-2" style="margin-bottom:20px;">
      <div class="card"><div class="section-title">Enrollment by class</div><div style="height:250px;"><canvas id="rep-enroll"></canvas></div></div>
      <div class="card"><div class="section-title">Attendance trend</div><div style="height:250px;"><canvas id="rep-att"></canvas></div></div>
    </div>
    <div class="grid grid-2">
      <div class="card"><div class="section-title">Fee collection by status</div><div style="height:250px;"><canvas id="rep-fee"></canvas></div></div>
      <div class="card"><div class="section-title">Gender distribution</div><div style="height:250px;"><canvas id="rep-gender"></canvas></div></div>
    </div>
  `;
  container.querySelector('#print-report').addEventListener('click', ()=>window.print());

  const byClass = {};
  CLASS_NAMES.forEach(c=> byClass[c] = students.filter(s=>s.class===c).length);
  CHARTS.bar('rep-enroll', {labels:Object.keys(byClass), datasets:[{label:'Students', data:Object.values(byClass)}]});

  CHARTS.line('rep-att', {
    labels: attendance.map(a=>new Date(a.date).toLocaleDateString(undefined,{day:'2-digit',month:'short'})),
    datasets:[{label:'Present %', data: attendance.map(a=> a.total ? Math.round(a.present/a.total*100) : 0)}]
  });

  const statusCounts = {Paid:0, Partial:0, Pending:0};
  fees.forEach(f=> statusCounts[f.status] = (statusCounts[f.status]||0)+1);
  CHARTS.doughnut('rep-fee', {labels:Object.keys(statusCounts), data:Object.values(statusCounts), colors:['#2D6A4F','#DE9B3A','#C1443D']});

  const genderCounts = {Male:0, Female:0};
  students.forEach(s=> genderCounts[s.gender] = (genderCounts[s.gender]||0)+1);
  CHARTS.doughnut('rep-gender', {labels:Object.keys(genderCounts), data:Object.values(genderCounts), colors:['#3B6FA8','#DE9B3A']});
};

/* ---------------- Roles & Permissions ---------------- */
MODULES.roles = function(container, ctx){
  const moduleLabels = {
    dashboard:'Dashboard', students:'Students', teachers:'Academic Staff', staff:'Non-Academic Staff', classes:'Classes/Subjects',
    attendance:'Attendance', exams:'Exams/Results', fees:'Fees', expenditure:'Expenditures', timetable:'Timetable', library:'Library',
    comms:'Communication', homework:'Homework', notice:'Notice Board',
    inventory:'Inventory', health:'Health Records', events:'Events', userManagement:'User Management', roles:'Roles', reports:'Reports', settings:'Settings'
  };
  container.innerHTML = `
    ${UI.pageHeader('Administration', 'Roles & Permissions', `<button class="btn btn-outline" id="go-users">${ICONS.userManage(15)} Manage Users</button>`)}
    <div class="card" style="margin-bottom:20px;">
      <div class="section-title">A note on Teachers</div>
      <p class="row-sub">Teachers can only see the modules checked below — and within those, only the class(es) they're assigned to in Teacher Management. Other classes are completely hidden from them, not just harder to find.</p>
    </div>
    <div class="card">
      <div class="section-title">Access matrix <span class="row-sub" style="font-weight:400;">Read-only overview — module access is defined per role</span></div>
      <div class="table-wrap"><div class="scroll-x"><table>
        <thead><tr><th>Module</th>${AUTH.ROLES.map(r=>`<th>${r}</th>`).join('')}</tr></thead>
        <tbody>
          ${Object.entries(moduleLabels).map(([key,label])=>`
            <tr><td class="row-name">${label}</td>
              ${AUTH.ROLES.map(role=>`<td style="text-align:center;">${AUTH.can(role,key)?`<span style="color:var(--green-600);">${ICONS.check(16)}</span>`:'<span style="color:var(--ink-faint);">—</span>'}</td>`).join('')}
            </tr>`).join('')}
        </tbody>
      </table></div></div>
    </div>
  `;
  container.querySelector('#go-users').addEventListener('click', ()=> location.hash = '#/userManagement');
};
