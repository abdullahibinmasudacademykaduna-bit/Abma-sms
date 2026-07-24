/* Greenwood SMS — Dashboard module */
window.MODULES = window.MODULES || {};

MODULES.dashboard = function(container, ctx){
  const students = DB.all('students');
  const teachers = DB.all('teachers');
  const staff = DB.all('staff');
  const classes = DB.all('classes');
  const attendance = DB.all('attendance');
  const fees = DB.all('fees');
  const activities = DB.all('activities').filter(a => !a.forUserId || a.forUserId === ctx.user.id);
  const events = DB.all('events');
  const notices = DB.all('notices').filter(n=>n.pinned);

  const todayAtt = attendance[attendance.length-1] || {present:0,total:1};
  const attPct = Math.round((todayAtt.present/Math.max(todayAtt.total,1))*100);
  const totalFees = fees.reduce((s,f)=>s+f.amount,0);
  const collected = fees.reduce((s,f)=>s+f.paid,0);
  const pending = totalFees - collected;
  const activeStudents = students.filter(s=>s.status==='Active').length;

  const quickActions = [
    {ic:'students', label:'Add Student', go:'students'},
    {ic:'teachers', label:'Add Academic Staff', go:'teachers'},
    {ic:'attendance', label:'Mark Attendance', go:'attendance'},
    {ic:'fees', label:'Collect Fee', go:'fees'},
    {ic:'notice', label:'Post Notice', go:'notice'},
    {ic:'reports', label:'View Reports', go:'reports'},
  ].filter(a => AUTH.can(ctx.user.role, a.go) || AUTH.can(ctx.user.role,'dashboard'));

  container.innerHTML = `
    ${UI.pageHeader('Overview', `Welcome back, ${ctx.user.name.split(' ')[0]}`, `
      <span class="badge badge-green">${DB.settings().term || 'Term 2'}</span>
    `)}

    <div class="grid grid-4" style="margin-bottom:20px;">
      <div class="card stat-card">
        <div class="top"><div class="ic-wrap">${ICONS.students(20)}</div></div>
        <div class="label">Total Students</div>
        <div class="value">${students.length}</div>
        <div class="delta up">${ICONS.trend(13)} ${activeStudents} active</div>
      </div>
      <div class="card stat-card">
        <div class="top"><div class="ic-wrap">${ICONS.teachers(20)}</div></div>
        <div class="label">Total Academic Staff</div>
        <div class="value">${teachers.length}</div>
        <div class="delta up">${ICONS.trend(13)} across ${classes.length} classes</div>
      </div>
      <div class="card stat-card">
        <div class="top"><div class="ic-wrap">${ICONS.staff(20)}</div></div>
        <div class="label">Total Non-Academic Staff</div>
        <div class="value">${staff.length}</div>
        <div class="delta up">non-teaching</div>
      </div>
      <div class="card stat-card">
        <div class="top"><div class="ic-wrap">${ICONS.classes(20)}</div></div>
        <div class="label">Total Classes</div>
        <div class="value">${classes.length}</div>
        <div class="delta up">10 grade levels</div>
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom:20px;">
      <div class="card stat-card">
        <div class="top"><div class="ic-wrap">${ICONS.attendance(20)}</div></div>
        <div class="label">Attendance Today</div>
        <div class="value">${attPct}%</div>
        <div class="bar-track"><div class="bar-fill" style="width:${attPct}%"></div></div>
      </div>
      <div class="card stat-card">
        <div class="top"><div class="ic-wrap">${ICONS.fees(20)}</div></div>
        <div class="label">Fees Collected</div>
        <div class="value">${UI.fmtMoney(collected)}</div>
        <div class="delta up">${Math.round(collected/totalFees*100)}% of term total</div>
      </div>
      <div class="card stat-card">
        <div class="top"><div class="ic-wrap" style="background:#FCEED8;color:#8A5A17;">${ICONS.money(20)}</div></div>
        <div class="label">Pending Fees</div>
        <div class="value">${UI.fmtMoney(pending)}</div>
        <div class="delta down">${fees.filter(f=>f.status!=='Paid').length} students owing</div>
      </div>
      <div class="card stat-card">
        <div class="top"><div class="ic-wrap">${ICONS.events(20)}</div></div>
        <div class="label">Upcoming Events</div>
        <div class="value">${events.length}</div>
        <div class="delta up">next: ${events[0]?.title||'—'}</div>
      </div>
    </div>

    <div class="grid grid-3" style="margin-bottom:20px; align-items:stretch;">
      <div class="card" style="grid-column:span 2;">
        <div class="section-title">Attendance trend (14 days) <span class="link" data-go="attendance">View all</span></div>
        <div style="height:230px;"><canvas id="chart-attendance"></canvas></div>
      </div>
      <div class="card">
        <div class="section-title">Fee collection</div>
        <div style="height:230px;"><canvas id="chart-fees"></canvas></div>
      </div>
    </div>

    <div class="grid grid-3" style="align-items:start;">
      <div class="card">
        <div class="section-title">Quick actions</div>
        <div class="qa-grid">
          ${quickActions.map(a=>`
            <div class="qa-item" data-go="${a.go}">
              <div class="ic-wrap">${ICONS[a.ic](18)}</div>
              <span>${a.label}</span>
            </div>`).join('')}
        </div>
        <div class="section-title" style="margin-top:22px;">Pinned notices</div>
        ${notices.map(n=>`
          <div class="activity-item">
            <div class="activity-dot" style="background:var(--amber-500)"></div>
            <div><div class="t">${n.title}</div><div class="d">${UI.fmtDate(n.date)} · ${n.audience}</div></div>
          </div>`).join('') || UI.emptyState('No pinned notices')}
      </div>

      <div class="card">
        <div class="section-title">Recent activity <span class="link" data-go="reports">Reports</span></div>
        ${activities.map(a=>`
          <div class="activity-item">
            <div class="activity-dot" style="background:${dotColor(a.type)}"></div>
            <div><div class="t">${a.text}</div><div class="d">${a.time}</div></div>
          </div>`).join('')}
      </div>

      <div class="card">
        <div class="section-title">School calendar</div>
        ${renderMiniCalendar()}
        <div class="section-title" style="margin-top:18px;">Upcoming events</div>
        ${events.slice(0,3).map(e=>`
          <div class="activity-item">
            <div class="activity-dot" style="background:var(--green-500)"></div>
            <div><div class="t">${e.title}</div><div class="d">${UI.fmtDate(e.date)} · ${e.category}</div></div>
          </div>`).join('')}
      </div>
    </div>
  `;

  container.querySelectorAll('[data-go]').forEach(node=>{
    node.addEventListener('click', ()=> location.hash = '#/' + node.dataset.go);
  });

  const last14 = attendance.map(a=>({...a}));
  CHARTS.line('chart-attendance', {
    labels: last14.map(a=> new Date(a.date).toLocaleDateString(undefined,{day:'2-digit',month:'short'})),
    datasets: [{label:'Present', data: last14.map(a=>Math.round(a.present/a.total*100)), color:'#2D6A4F'}]
  });

  CHARTS.doughnut('chart-fees', {
    labels:['Collected','Pending'],
    data:[collected, pending],
    colors:['#2D6A4F','#DE9B3A']
  });

  function dotColor(type){
    return {student:'#2D6A4F', fee:'#DE9B3A', attendance:'#3B6FA8', notice:'#C1443D', exam:'#74C69D', library:'#8A5A17'}[type] || '#95D5B2';
  }

  function renderMiniCalendar(){
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const first = new Date(y,m,1);
    const startDow = first.getDay();
    const daysInMonth = new Date(y,m+1,0).getDate();
    const eventDays = new Set(events.filter(e=>{ const d=new Date(e.date); return d.getFullYear()===y && d.getMonth()===m; }).map(e=> new Date(e.date).getDate()));
    let cells = '';
    ['S','M','T','W','T','F','S'].forEach(d=> cells += `<div class="cal-dow">${d}</div>`);
    for(let i=0;i<startDow;i++) cells += `<div></div>`;
    for(let d=1; d<=daysInMonth; d++){
      const isToday = d===now.getDate();
      cells += `<div class="cal-day ${isToday?'today':''} ${eventDays.has(d)?'event':''}">${d}</div>`;
    }
    return `<div class="cal-grid">${cells}</div>`;
  }
};
