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
      <div class="row-sub" style="margin-bottom:10px;">Tap a status to select it. Press and hold <b>Absent</b> for Sick or Travel — an excused absence, shown to parents on Open Day.</div>
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
                    <span class="chip ${status==='Present'?'active':''}" data-status="Present">Present</span>
                    <span class="chip ${['Absent','Sick','Travel'].includes(status)?'active':''}" data-status="Absent" data-longpress-absent>${['Sick','Travel'].includes(status) ? status : 'Absent'}</span>
                    <span class="chip ${status==='Late'?'active':''}" data-status="Late">Late</span>
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
          chip.dataset.status = chip.dataset.longpressAbsent!==undefined ? 'Absent' : chip.dataset.status;
          if(chip.dataset.longpressAbsent!==undefined) chip.textContent = 'Absent';
        });
      });

      // Press-and-hold the Absent chip to pick a specific reason
      // instead of a plain unexplained absence.
      wrap.querySelectorAll('[data-longpress-absent]').forEach(chip=>{
        let timer = null, longPressed = false;
        const openReasonMenu = ()=>{
          longPressed = true;
          document.querySelectorAll('.att-reason-menu').forEach(m=>m.remove());
          const rect = chip.getBoundingClientRect();
          const menu = document.createElement('div');
          menu.className = 'att-reason-menu';
          menu.style.cssText = `position:fixed; top:${rect.bottom+6}px; left:${rect.left}px; background:var(--surface,#fff); border:1px solid var(--border); border-radius:10px; box-shadow:0 6px 20px rgba(0,0,0,.15); padding:6px; z-index:200; display:flex; gap:6px;`;
          menu.innerHTML = `<button class="btn btn-sm btn-outline" data-reason="Sick">Sick</button><button class="btn btn-sm btn-outline" data-reason="Travel">Travel</button>`;
          document.body.appendChild(menu);
          menu.querySelectorAll('[data-reason]').forEach(btn=>btn.addEventListener('click', ()=>{
            chip.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
            chip.classList.add('active');
            chip.dataset.status = btn.dataset.reason;
            chip.textContent = btn.dataset.reason;
            menu.remove();
          }));
          const dismiss = (e)=>{ if(!menu.contains(e.target)){ menu.remove(); document.removeEventListener('pointerdown', dismiss); } };
          setTimeout(()=> document.addEventListener('pointerdown', dismiss), 0);
        };
        chip.addEventListener('pointerdown', ()=>{
          longPressed = false;
          timer = setTimeout(openReasonMenu, 500);
        });
        const cancelTimer = ()=>{ if(timer) clearTimeout(timer); };
        chip.addEventListener('pointerup', cancelTimer);
        chip.addEventListener('pointerleave', cancelTimer);
        chip.addEventListener('pointercancel', cancelTimer);
        // Swallow the click that follows a long-press so it doesn't
        // also reset the chip back to a plain "Absent".
        chip.addEventListener('click', (e)=>{ if(longPressed){ e.stopImmediatePropagation(); e.preventDefault(); longPressed=false; } }, true);
      });

      wrap.querySelector('#save-att').addEventListener('click', ()=>{
        wrap.querySelectorAll('tr[data-sid]').forEach(tr=>{
          const sid = tr.dataset.sid;
          const activeChip = tr.querySelector('.chip.active');
          const status = activeChip?.dataset.status || 'Present';
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
