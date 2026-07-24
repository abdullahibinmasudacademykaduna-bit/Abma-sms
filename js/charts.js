/* =========================================================
   Greenwood SMS — chart helpers (thin wrapper over Chart.js)
   ========================================================= */

const CHARTS = (function(){
  const instances = {};
  const palette = ['#2D6A4F','#74C69D','#DE9B3A','#3B6FA8','#C1443D','#95D5B2'];

  function destroy(id){
    if(instances[id]){ instances[id].destroy(); delete instances[id]; }
  }

  function isDark(){ return document.documentElement.getAttribute('data-theme')==='dark'; }

  function baseOpts(extra){
    const gridColor = isDark() ? 'rgba(255,255,255,.06)' : 'rgba(15,43,34,.06)';
    const tickColor = isDark() ? '#AFC3B9' : '#5B6B63';
    return Object.assign({
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ color: tickColor, font:{family:'Inter', size:11.5}, usePointStyle:true, boxWidth:8 } } },
      scales:{
        x:{ grid:{ display:false }, ticks:{ color: tickColor, font:{size:11} } },
        y:{ grid:{ color:gridColor }, ticks:{ color: tickColor, font:{size:11} } }
      }
    }, extra||{});
  }

  function unavailable(canvasId){
    const ctx = document.getElementById(canvasId);
    if(ctx && ctx.parentElement){
      ctx.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--ink-faint);font-size:12.5px;text-align:center;padding:0 16px;">Charts need an internet connection to load (Chart.js library).</div>';
    }
  }

  function line(canvasId, {labels, datasets}){
    if(typeof Chart === 'undefined'){ unavailable(canvasId); return; }
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if(!ctx) return;
    instances[canvasId] = new Chart(ctx, {
      type:'line',
      data:{ labels, datasets: datasets.map((d,i)=>({
        label:d.label, data:d.data, borderColor: d.color||palette[i%palette.length],
        backgroundColor: (d.color||palette[i%palette.length])+'22', fill:true, tension:.4,
        pointRadius:0, pointHoverRadius:4, borderWidth:2.4
      })) },
      options: baseOpts({ plugins:{ legend:{ display: datasets.length>1, labels:baseOpts().plugins.legend.labels } } })
    });
  }

  function bar(canvasId, {labels, datasets, stacked}){
    if(typeof Chart === 'undefined'){ unavailable(canvasId); return; }
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if(!ctx) return;
    instances[canvasId] = new Chart(ctx, {
      type:'bar',
      data:{ labels, datasets: datasets.map((d,i)=>({
        label:d.label, data:d.data, backgroundColor: d.color||palette[i%palette.length],
        borderRadius:6, maxBarThickness:26
      })) },
      options: baseOpts({
        plugins:{ legend:{ display: datasets.length>1, labels:baseOpts().plugins.legend.labels } },
        scales:{ x:{ stacked: !!stacked, grid:{display:false}, ticks:baseOpts().scales.x.ticks }, y:{ stacked: !!stacked, grid:baseOpts().scales.y.grid, ticks:baseOpts().scales.y.ticks } }
      })
    });
  }

  function doughnut(canvasId, {labels, data, colors}){
    if(typeof Chart === 'undefined'){ unavailable(canvasId); return; }
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if(!ctx) return;
    instances[canvasId] = new Chart(ctx, {
      type:'doughnut',
      data:{ labels, datasets:[{ data, backgroundColor: colors||palette, borderWidth:0 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'68%',
        plugins:{ legend:{ position:'bottom', labels:{ color: isDark()?'#AFC3B9':'#5B6B63', font:{family:'Inter', size:11.5}, usePointStyle:true, boxWidth:8, padding:14 } } } }
    });
  }

  return { line, bar, doughnut, destroy, palette };
})();
