/* Greenwood SMS — Attendance management */
window.MODULES = window.MODULES || {};

MODULES.attendance = function(container, ctx){
  const canMark = ['Super Admin','Principal','Head Teacher','Teacher'].includes(ctx.user.role);
  const classOptions = visibleClasses(ctx);
  const scoped = getScopedClasses(ctx);
  let activeClass = classOptions[0];
  const today = new Date().toISOString().slice(0,10);

  if(!classOptions.length){
    container.innerHTML = `
      ${UI.pageHeader('Academics', 'Attendance Management')}
      <div class="card">${UI.emptyState('No class assigned yet', 'Ask a Super Admin or Principal to assign you a class in Teacher Management.')}</div>
    `;
    return;
  }

  container.innerHTML = `
    ${UI.pageHeader('Academics', 'Attendance Management')}
    <div class="grid grid-3" style="margin-bottom:20px;">
      <div class="card" style="grid-column:span 2;">
        <div class="section-title">14-day attendance trend</div>
        <div style="height:220px;"><canvas id="att-chart"></canvas></div>
      </div>
      <div class="card">
        <div class="section-title">Today's snapshot</div>
        <div id="att-snapshot"></div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">
        Mark attendance — ${today}
        <select id="class-select" style="width:auto;">${classOptions.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
      </div>
      <div id="att-table"></div>
    </div>
  `;

  const attData = dailyAttendanceAggregates();
  CHARTS.line('att-chart', {
    labels: attData.map(a=>new Date(a.date).toLocaleDateString(undefined,{day:'2-digit',month:'short'})),
    datasets:[{label:'Present %', data: attData.map(a=> a.total ? Math.round(a.present/a.total*100) : 0), color:'#2D6A4F'}]
  });

  const latest = attData[attData.length-1];
  if(latest){
    const pct = latest.total ? Math.round(latest.present/latest.total*100) : 0;
    container.querySelector('#att-snapshot').innerHTML = `
      <div class="grid grid-2" style="gap:10px;">
        <div class="card-flat"><div class="row-sub">Present</div><div class="value mono" style="font-size:20px;">${latest.present}</div></div>
        <div class="card-flat"><div class="row-sub">Absent</div><div class="value mono" style="font-size:20px;">${latest.absent}</div></div>
      </div>
      <div class="bar-track" style="margin-top:14px;"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="row-sub" style="margin-top:8px;">${pct}% attendance rate today</div>
    `;
  } else {
    container.querySelector('#att-snapshot').innerHTML = UI.emptyState('No attendance marked yet', 'Use the roster below to mark today\'s attendance.');
  }

  const classSelect = container.querySelector('#class-select');
  classSelect.value = activeClass;
  classSelect.addEventListener('change', ()=>{ activeClass = classSelect.value; renderRoster(); });

  function renderRoster(){
    const students = DB.all('students').filter(s=>s.class===activeClass);
    const records = DB.all('attendanceRecords');
    const wrap = container.querySelector('#att-table');
    wrap.innerHTML = `
      <div class="table-wrap">
        <div class="scroll-x"><table>
          <thead><tr><th>Student</th><th>Admission No.</th><th>Status</th></tr></thead>
          <tbody>
            ${students.map(s=>{
              const rec = records.find(r=>r.studentId===s.id && r.date===today);
              const status = rec ? rec.status : 'Present';
              return `<tr data-sid="${s.id}">
                <td class="row-name">${s.name}</td>
                <td class="row-sub">${s.admissionNo}</td>
                <td>
                  <div class="chip-list">
                    ${['Present','Absent','Late'].map(st=>`<span class="chip ${status===st?'active':''}" data-status="${st}">${st}</span>`).join('')}
                  </div>
                </td>
              </tr>`;
            }).join('') || `<tr><td colspan="3">${UI.emptyState('No students in this class')}</td></tr>`}
          </tbody>
        </table></div>
      </div>
      ${canMark? `<div style="margin-top:14px;text-align:right;"><button class="btn btn-primary" id="save-att">${ICONS.check(15)} Save attendance</button></div>` : ''}
    `;

    if(canMark){
      wrap.querySelectorAll('.chip').forEach(chip=>{
        chip.addEventListener('click', ()=>{
          chip.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
          chip.classList.add('active');
        });
      });
      wrap.querySelector('#save-att').addEventListener('click', ()=>{
        wrap.querySelectorAll('tr[data-sid]').forEach(tr=>{
          const sid = tr.dataset.sid;
          const status = tr.querySelector('.chip.active')?.dataset.status || 'Present';
          const existing = DB.all('attendanceRecords').find(r=>r.studentId===sid && r.date===today);
          if(existing) DB.update('attendanceRecords', existing.id, {status});
          else DB.add('attendanceRecords', {studentId:sid, class:activeClass, date:today, status});
        });
        UI.toast('Attendance saved for ' + activeClass);
      });
    }
  }
  renderRoster();
};
