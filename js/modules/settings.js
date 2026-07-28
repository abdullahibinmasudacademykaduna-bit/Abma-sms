/* Greenwood SMS — Settings module */
window.MODULES = window.MODULES || {};

/* Resizes and center-crops any uploaded image to a small square
   (maxSize x maxSize) JPEG, returned as a data URL. Two problems this
   solves at once: an unprocessed phone photo (often several MB, and
   rarely square) risks silently exceeding Firestore's 1MB-per-document
   limit on the settings doc, and stored as-is it stretches oddly in
   the fixed-size logo preview and print letterhead. Center-cropping
   here means whatever shape the original photo is, the result always
   looks like a clean square logo instead of a stretched/off-center
   photo. */
function resizeLogoImage(dataUrl, maxSize){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=>{
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = maxSize;
      canvas.height = maxSize;
      const ctx2d = canvas.getContext('2d');
      ctx2d.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

MODULES.settings = function(container, ctx){
  const canEdit = ['Super Admin','Principal'].includes(ctx.user.role);
  const s = DB.settings();

  container.innerHTML = `
    ${UI.pageHeader('Administration', 'Settings')}
    <div class="tabs">
      <div class="tab active" data-tab="profile">School Profile</div>
      <div class="tab" data-tab="grading">Grading Scale</div>
      <div class="tab" data-tab="appearance">Appearance</div>
      <div class="tab" data-tab="data">Backup & Restore</div>
    </div>
    <div id="tab-body"></div>
  `;
  const body = container.querySelector('#tab-body');
  container.querySelectorAll('.tab').forEach(t=>{
    t.addEventListener('click', ()=>{
      container.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
      ({profile:renderProfile, grading:renderGrading, appearance:renderAppearance, data:renderData})[t.dataset.tab]();
    });
  });

  function saveSettings(patch){
    DB.updateSettings(patch);
  }

  function renderProfile(){
    const fields = [
      {name:'schoolName', label:'School name', full:true},
      {name:'motto', label:'Motto', full:true},
      {name:'address', label:'Address', full:true},
      {name:'phone', label:'Phone'},
      {name:'email', label:'Email', type:'email'},
      {name:'term', label:'Current term'},
      {name:'session', label:'Current session', placeholder:'e.g. 2025/2026'},
      {name:'currency', label:'Currency code'},
    ];
    const current = DB.settings();
    body.innerHTML = `<div class="card">
      <div class="section-title">School logo</div>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
        <div id="logo-preview" style="width:64px;height:64px;border-radius:12px;overflow:hidden;background:var(--surface-2);display:flex;align-items:center;justify-content:center;">
          ${current.logoDataUrl ? `<img src="${current.logoDataUrl}" style="width:100%;height:100%;object-fit:cover;"/>` : `<span class="row-sub">No logo</span>`}
        </div>
        ${canEdit ? `<div><input type="file" accept="image/*" id="logo-input"/><p class="row-sub" style="margin-top:6px;">Shows on the printed report card letterhead.</p></div>` : ''}
      </div>
      <div class="section-title">School details</div>
      ${UI.renderForm(fields, current)}
      ${canEdit ? `<div style="text-align:right;margin-top:16px;display:flex;justify-content:flex-end;gap:8px;">
        <button class="btn btn-outline" id="notify-term">${ICONS.bell(15)} Notify Term/Session Change</button>
        <button class="btn btn-primary" id="save-profile">Save changes</button>
      </div>` : ''}
    </div>`;
    if(canEdit){
      body.querySelector('#logo-input')?.addEventListener('change', (e)=>{
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = ev=>{
          resizeLogoImage(ev.target.result, 320).then(resized=>{
            saveSettings({logoDataUrl: resized});
            body.querySelector('#logo-preview').innerHTML = `<img src="${resized}" style="width:100%;height:100%;object-fit:cover;"/>`;
            UI.toast('Logo updated');
          }).catch(()=>{
            UI.toast('Could not process that image — try a different file', 'error');
          });
        };
        reader.readAsDataURL(file);
      });
      body.querySelector('#save-profile').addEventListener('click', ()=>{
        const data = {};
        fields.forEach(f=> data[f.name] = body.querySelector(`[name="${f.name}"]`).value);
        saveSettings(data);
        window.__CURRENCY__ = data.currency;
        UI.toast('School profile updated');
      });
      body.querySelector('#notify-term').addEventListener('click', ()=>{
        const term = body.querySelector('[name="term"]').value.trim();
        const session = body.querySelector('[name="session"]').value.trim();
        if(!term && !session){ UI.toast('Set a term and/or session first','error'); return; }
        saveSettings({term, session});
        DB.add('activities', {
          text: `The school has moved to a new term/session: ${term || '—'}${session ? ' · '+session : ''}.`,
          type:'notice', time:'Just now', read:false, forUserId: null,
        });
        UI.toast('Every account has been notified of the term/session change');
      });
    }
  }

  function renderGrading(){
    const scale = (DB.settings().gradingScale || []).slice();
    function drawTable(){
      body.innerHTML = `
        <div class="card">
          <div class="section-title">Grading scale <span class="row-sub" style="font-weight:400;">Used everywhere a score becomes a grade, including the printed report card</span></div>
          <div class="table-wrap"><div class="scroll-x"><table>
            <thead><tr><th>Min score</th><th>Max score</th><th>Grade</th><th>Remark</th>${canEdit?'<th></th>':''}</tr></thead>
            <tbody>
              ${scale.map((b,i)=>`<tr data-i="${i}">
                <td><input type="number" data-f="min" value="${b.min}" style="width:70px;" ${canEdit?'':'disabled'}/></td>
                <td><input type="number" data-f="max" value="${b.max}" style="width:70px;" ${canEdit?'':'disabled'}/></td>
                <td><input type="text" data-f="grade" value="${b.grade}" style="width:60px;" ${canEdit?'':'disabled'}/></td>
                <td><input type="text" data-f="remark" value="${b.remark}" ${canEdit?'':'disabled'}/></td>
                ${canEdit?`<td><button class="icon-action" data-remove="${i}">${ICONS.trash(13)}</button></td>`:''}
              </tr>`).join('')}
            </tbody>
          </table></div></div>
          ${canEdit ? `<div style="margin-top:14px;display:flex;justify-content:space-between;">
            <button class="btn btn-outline btn-sm" id="add-band">${ICONS.plus(13)} Add band</button>
            <button class="btn btn-primary" id="save-grading">Save grading scale</button>
          </div>` : ''}
        </div>`;
      if(canEdit){
        body.querySelector('#add-band').addEventListener('click', ()=>{
          scale.push({min:0,max:0,grade:'',remark:''}); drawTable();
        });
        body.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click', ()=>{
          scale.splice(Number(b.dataset.remove),1); drawTable();
        }));
        body.querySelector('#save-grading').addEventListener('click', ()=>{
          const rows = body.querySelectorAll('tr[data-i]');
          const updated = Array.from(rows).map(tr=>({
            min: Number(tr.querySelector('[data-f="min"]').value)||0,
            max: Number(tr.querySelector('[data-f="max"]').value)||0,
            grade: tr.querySelector('[data-f="grade"]').value.trim() || '?',
            remark: tr.querySelector('[data-f="remark"]').value.trim() || '—',
          }));
          saveSettings({gradingScale: updated});
          UI.toast('Grading scale saved');
        });
      }
    }
    drawTable();
  }

  function renderAppearance(){
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    body.innerHTML = `
      <div class="card">
        <div class="section-title">Theme</div>
        <div class="chip-list">
          <span class="chip ${theme==='light'?'active':''}" data-theme-choice="light">${ICONS.sun(14)} Light</span>
          <span class="chip ${theme==='dark'?'active':''}" data-theme-choice="dark">${ICONS.moon(14)} Dark</span>
        </div>
        <p class="row-sub" style="margin-top:14px;">Theme preference is saved to this device and applied instantly across the app.</p>
      </div>`;
    body.querySelectorAll('[data-theme-choice]').forEach(chip=>{
      chip.addEventListener('click', ()=>{
        window.APP.setTheme(chip.dataset.themeChoice);
        renderAppearance();
      });
    });
  }

  function renderData(){
    body.innerHTML = `
      <div class="grid grid-2">
        <div class="card">
          <div class="section-title">Export backup</div>
          <p class="row-sub" style="margin-bottom:14px;">Download a full JSON snapshot of all school records for safekeeping.</p>
          <button class="btn btn-primary" id="export-btn">${ICONS.download(15)} Download backup (.json)</button>
        </div>
        <div class="card">
          <div class="section-title">Restore backup</div>
          <p class="row-sub" style="margin-bottom:14px;">Upload a previously exported JSON file. This replaces all current data.</p>
          <input type="file" accept="application/json" id="restore-input" style="margin-bottom:10px;"/>
          <button class="btn btn-outline" id="restore-btn">${ICONS.upload(15)} Restore from file</button>
        </div>
      </div>
      <div class="card" style="margin-top:18px;">
        <div class="section-title" style="color:var(--red-500);">Reset demo data</div>
        <p class="row-sub" style="margin-bottom:14px;">Wipes all data and reloads fresh sample records. Cannot be undone.</p>
        <button class="btn btn-danger" id="reset-btn">Reset to sample data</button>
      </div>
    `;
    body.querySelector('#export-btn').addEventListener('click', ()=>{
      const blob = new Blob([DB.exportJSON()], {type:'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'greenwood-sms-backup.json'; a.click();
      UI.toast('Backup downloaded');
    });
    body.querySelector('#restore-btn').addEventListener('click', ()=>{
      const input = body.querySelector('#restore-input');
      const file = input.files[0];
      if(!file){ UI.toast('Choose a file first','error'); return; }
      const reader = new FileReader();
      reader.onload = e=>{
        try{ DB.importJSON(e.target.result); UI.toast('Backup restored'); location.reload(); }
        catch(err){ UI.toast('Invalid backup file','error'); }
      };
      reader.readAsText(file);
    });
    body.querySelector('#reset-btn').addEventListener('click', ()=>{
      UI.confirmDialog('This will erase all current data and restore fresh sample data. Continue?', ()=>{
        DB.reset(); UI.toast('Sample data restored'); location.reload();
      });
    });
  }

  renderProfile();
};
