/* Greenwood SMS — Timetable management
   Nursery classes get an activity-based schedule (Circle Time,
   Snack Break, Outdoor Play...). Primary classes get a subject-
   period schedule, same as a conventional timetable. */
window.MODULES = window.MODULES || {};

const NURSERY_ACTIVITIES = ['Circle Time','Numeracy Time','Literacy Time','Rhymes & Phonics','Story Time','Snack Break','Outdoor Play','Drawing & Colouring','Music & Movement','Nap Time'];

MODULES.timetable = function(container, ctx){
  const canEdit = ['Super Admin','Principal','Head Teacher'].includes(ctx.user.role);
  const days = ['Mon','Tue','Wed','Thu','Fri'];
  const periods = ['8:00-8:45','8:45-9:30','9:30-10:15','10:35-11:20','11:20-12:05','12:45-13:30'];
  const classOptions = visibleClasses(ctx);

  if(!classOptions.length){
    container.innerHTML = `${UI.pageHeader('Academics', 'Timetable Management')}<div class="card">${UI.emptyState('No class assigned yet', 'Ask a Super Admin or Principal to assign you a class in Teacher Management.')}</div>`;
    return;
  }

  let activeClass = classOptions[0];

  container.innerHTML = `
    ${UI.pageHeader('Academics', 'Timetable Management', `<select id="tt-class" style="width:auto;">${classOptions.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>`)}
    <div class="card"><div class="scroll-x" id="tt-grid"></div></div>
  `;
  container.querySelector('#tt-class').addEventListener('change', e=>{ activeClass = e.target.value; renderGrid(); });

  function cellFields(){
    const isNursery = classLevel(activeClass)==='nursery';
    const options = isNursery ? NURSERY_ACTIVITIES : subjectsForClass(activeClass);
    return [
      {name:'subject', label: isNursery ? 'Activity' : 'Subject', type:'select', options, required:true, full:true},
      {name:'teacher', label:'Teacher', type:'select', options: DB.all('teachers').map(t=>t.name), full:true},
    ];
  }

  function renderGrid(){
    const isNursery = classLevel(activeClass)==='nursery';
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
                  canEdit ? `<button class="icon-action" data-add-cell="${d}|${p}" style="width:100%;">${ICONS.plus(14)}</button>` : `<span class="row-sub">—</span>`}
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
          if(existing) DB.update('timetable', existing.id, data);
          else DB.add('timetable', {...data, class:activeClass, day, period});
          UI.toast('Timetable updated'); close(); renderGrid();
        });
        const delBtn = modal.querySelector('[data-del]');
        if(delBtn) delBtn.addEventListener('click', ()=>{ DB.remove('timetable', existing.id); UI.toast('Period removed'); close(); renderGrid(); });
      }
    });
  }

  renderGrid();
};
