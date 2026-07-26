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

  function classFields(isNew){
    return [
      isNew
        ? {name:'name', label:'Class name', type:'text-datalist', options:DEFAULT_CLASS_NAMES, required:true, full:true, placeholder:'Type a class name, e.g. Primary 7'}
        : {name:'name', label:'Class name', full:true},
      {name:'capacity', label:'Capacity', type:'number'},
      {name:'level', label:'Level', type:'select', options:[{value:'nursery',label:'Nursery'},{value:'primary',label:'Primary'}]},
    ];
  }

  function renderClasses(){
    const list = getClassList();
    body.innerHTML = `<div class="grid grid-3"></div>`;
    const grid = body.querySelector('.grid');
    grid.innerHTML = list.map((c,i)=>{
      const enrolled = DB.all('students').filter(s=>s.class===c.name).length;
      const teachers = DB.all('teachers').filter(t=>t.classes && t.classes.includes(c.name)).map(t=>t.name);
      return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <h3 style="font-size:17px;">${c.name} ${UI.badge(classLevel(c.name)==='primary'?'Primary':'Nursery','blue')}</h3>
            <div class="row-sub" style="margin-top:4px;">${teachers.length ? teachers.join(', ') : 'No teacher assigned'}</div>
          </div>
          ${canEdit? `<div style="display:flex;gap:4px;">
            ${i>0?`<button class="icon-action" data-move-up="${c.id||c.name}" title="Move up" style="font-weight:700;">↑</button>`:''}
            <button class="icon-action" data-edit="${c.id||c.name}">${ICONS.edit(13)}</button>
            <button class="icon-action" data-del="${c.id||c.name}" data-name="${c.name}">${ICONS.trash(13)}</button>
          </div>`:''}
        </div>
        <div class="bar-track" style="margin-top:16px;"><div class="bar-fill" style="width:${Math.min(100,Math.round(enrolled/(c.capacity||30)*100))}%"></div></div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:var(--ink-faint);">
          <span>${enrolled} enrolled</span><span>Capacity ${c.capacity||30}</span>
        </div>
      </div>`;
    }).join('') || UI.emptyState('No classes yet', 'Click "Add Class" above to create your first one.');

    if(canEdit){
      grid.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', ()=>{
        const existing = DB.all('classes').find(c=>(c.id||c.name)===b.dataset.edit);
        openClassForm(existing, false);
      }));
      grid.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click', ()=>{
        const name = b.dataset.name;
        const enrolled = DB.all('students').filter(s=>s.class===name).length;
        const warning = enrolled
          ? `${enrolled} student${enrolled===1?'':'s'} ${enrolled===1?'is':'are'} currently enrolled in ${name}. Deleting it won't remove those students, but they'll need to be moved to another class. Delete anyway?`
          : `Delete ${name}? This can't be undone.`;
        UI.confirmDialog(warning, ()=>{
          const rec = DB.all('classes').find(c=>(c.id||c.name)===b.dataset.del);
          if(rec) DB.remove('classes', rec.id);
          UI.toast('Class deleted'); renderClasses();
        });
      }));
      grid.querySelectorAll('[data-move-up]').forEach(b=>b.addEventListener('click', ()=>{
        const idx = list.findIndex(c=>(c.id||c.name)===b.dataset.moveUp);
        if(idx<=0) return;
        const a = list[idx], p = list[idx-1];
        // Both need to be real DB records to persist an order swap —
        // synthesize one if this is still a default/unsaved suggestion.
        const ensure = (c)=> DB.all('classes').find(x=>x.name===c.name) || DB.add('classes', {name:c.name, capacity:c.capacity||30, level:c.level, order:c.order});
        const recA = ensure(a), recP = ensure(p);
        DB.update('classes', recA.id, {order: p.order ?? idx-1});
        DB.update('classes', recP.id, {order: a.order ?? idx});
        renderClasses();
      }));
    }
  }

  function openClassForm(record, isNew){
    const f = classFields(isNew);
    const defaults = record || {capacity:30, level:'nursery'};
    UI.openModal({
      title: isNew ? 'Add class' : 'Edit class',
      bodyHTML: UI.renderForm(f, defaults),
      footHTML:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save</button>`,
      onMount:(modal, close)=>{
        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-save]').addEventListener('click', ()=>{
          const data = UI.readForm(modal, f);
          if(!data.name || !data.name.trim()){ UI.toast('Class name is required','error'); return; }
          if(record && record.id){
            DB.update('classes', record.id, data);
          } else {
            if(DB.all('classes').some(c=>c.name===data.name.trim())){ UI.toast('A class with that name already exists','error'); return; }
            const maxOrder = DB.all('classes').reduce((m,c)=>Math.max(m, c.order??0), -1);
            DB.add('classes', {...data, name:data.name.trim(), order: maxOrder+1});
          }
          UI.toast('Class saved'); close(); renderClasses();
        });
      }
    });
  }
  container.querySelector('#add-class')?.addEventListener('click', ()=> openClassForm(null, true));

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
