/* Greenwood SMS — Timetable management
   Nursery classes get an activity-based schedule (Circle Time,
   Snack Break, Outdoor Play...). Primary classes get a subject-
   period schedule, same as a conventional timetable.

   Subjects and period times both used to be fixed lists. Subjects
   are now a free-text field with the existing subject list offered
   as tap-to-fill suggestions (so a school-specific subject that
   isn't in the standard list can still be typed). Period times are
   now editable and stored school-wide in Settings, instead of a
   hardcoded array, so the row labels genuinely reflect the school's
   actual daily schedule. */
window.MODULES = window.MODULES || {};

const NURSERY_ACTIVITIES = ['Circle Time','Numeracy Time','Literacy Time','Rhymes & Phonics','Story Time','Snack Break','Outdoor Play','Drawing & Colouring','Music & Movement','Nap Time'];
const DEFAULT_PERIODS = ['8:00-8:45','8:45-9:30','9:30-10:15','10:35-11:20','11:20-12:05','12:45-13:30'];

function getPeriods(){
  const saved = DB.settings().timetablePeriods;
  return (Array.isArray(saved) && saved.length) ? saved : DEFAULT_PERIODS;
}

MODULES.timetable = function(container, ctx){
  const canEdit = ['Super Admin','Principal','Head Teacher'].includes(ctx.user.role);
  const days = ['Mon','Tue','Wed','Thu','Fri'];
  const classOptions = visibleClasses(ctx);

  if(!classOptions.length){
    container.innerHTML = `${UI.pageHeader('Academics', 'Timetable Management')}<div class="card">${UI.emptyState('No class assigned yet', 'Ask a Super Admin or Principal to assign you a class in Teacher Management.')}</div>`;
    return;
  }

  let activeClass = classOptions[0];

  container.innerHTML = `
    ${UI.pageHeader('Academics', 'Timetable Management', `
      <select id="tt-class" style="width:auto;">${classOptions.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
      ${canEdit ? `<button class="btn btn-outline print-hide" id="tt-edit-periods">${ICONS.edit(15)} Edit periods</button>` : ''}
      <button class="btn btn-outline print-hide" id="tt-print">${ICONS.print(15)} Print</button>
    `)}
    <div class="card">
      <div class="section-title print-only" id="tt-print-title" style="display:none;"></div>
      <div class="scroll-x" id="tt-grid"></div>
    </div>
  `;
  container.querySelector('#tt-class').addEventListener('change', e=>{ activeClass = e.target.value; renderGrid(); });
  container.querySelector('#tt-print').addEventListener('click', ()=>{
    container.querySelector('#tt-print-title').textContent = `${activeClass} — Timetable`;
    window.print();
  });
  if(canEdit) container.querySelector('#tt-edit-periods').addEventListener('click', openPeriodsEditor);

  function cellFields(){
    const isNursery = classLevel(activeClass)==='nursery';
    const options = isNursery ? NURSERY_ACTIVITIES : subjectsForClass(activeClass);
    return [
      {name:'subject', label: isNursery ? 'Activity' : 'Subject', type:'text-datalist', options, required:true, full:true,
        placeholder: isNursery ? 'Pick or type an activity' : 'Pick or type a subject'},
      {name:'teacher', label:'Teacher', type:'select', options: DB.all('teachers').map(t=>t.name), full:true},
    ];
  }

  function renderGrid(){
    const isNursery = classLevel(activeClass)==='nursery';
    const periods = getPeriods();
    const rows = DB.all('timetable').filter(t=>t.class===activeClass);
    const find = (day, period) => rows.find(r=>r.day===day && r.period===period);
    const grid = container.querySelector('#tt-grid');
    grid.innerHTML = `
      <table>
        <thead><tr><th>${isNursery?'Time':'Period'}</th>${days.map(d=>`<th>${d}</th>`).join('')}</tr></thead>
        <tbody>
        ${periods.map(p=>`
          <tr>
            <td class="row-sub mono">${p}</td>
            ${days.map(d=>{
              const cell = find(d,p);
              return `<td style="min-width:130px;">
                ${cell ? `
                  <div class="badge badge-green" style="display:block;padding:8px 10px;border-radius:10px;cursor:${canEdit?'pointer':'default'};" data-edit-cell="${d}|${p}">
                    <div style="font-weight:700;">${cell.subject}</div>
                    <div style="font-size:10.5px;font-weight:500;">${cell.teacher||''}</div>
                  </div>` :
                  canEdit ? `<button class="icon-action print-hide" data-add-cell="${d}|${p}" style="width:100%;">${ICONS.plus(14)}</button>` : `<span class="row-sub">—</span>`}
              </td>`;
            }).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    `;
    if(canEdit){
      grid.querySelectorAll('[data-add-cell],[data-edit-cell]').forEach(node=>{
        node.addEventListener('click', ()=>{
          const key = node.dataset.addCell || node.dataset.editCell;
          const [day, period] = key.split('|');
          const existing = find(day, period);
          openCellForm(day, period, existing);
        });
      });
    }
  }

  function openCellForm(day, period, existing){
    const f = cellFields();
    UI.openModal({
      title: `${day} · ${period}`,
      bodyHTML: UI.renderForm(f, existing||{}),
      footHTML: `${existing?'<button class="btn btn-danger" data-del style="margin-right:auto;">Remove</button>':''}<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save</button>`,
      onMount:(modal, close)=>{
        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-save]').addEventListener('click', ()=>{
          const data = UI.readForm(modal, f);
          if(!data.subject || !data.subject.trim()){ UI.toast('Enter or pick a subject','error'); return; }
          if(existing) DB.update('timetable', existing.id, data);
          else DB.add('timetable', {...data, class:activeClass, day, period});
          UI.toast('Timetable updated'); close(); renderGrid();
        });
        const delBtn = modal.querySelector('[data-del]');
        if(delBtn) delBtn.addEventListener('click', ()=>{ DB.remove('timetable', existing.id); UI.toast('Period removed'); close(); renderGrid(); });
      }
    });
  }

  /* Edit the list of period/time-slot labels school-wide (e.g. change
     "8:00-8:45" to "8:00-8:30", add a period, remove one). This is a
     school-wide setting, not per-class — every class's timetable shares
     the same row structure, matching how school bell schedules work. */
  function openPeriodsEditor(){
    let periods = getPeriods().slice();

    function bodyHTML(){
      return `
        <div class="row-sub" style="margin-bottom:12px;">These times apply to every class's timetable.</div>
        ${periods.map((p,i)=>`
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
            <input type="text" data-period-input="${i}" value="${p}" placeholder="e.g. 8:00-8:45" style="flex:1;"/>
            <button class="icon-action" data-remove-period="${i}">${ICONS.trash(14)}</button>
          </div>`).join('')}
        <button class="btn btn-outline btn-sm" id="add-period">${ICONS.plus(13)} Add period</button>
      `;
    }

    UI.openModal({
      title:'Edit periods', large:true,
      bodyHTML: bodyHTML(),
      footHTML: `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save periods</button>`,
      onMount:(modal, close)=>{
        function rewire(){
          modal.querySelector('.modal-body').innerHTML = bodyHTML();
          modal.querySelector('#add-period').addEventListener('click', ()=>{ periods.push('New period'); rewire(); });
          modal.querySelectorAll('[data-remove-period]').forEach(b=>b.addEventListener('click', ()=>{
            periods.splice(Number(b.dataset.removePeriod), 1); rewire();
          }));
          modal.querySelectorAll('[data-period-input]').forEach(inp=>inp.addEventListener('input', e=>{
            periods[Number(inp.dataset.periodInput)] = e.target.value;
          }));
        }
        rewire();
        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-save]').addEventListener('click', ()=>{
          const cleaned = periods.map(p=>p.trim()).filter(Boolean);
          if(!cleaned.length){ UI.toast('Add at least one period','error'); return; }
          DB.updateSettings({timetablePeriods: cleaned});
          UI.toast('Periods updated'); close(); renderGrid();
        });
      }
    });
  }

  renderGrid();
};
