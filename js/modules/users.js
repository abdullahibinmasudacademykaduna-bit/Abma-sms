/* Greenwood SMS — User Management
   Lets Super Admin / Principal create accounts, assign roles from the
   same ROLE_PERMS matrix used everywhere else, and link a Parent or
   Student account to a student record (and a Teacher account to a
   teacher record) so portals show the right person's data. */
window.MODULES = window.MODULES || {};

MODULES.userManagement = function(container, ctx){
  const canEdit = ['Super Admin','Principal'].includes(ctx.user.role);

  container.innerHTML = `
    ${UI.pageHeader('Administration', 'User Management', canEdit ? `<button class="btn btn-primary" id="add-user">${ICONS.plus(16)} Add User</button>` : '')}
    <div class="grid grid-4" style="margin-bottom:20px;">
      <div class="card stat-card"><div class="label">Total accounts</div><div class="value">${DB.all('users').length}</div></div>
      <div class="card stat-card"><div class="label">Active</div><div class="value">${DB.all('users').filter(u=>(u.status||'Active')==='Active').length}</div></div>
      <div class="card stat-card"><div class="label">Inactive</div><div class="value">${DB.all('users').filter(u=>u.status==='Inactive').length}</div></div>
      <div class="card stat-card"><div class="label">Roles in use</div><div class="value">${new Set(DB.all('users').map(u=>u.role)).size}</div></div>
    </div>
    <div class="table-wrap" id="user-tbl"></div>
    <p class="row-sub" style="margin-top:14px;">Need to change what a role can access? Head to <a style="color:var(--green-600);font-weight:600;cursor:pointer;" data-go="roles">Roles &amp; Permissions</a> to see the full matrix.</p>
  `;
  container.querySelector('[data-go]')?.addEventListener('click', e=> location.hash = '#/' + e.target.dataset.go);

  function linkFields(role){
    if(role==='Parent' || role==='Student'){
      return [{name:'linkedStudentId', label: role==='Parent' ? 'Linked child (student)' : 'Linked student record', type:'select',
        options:[{value:'', label:'— None —'}, ...DB.all('students').map(s=>({value:s.id, label:`${s.name} (${s.class})`}))], full:true}];
    }
    if(role==='Teacher'){
      return [{name:'linkedTeacherId', label:'Linked academic staff record', type:'select',
        options:[{value:'', label:'— None —'}, ...DB.all('teachers').map(t=>({value:t.id, label:t.name}))], full:true}];
    }
    return [{name:'linkedStaffId', label:'Linked non-academic staff record (optional) — enables salary-paid notifications', type:'select',
      options:[{value:'', label:'— None —'}, ...DB.all('staff').map(s=>({value:s.id, label:`${s.name} (${s.role})`}))], full:true}];
  }

  function baseFields(role){
    return [
      {name:'name', label:'Full name', required:true, full:true},
      {name:'email', label:'Email', type:'email', required:true},
      {name:'role', label:'Role', type:'select', options:AUTH.ROLES, required:true},
      {name:'status', label:'Status', type:'select', options:['Active','Inactive']},
    ];
  }

  function openForm(record){
    let role = record?.role || 'Teacher';
    let formValues = {...record};
    const {modal, close} = UI.openModal({
      title: record ? 'Edit user' : 'Add user',
      large:true,
      bodyHTML: `<div id="user-form-fields"></div>`,
      footHTML: `<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${record?'Save changes':'Create user'}</button>`,
      onMount:(modal, close)=>{
        const fieldsHost = modal.querySelector('#user-form-fields');
        function captureValues(){
          const fields = [...baseFields(role), ...linkFields(role)];
          Object.assign(formValues, UI.readForm(modal, fields));
        }
        function renderFields(){
          const fields = [...baseFields(role), ...linkFields(role)];
          fieldsHost.innerHTML = UI.renderForm(fields, {...formValues, role, status: formValues.status || 'Active'});
          fieldsHost.querySelector('[name="role"]').addEventListener('change', e=>{
            captureValues();
            role = e.target.value; renderFields();
          });
        }
        renderFields();

        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-save]').addEventListener('click', ()=>{
          const fields = [...baseFields(role), ...linkFields(role)];
          const data = UI.readForm(modal, fields);
          if(!data.name || !data.email || !data.role){ UI.toast('Name, email and role are required','error'); return; }
          const dupe = DB.all('users').find(u=> u.email.toLowerCase()===data.email.toLowerCase() && u.id!==record?.id);
          if(dupe){ UI.toast('A user with that email already exists','error'); return; }
          if(record) DB.update('users', record.id, data);
          else DB.add('users', data);
          UI.toast(record ? 'User updated' : 'User created');
          close(); renderTable();
        });
      }
    });
  }
  container.querySelector('#add-user')?.addEventListener('click', ()=>openForm(null));

  function linkedLabel(u){
    if(u.role==='Parent' || u.role==='Student'){
      const s = DB.get('students', u.linkedStudentId);
      return s ? `${s.name} (${s.class})` : '<span class="row-sub">Not linked</span>';
    }
    if(u.role==='Teacher'){
      const t = DB.get('teachers', u.linkedTeacherId);
      return t ? t.name : '<span class="row-sub">Not linked</span>';
    }
    if(u.linkedStaffId){
      const s = DB.get('staff', u.linkedStaffId);
      return s ? `${s.name} (${s.role})` : '<span class="row-sub">Not linked</span>';
    }
    return '<span class="row-sub">—</span>';
  }

  function renderTable(){
    const rows = DB.all('users').map(u=>({...u, status: u.status || 'Active'}));
    UI.dataTable(container.querySelector('#user-tbl'), {
      rows,
      searchKeys:['name','email','role'],
      searchPlaceholder:'Search users…',
      filters:[{key:'role', label:'Role', options:AUTH.ROLES}, {key:'status', label:'Status', options:['Active','Inactive']}],
      columns:[
        {label:'User', render:r=>`<div style="display:flex;align-items:center;gap:10px;"><div class="avatar" style="width:30px;height:30px;font-size:11px;">${UI.initials(r.name)}</div><div><div class="row-name">${r.name}</div><div class="row-sub">${r.email}</div></div></div>`},
        {label:'Role', render:r=>UI.badge(r.role,'blue')},
        {label:'Linked record', render:linkedLabel},
        {label:'Status', render:r=>UI.badge(r.status, UI.statusTone(r.status))},
      ],
      actions: r => canEdit ? `
        <button class="icon-action" data-reset="${r.id}" title="Send password reset">${ICONS.mail(14)}</button>
        <button class="icon-action" data-toggle="${r.id}" title="${r.status==='Active'?'Deactivate':'Activate'}">${ICONS.check(14)}</button>
        <button class="icon-action" data-edit="${r.id}">${ICONS.edit(14)}</button>
        <button class="icon-action" data-del="${r.id}">${ICONS.trash(14)}</button>
      ` : '',
      onRender:(el)=>{
        el.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', ()=>openForm(DB.get('users', b.dataset.edit))));
        el.querySelectorAll('[data-reset]').forEach(b=>b.addEventListener('click', ()=>{
          UI.toast('Password reset link sent to ' + DB.get('users', b.dataset.reset).email);
        }));
        el.querySelectorAll('[data-toggle]').forEach(b=>b.addEventListener('click', ()=>{
          const u = DB.get('users', b.dataset.toggle);
          if(u.id===ctx.user.id){ UI.toast("You can't deactivate your own account", 'error'); return; }
          const next = (u.status||'Active')==='Active' ? 'Inactive' : 'Active';
          DB.update('users', u.id, {status: next});
          UI.toast(`${u.name} is now ${next}`);
          renderTable();
        }));
        el.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click', ()=>{
          if(b.dataset.del === ctx.user.id){ UI.toast("You can't delete your own account", 'error'); return; }
          const superAdmins = DB.all('users').filter(u=>u.role==='Super Admin');
          const target = DB.get('users', b.dataset.del);
          if(target.role==='Super Admin' && superAdmins.length<=1){ UI.toast('At least one Super Admin account must remain', 'error'); return; }
          UI.confirmDialog(`Remove ${target.name}'s account? They will no longer be able to sign in.`, ()=>{
            DB.remove('users', b.dataset.del); UI.toast('User removed'); renderTable();
          });
        }));
      }
    });
  }
  renderTable();
};
