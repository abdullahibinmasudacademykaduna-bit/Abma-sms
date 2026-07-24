/* Greenwood SMS — hash router */
const ROUTER = (function(){
  let onChange = null;

  function currentRoute(){
    const hash = location.hash.replace(/^#\//,'') || 'dashboard';
    return hash.split('?')[0];
  }

  function start(handler, defaultRoute){
    onChange = handler;
    window.addEventListener('hashchange', ()=> handler(currentRoute()));
    if(!location.hash) location.hash = '#/' + (defaultRoute || 'dashboard');
    handler(currentRoute());
  }

  function go(route){ location.hash = '#/' + route; }

  // Re-renders the current screen without navigating — used by a
  // real-time backend (e.g. Firestore onSnapshot) to reflect changes
  // made by other users/devices as they arrive.
  function refresh(){ if(onChange) onChange(currentRoute()); }

  return { start, go, refresh, currentRoute };
})();
