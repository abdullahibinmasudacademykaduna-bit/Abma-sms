/* Greenwood SMS — Generic CRUD module factory
   Powers the simpler list-style modules so each one doesn't
   need bespoke table/modal wiring repeated by hand. */
window.MODULES = window.MODULES || {};

function makeCrudModule(cfg){
  // cfg: {collection, crumb, title, fields, columns, searchKeys, filters, editRoles, itemLabel, scopeByClass}
  return function(container, ctx){
    const canEdit = cfg.editRoles ? cfg.editRoles.includes(ctx.user.role) : true;
    const scoped = cfg.scopeByClass ? getScopedClasses(ctx) : null;

    container.innerHTML = `
      ${UI.pageHeader(cfg.crumb, cfg.title, canEdit ? `<button class="btn btn-primary" id="add-item">${ICONS.plus(16)} Add ${cfg.itemLabel}</button>` : '')}
      ${scoped ? `<p class="row-sub" style="margin-bottom:14px;">Showing items for your assigned class${scoped.length===1?'':'es'}: <strong>${scoped.join(', ')||'none assigned yet'}</strong></p>` : ''}
      <div class="table-wrap" id="generic-tbl"></div>
    `;

    function openForm(record){
      const fields = typeof cfg.fields === 'function' ? cfg.fields() : cfg.fields;
      UI.openModal({
        title: record ? `Edit ${cfg.itemLabel}` : `Add ${cfg.itemLabel}`,
        large:true,
        bodyHTML: UI.renderForm(fields, record || cfg.defaults || {}),
        footHTML: `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${record?'Save changes':'Add ' + cfg.itemLabel}</button>`,
        onMount:(modal, close)=>{
          modal.querySelector('[data-cancel]').addEventListener('click', close);
          modal.querySelector('[data-save]').addEventListener('click', ()=>{
            const data = UI.readForm(modal, fields);
            if(cfg.validate){
              const err = cfg.validate(data);
              if(err){ UI.toast(err, 'error'); return; }
            }
            if(record) DB.update(cfg.collection, record.id, data);
            else DB.add(cfg.collection, data);
            UI.toast(`${cfg.itemLabel} saved`);
            close(); renderTable();
          });
        }
      });
    }
    container.querySelector('#add-item')?.addEventListener('click', ()=>openForm(null));

    function renderTable(){
      let rows = DB.all(cfg.collection);
      if(cfg.transformRows) rows = cfg.transformRows(rows);
      if(scoped) rows = rows.filter(r => scoped.includes(r.class));
      UI.dataTable(container.querySelector('#generic-tbl'), {
        rows,
        searchKeys: cfg.searchKeys || [],
        searchPlaceholder: `Search ${cfg.title.toLowerCase()}…`,
        filters: scoped ? (cfg.filters||[]).filter(f=>f.key!=='class') : (cfg.filters || []),
        columns: cfg.columns,
        actions: r => canEdit ? `<button class="icon-action" data-edit="${r.id}">${ICONS.edit(14)}</button><button class="icon-action" data-del="${r.id}">${ICONS.trash(14)}</button>` : '',
        onRender:(el)=>{
          el.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', ()=>{
            const rec = DB.get(cfg.collection, b.dataset.edit);
            openForm(rec);
          }));
          el.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click', ()=>{
            UI.confirmDialog(`Remove this ${cfg.itemLabel.toLowerCase()}?`, ()=>{ DB.remove(cfg.collection, b.dataset.del); UI.toast(`${cfg.itemLabel} removed`); renderTable(); });
          }));
        }
      });
    }
    renderTable();
  };
}

/* ---------------- Inventory ---------------- */
MODULES.inventory = makeCrudModule({
  collection:'inventory', crumb:'Resources', title:'Inventory Management', itemLabel:'Item',
  editRoles:['Super Admin','Principal','Accountant'],
  searchKeys:['item','category'],
  filters:[{key:'category', label:'Category', options:['Stationery','Electronics','Toys & Learning Aids','Health','Furniture']}],
  fields:[
    {name:'item', label:'Item name', required:true, full:true},
    {name:'category', label:'Category', type:'select', options:['Stationery','Electronics','Toys & Learning Aids','Health','Furniture']},
    {name:'quantity', label:'Quantity', type:'number'},
    {name:'reorderLevel', label:'Reorder level', type:'number'},
    {name:'unit', label:'Unit'},
  ],
  columns:[
    {label:'Item', key:'item'},
    {label:'Category', key:'category'},
    {label:'Quantity', render:r=>`${r.quantity} ${r.unit}`},
    {label:'Status', render:r=> r.quantity<=r.reorderLevel ? UI.badge('Reorder soon','amber') : UI.badge('In stock','green')},
  ]
});

/* ---------------- Health Records ---------------- */
MODULES.health = makeCrudModule({
  collection:'health', crumb:'Welfare', title:'Health Records', itemLabel:'Record',
  editRoles:['Super Admin','Principal'],
  searchKeys:[],
  transformRows: rows => rows.map(r=>{
    const s = DB.get('students', r.studentId);
    return {...r, studentName: s?s.name:'Unknown', class: s?s.class:''};
  }),
  fields: () => [
    {name:'studentId', label:'Student', type:'select', options: DB.all('students').map(s=>({value:s.id,label:`${s.name} (${s.class})`})), full:true, required:true},
    {name:'condition', label:'Known condition (allergy, asthma, etc.)', full:true},
    {name:'lastCheckup', label:'Last checkup', type:'date'},
    {name:'notes', label:'Notes', type:'textarea', full:true},
  ],
  columns:[
    {label:'Student', key:'studentName'},
    {label:'Class', key:'class'},
    {label:'Condition', render:r=> (!r.condition || r.condition==='None')? UI.badge('None','green') : UI.badge(r.condition,'amber')},
    {label:'Last checkup', render:r=>UI.fmtDate(r.lastCheckup)},
  ]
});

/* ---------------- Events ---------------- */
MODULES.events = makeCrudModule({
  collection:'events', crumb:'Community', title:'Event Management', itemLabel:'Event',
  editRoles:['Super Admin','Principal','Head Teacher'],
  searchKeys:['title','category'],
  filters:[{key:'category', label:'Category', options:['Meeting','Holiday','Sports','Celebration','Academic']}],
  defaults:{category:'Meeting'},
  fields:[
    {name:'title', label:'Event title', required:true, full:true},
    {name:'date', label:'Date', type:'date', required:true},
    {name:'category', label:'Category', type:'select', options:['Meeting','Holiday','Sports','Celebration','Academic']},
  ],
  columns:[
    {label:'Event', key:'title'},
    {label:'Date', render:r=>UI.fmtDate(r.date)},
    {label:'Category', render:r=>UI.badge(r.category,'blue')},
  ]
});

/* ---------------- Communication ---------------- */
MODULES.comms = makeCrudModule({
  collection:'communications', crumb:'Community', title:'Communication Center', itemLabel:'Message',
  editRoles:['Super Admin','Principal','Accountant'],
  searchKeys:['message','audience'],
  defaults:{channel:'SMS', status:'Delivered', sentAt:new Date().toISOString().slice(0,10)},
  fields:[
    {name:'channel', label:'Channel', type:'select', options:['SMS','Email','Push Notification']},
    {name:'audience', label:'Audience', type:'select', options:['All Parents','All Students','All Staff','All']},
    {name:'message', label:'Message', type:'textarea', full:true, required:true},
    {name:'sentAt', label:'Send date', type:'date'},
  ],
  columns:[
    {label:'Channel', render:r=>UI.badge(r.channel,'blue')},
    {label:'Audience', key:'audience'},
    {label:'Message', render:r=>`<div style="max-width:320px;">${r.message}</div>`},
    {label:'Sent', render:r=>UI.fmtDate(r.sentAt)},
    {label:'Status', render:r=>UI.badge(r.status||'Delivered','green')},
  ]
});

/* ---------------- Assignments / Homework ---------------- */
MODULES.homework = makeCrudModule({
  collection:'assignments', crumb:'Academics', title:'Assignment & Homework', itemLabel:'Assignment',
  editRoles:['Super Admin','Principal','Head Teacher','Teacher'],
  searchKeys:['title','subject'],
  scopeByClass:true,
  filters:[{key:'class', label:'Class', options: CLASS_NAMES}, {key:'status', label:'Status', options:['Open','Closed']}],
  defaults:{status:'Open'},
  fields: () => [
    {name:'title', label:'Title', required:true, full:true},
    {name:'class', label:'Class', type:'select', options:CLASS_NAMES},
    {name:'subject', label:'Subject / Activity', type:'select', options:[...NURSERY_SUBJECTS, ...PRIMARY_SUBJECTS]},
    {name:'dueDate', label:'Due date', type:'date'},
    {name:'status', label:'Status', type:'select', options:['Open','Closed']},
  ],
  columns:[
    {label:'Title', key:'title'},
    {label:'Class', key:'class'},
    {label:'Subject', key:'subject'},
    {label:'Due', render:r=>UI.fmtDate(r.dueDate)},
    {label:'Status', render:r=>UI.badge(r.status, UI.statusTone(r.status))},
  ]
});

/* ---------------- Notice Board ---------------- */
MODULES.notice = makeCrudModule({
  collection:'notices', crumb:'Community', title:'Notice Board', itemLabel:'Notice',
  editRoles:['Super Admin','Principal','Head Teacher','Accountant'],
  searchKeys:['title','audience'],
  filters:[{key:'audience', label:'Audience', options:['All','Students','Parents','Staff']}],
  defaults:{audience:'All', date:new Date().toISOString().slice(0,10), pinned:false},
  fields:[
    {name:'title', label:'Title', required:true, full:true},
    {name:'audience', label:'Audience', type:'select', options:['All','Students','Parents','Staff']},
    {name:'date', label:'Date', type:'date'},
    {name:'body', label:'Message', type:'textarea', full:true, required:true},
  ],
  columns:[
    {label:'Title', render:r=>`<div class="row-name">${r.pinned?'📌 ':''}${r.title}</div><div class="row-sub">${(r.body||'').slice(0,60)}${(r.body||'').length>60?'…':''}</div>`},
    {label:'Audience', render:r=>UI.badge(r.audience,'blue')},
    {label:'Date', render:r=>UI.fmtDate(r.date)},
  ]
});
