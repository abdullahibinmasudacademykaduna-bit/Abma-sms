/* Greenwood SMS — Library management */
window.MODULES = window.MODULES || {};

MODULES.library = function(container, ctx){
  const canEdit = ctx.user.role === 'Super Admin';
  const categories = ['Science','Arts','Reference','Fiction','Language'];

  container.innerHTML = `
    ${UI.pageHeader('Resources', 'Library Management', canEdit? `<button class="btn btn-primary" id="add-book">${ICONS.plus(16)} Add Book</button>`:'')}
    <div class="tabs">
      <div class="tab active" data-tab="catalog">Catalog</div>
      <div class="tab" data-tab="loans">Issued Books</div>
    </div>
    <div id="tab-body"></div>
  `;
  const body = container.querySelector('#tab-body');
  container.querySelectorAll('.tab').forEach(t=>{
    t.addEventListener('click', ()=>{
      container.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
      t.dataset.tab==='catalog' ? renderCatalog() : renderLoans();
    });
  });

  function bookFields(){
    return [
      {name:'title', label:'Title', required:true, full:true},
      {name:'author', label:'Author'},
      {name:'isbn', label:'ISBN'},
      {name:'category', label:'Category', type:'select', options:categories},
      {name:'copies', label:'Total copies', type:'number'},
      {name:'available', label:'Available copies', type:'number'},
    ];
  }
  function openBookForm(record){
    const f = bookFields();
    UI.openModal({
      title: record?'Edit book':'Add book', large:true,
      bodyHTML: UI.renderForm(f, record||{copies:1, available:1}),
      footHTML:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Save</button>`,
      onMount:(modal, close)=>{
        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-save]').addEventListener('click', ()=>{
          const data = UI.readForm(modal, f);
          if(!data.title){ UI.toast('Title required','error'); return; }
          if(record) DB.update('library', record.id, data); else DB.add('library', data);
          UI.toast('Book saved'); close(); renderCatalog();
        });
      }
    });
  }
  container.querySelector('#add-book')?.addEventListener('click', ()=>openBookForm(null));

  function renderCatalog(){
    body.innerHTML = `<div class="table-wrap" id="lib-tbl"></div>`;
    UI.dataTable(body.querySelector('#lib-tbl'), {
      rows: DB.all('library'),
      searchKeys:['title','author','isbn'],
      searchPlaceholder:'Search catalog…',
      filters:[{key:'category', label:'Category', options:categories}],
      columns:[
        {label:'Title', render:r=>`<div class="row-name">${r.title}</div><div class="row-sub">${r.author}</div>`},
        {label:'ISBN', render:r=>`<span class="mono">${r.isbn}</span>`},
        {label:'Category', key:'category'},
        {label:'Availability', render:r=>`${r.available} / ${r.copies}`},
      ],
      actions: r => canEdit? `
        <button class="btn btn-sm btn-outline" data-issue="${r.id}" ${r.available<1?'disabled':''}>Issue</button>
        <button class="icon-action" data-edit="${r.id}">${ICONS.edit(14)}</button>
        <button class="icon-action" data-del="${r.id}">${ICONS.trash(14)}</button>` : '',
      onRender:(el)=>{
        el.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', ()=>openBookForm(DB.get('library', b.dataset.edit))));
        el.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click', ()=>UI.confirmDialog('Remove this book?', ()=>{ DB.remove('library', b.dataset.del); renderCatalog(); UI.toast('Book removed'); })));
        el.querySelectorAll('[data-issue]').forEach(b=>b.addEventListener('click', ()=>openIssueForm(DB.get('library', b.dataset.issue))));
      }
    });
  }

  function openIssueForm(book){
    const students = DB.all('students');
    UI.openModal({
      title:`Issue "${book.title}"`,
      bodyHTML: UI.renderForm([
        {name:'studentId', label:'Student', type:'select', options: students.map(s=>({value:s.id, label:`${s.name} (${s.class})`})), full:true, required:true},
        {name:'dueDate', label:'Due date', type:'date', required:true},
      ], {dueDate: new Date(Date.now()+14*864e5).toISOString().slice(0,10)}),
      footHTML:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>Issue book</button>`,
      onMount:(modal, close)=>{
        modal.querySelector('[data-cancel]').addEventListener('click', close);
        modal.querySelector('[data-save]').addEventListener('click', ()=>{
          const studentId = modal.querySelector('[name="studentId"]').value;
          const dueDate = modal.querySelector('[name="dueDate"]').value;
          DB.add('libraryLoans', {bookId:book.id, studentId, issueDate:new Date().toISOString().slice(0,10), dueDate, returned:false});
          DB.update('library', book.id, {available: Math.max(0, book.available-1)});
          UI.toast('Book issued'); close(); renderCatalog();
        });
      }
    });
  }

  function renderLoans(){
    const books = Object.fromEntries(DB.all('library').map(b=>[b.id,b]));
    const students = Object.fromEntries(DB.all('students').map(s=>[s.id,s]));
    body.innerHTML = `<div class="table-wrap" id="loan-tbl"></div>`;
    const rows = DB.all('libraryLoans').map(l=>({...l, bookTitle: books[l.bookId]?.title, studentName: students[l.studentId]?.name}));
    UI.dataTable(body.querySelector('#loan-tbl'), {
      rows,
      searchKeys:['bookTitle','studentName'],
      searchPlaceholder:'Search loans…',
      columns:[
        {label:'Book', key:'bookTitle'},
        {label:'Student', key:'studentName'},
        {label:'Issued', render:r=>UI.fmtDate(r.issueDate)},
        {label:'Due', render:r=>UI.fmtDate(r.dueDate)},
        {label:'Status', render:r=>UI.badge(r.returned?'Returned':'Issued', r.returned?'green':'amber')},
      ],
      actions: r=> canEdit && !r.returned ? `<button class="btn btn-sm btn-outline" data-return="${r.id}">Mark returned</button>` : '',
      onRender:(el)=>{
        el.querySelectorAll('[data-return]').forEach(b=>b.addEventListener('click', ()=>{
          const loan = DB.get('libraryLoans', b.dataset.return);
          DB.update('libraryLoans', loan.id, {returned:true});
          const book = DB.get('library', loan.bookId);
          if(book) DB.update('library', book.id, {available: Math.min(book.copies, book.available+1)});
          UI.toast('Book marked as returned'); renderLoans();
        }));
      }
    });
  }

  renderCatalog();
};
