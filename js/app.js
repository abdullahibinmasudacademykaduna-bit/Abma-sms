/* =========================================================
   Greenwood SMS — app bootstrap
   ========================================================= */

const NAV = [
  { section:'Overview', items:[
    {key:'dashboard', label:'Dashboard', icon:'dashboard'},
  ]},
  { section:'Portal', items:[
    {key:'teacherPortal', label:'My Portal', icon:'teachers', roleOnly:'Teacher'},
    {key:'parentPortal', label:'My Portal', icon:'parent', roleOnly:'Parent'},
    {key:'studentPortal', label:'My Portal', icon:'id', roleOnly:'Student'},
  ]},
  { section:'People', items:[
    {key:'students', label:'Students', icon:'students'},
    {key:'teachers', label:'Academic Staff', icon:'teachers'},
    {key:'staff', label:'Non-Academic Staff', icon:'staff'},
  ]},
  { section:'Academics', items:[
    {key:'classes', label:'Classes & Subjects', icon:'classes'},
    {key:'attendance', label:'Attendance', icon:'attendance'},
    {key:'exams', label:'Exams & Results', icon:'exams'},
    {key:'timetable', label:'Timetable', icon:'timetable'},
    {key:'homework', label:'Assignments', icon:'homework'},
  ]},
  { section:'Finance', items:[
    {key:'fees', label:'Fees & Finance', icon:'fees'},
    {key:'expenditure', label:'Expenditures', icon:'money'},
  ]},
  { section:'Resources', items:[
    {key:'library', label:'Library', icon:'library'},
    {key:'inventory', label:'Inventory', icon:'inventory'},
    {key:'health', label:'Health Records', icon:'health'},
  ]},
  { section:'Community', items:[
    {key:'notice', label:'Notice Board', icon:'notice'},
    {key:'events', label:'Events', icon:'events'},
    {key:'comms', label:'Communication', icon:'comms'},
  ]},
  { section:'Administration', items:[
    {key:'userManagement', label:'User Management', icon:'userManage'},
    {key:'roles', label:'Roles & Permissions', icon:'roles'},
    {key:'reports', label:'Reports & Analytics', icon:'reports'},
    {key:'settings', label:'Settings', icon:'settings'},
  ]},
];

window.APP = (function(){
  const app = document.getElementById('app');
  let currentUser = null;

  function defaultRouteFor(role){
    if(role==='Parent') return 'parentPortal';
    if(role==='Student') return 'studentPortal';
    if(role==='Teacher') return 'teacherPortal';
    return 'dashboard';
  }

  function setTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('greenwood_theme', theme);
  }

  function initTheme(){
    const saved = localStorage.getItem('greenwood_theme') || 'light';
    setTheme(saved);
  }

  function visibleNav(role){
    return NAV.map(section=>({
      section: section.section,
      items: section.items.filter(item=>{
        if(item.roleOnly && item.roleOnly !== role) return false;
        if(item.roleOnly && item.roleOnly === role) return true;
        return AUTH.can(role, item.key);
      })
    })).filter(s=>s.items.length);
  }

  function renderLogin(){
    const s = DB.settings();
    if(AUTH.loginUIMode === 'password') return renderPasswordLogin(s);
    return renderDemoLogin(s);
  }

  function renderPasswordLogin(s){
    app.innerHTML = `
      <div class="auth-screen">
        <div class="auth-card">
          <div class="auth-brand">
            <div>
              <div class="seal">GW</div>
              <h1>${s.schoolName || 'Greenwood International School'}</h1>
              <p>${s.motto || 'Knowledge · Character · Excellence'}. Sign in to manage students, staff, academics, and finances — all in one place.</p>
            </div>
            <div class="auth-stats">
              <div><b>${DB.count('students')}</b><span>Students</span></div>
              <div><b>${DB.count('teachers')}</b><span>Academic Staff</span></div>
              <div><b>${DB.count('classes')}</b><span>Classes</span></div>
            </div>
          </div>
          <div class="auth-form">
            <div>
              <h2>Welcome back</h2>
              <div class="sub">Sign in with your school email and password.</div>
            </div>
            <div class="field">
              <label>Email</label>
              <input type="email" id="login-email" placeholder="you@greenwood.edu" />
            </div>
            <div class="field">
              <label>Password</label>
              <input type="password" id="login-pass" placeholder="••••••••" />
            </div>
            <button class="btn btn-primary btn-block" id="login-btn">Sign in</button>
            <p class="sub" style="text-align:center;"><a href="#" id="forgot-pass">Forgot your password?</a></p>
          </div>
        </div>
      </div>
    `;
    const emailEl = app.querySelector('#login-email');
    const passEl = app.querySelector('#login-pass');
    const btn = app.querySelector('#login-btn');

    function doLogin(){
      const email = emailEl.value.trim();
      const password = passEl.value;
      if(!email || !password){ UI.toast('Enter your email and password','error'); return; }
      btn.disabled = true; btn.textContent = 'Signing in…';
      AUTH.login(email, password)
        .then(user=>{ currentUser = user; renderShell(); })
        .catch(err=>{ UI.toast(err.message || 'Sign in failed', 'error'); })
        .finally(()=>{ btn.disabled = false; btn.textContent = 'Sign in'; });
    }
    btn.addEventListener('click', doLogin);
    passEl.addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
    app.querySelector('#forgot-pass').addEventListener('click', (e)=>{
      e.preventDefault();
      const email = emailEl.value.trim();
      if(!email){ UI.toast('Enter your email first, then click "Forgot your password?"','error'); return; }
      AUTH.resetPassword(email)
        .then(()=> UI.toast('Password reset email sent — check your inbox'))
        .catch(err=> UI.toast(err.message || 'Could not send reset email', 'error'));
    });
  }

  function renderDemoLogin(s){
    let selectedRole = AUTH.ROLES[0];
    app.innerHTML = `
      <div class="auth-screen">
        <div class="auth-card">
          <div class="auth-brand">
            <div>
              <div class="seal">GW</div>
              <h1>${s.schoolName || 'Greenwood International School'}</h1>
              <p>${s.motto || 'Knowledge · Character · Excellence'}. Sign in to manage students, staff, academics, and finances — all in one place.</p>
            </div>
            <div class="auth-stats">
              <div><b>${DB.count('students')}</b><span>Students</span></div>
              <div><b>${DB.count('teachers')}</b><span>Academic Staff</span></div>
              <div><b>${DB.count('classes')}</b><span>Classes</span></div>
            </div>
          </div>
          <div class="auth-form">
            <div>
              <h2>Welcome back</h2>
              <div class="sub">Choose your role to preview the dashboard experience.</div>
            </div>
            <div class="field">
              <label>Sign in as</label>
              <div class="role-grid" id="role-grid">
                ${AUTH.ROLES.map(r=>`<div class="role-chip ${r===selectedRole?'active':''}" data-role="${r}">${r}</div>`).join('')}
              </div>
            </div>
            <div class="field" id="account-field">
              <label>Account</label>
              <select id="login-account"></select>
            </div>
            <div class="field">
              <label>Email</label>
              <input type="email" id="login-email" placeholder="you@greenwood.edu" readonly />
            </div>
            <div class="field">
              <label>Password</label>
              <input type="password" id="login-pass" placeholder="••••••••" />
            </div>
            <button class="btn btn-primary btn-block" id="login-btn">Sign in</button>
            <p class="sub" style="text-align:center;">Demo mode — any password works. Data is stored locally on this device.</p>
          </div>
        </div>
      </div>
    `;
    function refreshAccountField(){
      const matches = DB.all('users').filter(u=>u.role===selectedRole && (u.status||'Active')==='Active');
      const field = app.querySelector('#account-field');
      const select = app.querySelector('#login-account');
      if(matches.length <= 1){
        field.classList.add('hidden');
        select.innerHTML = matches.map(u=>`<option value="${u.id}">${u.email}</option>`).join('');
      } else {
        field.classList.remove('hidden');
        select.innerHTML = matches.map(u=>`<option value="${u.id}">${u.name} — ${u.email}</option>`).join('');
      }
      app.querySelector('#login-email').value = matches[0] ? matches[0].email : '';
      select.onchange = ()=>{
        const u = DB.get('users', select.value);
        app.querySelector('#login-email').value = u ? u.email : '';
      };
    }
    refreshAccountField();
    app.querySelectorAll('[data-role]').forEach(chip=>{
      chip.addEventListener('click', ()=>{
        app.querySelectorAll('[data-role]').forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
        selectedRole = chip.dataset.role;
        refreshAccountField();
      });
    });

    app.querySelector('#login-btn').addEventListener('click', doLogin);
    app.querySelector('#login-pass').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });

    function doLogin(){
      const select = app.querySelector('#login-account');
      const user = DB.get('users', select.value) || DB.all('users').find(u=>u.role===selectedRole);
      if(!user){ UI.toast('No user found for that role','error'); return; }
      if((user.status||'Active')==='Inactive'){ UI.toast('This account has been deactivated','error'); return; }
      AUTH.login(user.id);
      currentUser = user;
      renderShell();
    }
  }

  function renderShell(){
    currentUser = currentUser || AUTH.currentUser();
    if(!currentUser){ renderLogin(); return; }
    window.__CURRENCY__ = DB.settings().currency || 'GHS';

    const nav = visibleNav(currentUser.role);
    const settings = DB.settings();

    app.innerHTML = `
      <div class="layout">
        <div class="overlay-scrim hidden" id="scrim"></div>
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-head">
            <div class="seal">GW</div>
            <div class="name">${settings.schoolName?.split(' ')[0] || 'Greenwood'}<small>SMS · ${settings.term||''}</small></div>
          </div>
          <nav class="nav-scroll" id="nav-scroll">
            ${nav.map(section=>`
              <div class="nav-section">
                <div class="nav-section-title">${section.section}</div>
                ${section.items.map(item=>`
                  <div class="nav-item" data-route="${item.key}">
                    <span class="ic">${ICONS[item.icon](17)}</span>
                    <span>${item.label}</span>
                  </div>
                `).join('')}
              </div>
            `).join('')}
          </nav>
          <div class="sidebar-foot">
            <div class="user-chip">
              <div class="avatar">${UI.initials(currentUser.name)}</div>
              <div style="flex:1;min-width:0;">
                <div class="u-name">${currentUser.name}</div>
                <div class="u-role">${currentUser.role}</div>
              </div>
              <button class="icon-action" id="logout-btn" title="Sign out">${ICONS.logout(15)}</button>
            </div>
          </div>
        </aside>

        <div class="main">
          <header class="topbar">
            <button class="icon-btn menu-btn" id="menu-btn">${ICONS.menu(18)}</button>
            <div class="search-box">${ICONS.search(15)}<input type="text" id="global-search" placeholder="Search students, teachers, notices…"/></div>
            <div class="topbar-actions">
              <button class="icon-btn" id="theme-btn" title="Toggle theme"></button>
              <button class="icon-btn" id="bell-btn" title="Notifications">${ICONS.bell(17)}<span class="dot"></span></button>
              <div id="offline-pill"></div>
            </div>
          </header>
          <main class="page" id="page-root"></main>
        </div>
      </div>
    `;

    updateThemeIcon();
    document.getElementById('theme-btn').addEventListener('click', ()=>{
      const cur = document.documentElement.getAttribute('data-theme');
      setTheme(cur==='dark' ? 'light' : 'dark');
      updateThemeIcon();
    });
    document.getElementById('logout-btn').addEventListener('click', ()=>{
      Promise.resolve(AUTH.logout()).then(()=>{ currentUser=null; renderLogin(); });
    });

    updateBellDot();
    document.getElementById('bell-btn').addEventListener('click', openNotifications);

    const layout = document.querySelector('.layout');
    const menuBtn = document.getElementById('menu-btn');
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('scrim');
    function isMobile(){ return window.innerWidth <= 960; }
    function syncScrim(){
      const shown = !layout.classList.contains('sidebar-collapsed') && isMobile();
      scrim.classList.toggle('hidden', !shown);
    }
    // Desktop starts with the sidebar visible; mobile starts collapsed (overlay-style) — same as before, just now toggleable on both.
    if(isMobile()) layout.classList.add('sidebar-collapsed');
    syncScrim();
    menuBtn.addEventListener('click', ()=>{ layout.classList.toggle('sidebar-collapsed'); syncScrim(); });
    scrim.addEventListener('click', ()=>{ layout.classList.add('sidebar-collapsed'); syncScrim(); });

    document.querySelectorAll('.nav-item').forEach(item=>{
      item.addEventListener('click', ()=>{
        ROUTER.go(item.dataset.route);
        if(isMobile()){ layout.classList.add('sidebar-collapsed'); syncScrim(); }
      });
    });

    document.getElementById('global-search').addEventListener('input', e=>{
      handleGlobalSearch(e.target.value);
    });

    updateOfflinePill();
    window.addEventListener('online', updateOfflinePill);
    window.addEventListener('offline', updateOfflinePill);

    ROUTER.start(route=>{
      const allowed = AUTH.can(currentUser.role, route) || NAV.some(s=>s.items.some(i=>i.key===route && i.roleOnly===currentUser.role));
      if(!allowed){ ROUTER.go(defaultRouteFor(currentUser.role)); return; }
      renderPage(route);
    }, defaultRouteFor(currentUser.role));
  }

  /* An activity with no forUserId is a school-wide notice everyone sees.
     One with a forUserId (e.g. "your salary was paid") only shows up for
     that specific account — everyone else's bell and feed ignore it. */
  function visibleActivities(){
    return DB.all('activities').filter(a => !a.forUserId || a.forUserId === currentUser?.id);
  }

  function updateBellDot(){
    const btn = document.getElementById('bell-btn');
    if(!btn) return;
    const hasUnread = visibleActivities().some(a=>!a.read);
    const dot = btn.querySelector('.dot');
    if(dot) dot.classList.toggle('hidden', !hasUnread);
  }

  function openNotifications(){
    function bodyHTML(){
      const items = visibleActivities();
      if(!items.length) return UI.emptyState('No notifications yet');
      return items.map(a=>`
        <div class="activity-item" style="${a.read?'opacity:.6;':''}">
          <div class="activity-dot" style="background:${a.read?'var(--ink-faint)':'var(--green-500)'}"></div>
          <div style="flex:1;">
            <div class="t">${a.text}</div>
            <div class="d">${a.time}</div>
          </div>
          ${a.read ? '' : `<button class="btn btn-sm btn-outline" data-mark-read="${a.id}">Mark read</button>`}
        </div>`).join('');
    }
    const {modal} = UI.openModal({
      title:'Notifications',
      bodyHTML: bodyHTML(),
      footHTML: `<button class="btn btn-outline" data-mark-all>Mark all as read</button><button class="btn btn-primary" data-close>Close</button>`,
      onMount:(modalEl)=>{
        function rewire(){
          modalEl.querySelector('.modal-body').innerHTML = bodyHTML();
          modalEl.querySelectorAll('[data-mark-read]').forEach(b=>b.addEventListener('click', ()=>{
            DB.update('activities', b.dataset.markRead, {read:true});
            updateBellDot(); rewire();
          }));
        }
        rewire();
        modalEl.querySelector('[data-mark-all]').addEventListener('click', ()=>{
          visibleActivities().forEach(a=>{ if(!a.read) DB.update('activities', a.id, {read:true}); });
          updateBellDot(); rewire();
          UI.toast('All notifications marked as read');
        });
      }
    });
  }

  function updateThemeIcon(){
    const btn = document.getElementById('theme-btn');
    if(!btn) return;
    const dark = document.documentElement.getAttribute('data-theme')==='dark';
    btn.innerHTML = dark ? ICONS.sun(17) : ICONS.moon(17);
  }

  function updateOfflinePill(){
    const pill = document.getElementById('offline-pill');
    if(!pill) return;
    pill.innerHTML = navigator.onLine ? '' : `<span class="badge badge-amber" style="display:flex;align-items:center;gap:5px;">${ICONS.wifiOff(12)} Offline</span>`;
  }

  function renderPage(key){
    document.querySelectorAll('.nav-item').forEach(n=> n.classList.toggle('active', n.dataset.route===key));
    const root = document.getElementById('page-root');
    root.innerHTML = '';
    const mod = MODULES[key] || MODULES.dashboard;
    try{
      mod(root, {user: currentUser});
    }catch(err){
      console.error(err);
      root.innerHTML = UI.emptyState('Something went wrong loading this page', String(err.message||err));
    }
  }

  function handleGlobalSearch(q){
    if(!q || q.length<2) return;
    // Lightweight: jump to students/teachers module and let its own search box take over is out of scope here;
    // instead we just surface a toast with quick match counts as a demo of global search.
    const ql = q.toLowerCase();
    const sHits = DB.all('students').filter(s=>s.name.toLowerCase().includes(ql)).length;
    const tHits = DB.all('teachers').filter(t=>t.name.toLowerCase().includes(ql)).length;
    if(sHits || tHits){
      // no-op visual feedback kept subtle; full result navigation left to dedicated module search
    }
  }

  function boot(){
    initTheme();
    AUTH.ready.then(()=>{
      currentUser = AUTH.currentUser();
      if(currentUser) renderShell(); else renderLogin();
    });
    registerServiceWorker();
  }

  function registerServiceWorker(){
    if('serviceWorker' in navigator){
      window.addEventListener('load', ()=>{
        navigator.serviceWorker.register('sw.js').catch(()=>{ /* offline-first is best-effort */ });
      });
    }
  }

  return { boot, setTheme, renderShell };
})();

APP.boot();
