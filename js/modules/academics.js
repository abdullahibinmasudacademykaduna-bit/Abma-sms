/* Greenwood SMS — Class & Subject management */
window.MODULES = window.MODULES || {};

MODULES.classes = function(container, ctx){
  const canEdit = ['Super Admin','Principal','Head Teacher'].includes(ctx.user.role);

  container.innerHTML = `
    ${UI.pageHeader('Academics', 'Class & Subject Management', canEdit? `<button class="btn btn-primary" id="add-class">${ICONS.plus(16)} Add Class</button>`:'')}
    <div class="tabs">
      <div class="tab active" data-tab="classes">Classes</div>
      <div class="tab" data-tab="subjects">Subjects</div>
    </div>
    <div id="tab-body"></div>
  `;

  const body = container.querySelector('#tab-body');
  container.querySelectorAll('.tab').forEach(t=>{
    t.addEventListener('click', ()=>{
      container.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      t.dataset.tab==='classes' ? renderClasses() : renderSubjects();
    });
  });

  function classFields(){
    return [
      {name:'name', label:'Class name', type:'select', options:CLASS_NAMES, required:true},
      {name:'capacity', label:'Capacity', type:'number'},
    ];
  }

  function renderClasses(){
    const rows = CLASS_NAMES.map(name=>{
      const rec = DB.all('classes').find(c=>c.name===name) || {name, capacity:30};
      const enrolled = DB.all('students').filter(s=>s.class===name).length;
      const teachers = DB.all('teachers').filter(t=>t.classes && t.classes.includes(name)).map(t=>t.name);
      return {...rec, enrolled, teachers, level: classLevel(name)};
    });
    body.innerHTML = `<div class="grid grid-3"></div>`;
    const grid = body.querySelector('.grid');
    grid.innerHTML = rows.map(c=>`
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <h3 style="font-size:17px;">${c.name} ${UI.badge(c.level==='primary'?'Primary':'Nursery','blue')}</h3>
            <div class="row-sub" style="margin-top:4px;">${c.teachers.length ? c.teachers.join(', ') : 'No teacher assigned'}</div>
          </div>
          ${canEdit? `<button class="icon-action" data-edit="${c.name}">${ICONS.edit(13)}</button>`:''}
        </div>
        <div class="bar-track" style="margin-top:16px;"><div class="bar-fill" style="width:${Math.min(100,Math.round(c.enrolled/(c.capacity||30)*100))}%"></div></div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:var(--ink-faint);">
          <span>${c.enrolled} enrolled</span><span>Capacity ${c.capacity||30}</span>
        </div>
      </div>`).join('');
    if(canEdit){
      grid.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', ()=>{
        const existing = DB.all('classes').find(c=>c.name===b.dataset.edit);
        openClassForm(existing || {name:b.dataset.edit, capacity:30});
      }));
    }
  }

  function openClassForm(record){
    UI.openModal({
      title:'Edit class capacity',
      bodyHTML: `<div class="form-grid"><div class="field"><label>Class</label><input value="${record.name}" disabled/></div><div class="field"><label>Capacity</label><input type="number" name="capacity" value="${record.capacity||30}"/></div></div>`,
      footHTML:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save</button>`,
      onMount:(modal, close)=>{
        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-save]').addEventListener('click', ()=>{
          const capacity = Number(modal.querySelector('[name="capacity"]').value)||30;
          const existing = DB.all('classes').find(c=>c.name===record.name);
          if(existing) DB.update('classes', existing.id, {capacity});
          else DB.add('classes', {name:record.name, capacity});
          UI.toast('Class updated'); close(); renderClasses();
        });
      }
    });
  }
  container.querySelector('#add-class')?.addEventListener('click', ()=>{
    const unset = CLASS_NAMES.find(n=>!DB.all('classes').some(c=>c.name===n));
    openClassForm({name: unset || CLASS_NAMES[0], capacity:30});
  });

  function subjectFields(){
    return [
      {name:'name', label:'Subject name', required:true},
      {name:'code', label:'Subject code'},
      {name:'level', label:'Taught in', type:'select', options:[{value:'nursery',label:'Nursery'},{value:'primary',label:'Primary'},{value:'both',label:'Both'}]},
    ];
  }
  function renderSubjects(){
    body.innerHTML = `<div class="table-wrap" id="subj-tbl"></div>`;
    UI.dataTable(body.querySelector('#subj-tbl'), {
      rows: DB.all('subjects'),
      searchKeys:['name','code'],
      searchPlaceholder:'Search subjects…',
      filters:[{key:'level', label:'Level', options:['nursery','primary','both']}],
      toolbarExtra: canEdit ? `<button class="btn btn-sm btn-primary" data-add-subject>${ICONS.plus(13)} Add Subject</button>` : '',
      columns:[
        {label:'Subject', key:'name'},
        {label:'Code', render:r=>`<span class="mono">${r.code||'—'}</span>`},
        {label:'Taught in', render:r=>UI.badge(r.level==='both'?'Nursery & Primary':(r.level==='primary'?'Primary':'Nursery'),'blue')},
      ],
      actions: r=> canEdit? `<button class="icon-action" data-edit="${r.id}">${ICONS.edit(14)}</button><button class="icon-action" data-del="${r.id}">${ICONS.trash(14)}</button>` : '',
      onRender:(el)=>{
        el.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', ()=>openSubjectForm(DB.get('subjects', b.dataset.edit))));
        el.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click', ()=>{
          UI.confirmDialog('Delete this subject?', ()=>{ DB.remove('subjects', b.dataset.del); UI.toast('Subject removed'); renderSubjects(); });
        }));
        el.querySelectorAll('[data-add-subject]').forEach(b=>b.addEventListener('click', ()=>openSubjectForm(null)));
      }
    });
  }
  function openSubjectForm(record){
    const f = subjectFields();
    UI.openModal({
      title: record?'Edit subject':'Add subject',
      bodyHTML: UI.renderForm(f, record||{level:'primary'}),
      footHTML:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save</button>`,
      onMount:(modal, close)=>{
        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-save]').addEventListener('click', ()=>{
          const data = UI.readForm(modal, f);
          if(!data.name){ UI.toast('Subject name required','error'); return; }
          if(record) DB.update('subjects', record.id, data); else DB.add('subjects', data);
          UI.toast('Subject saved'); close(); renderSubjects();
        });
      }
    });
  }
  renderClasses();
};
