(() => {
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const sorted=sections=>[...sections].sort((a,b)=>a.order-b.order||a.title.localeCompare(b.title));
  function create({api,notify,onSaved}) {
    const $=id=>document.getElementById(id);let baseline=[],draft=[],busy=false,epoch=0,stale=false;
    const visible=()=>draft.filter(s=>s.visible), dirty=()=>visible().map(s=>s.id).join("|")!==baseline.filter(s=>s.visible).map(s=>s.id).join("|");
    function snapshot(sections){return sections.map(s=>({id:s.id,order:Number(s.order)||0,visible:!!s.visible}));}
    function render(){
      const rows=visible();
      $("home-order-list").innerHTML=rows.map((s,index)=>`<li class="home-order-row"><span class="home-order-number">${index+1}</span><div><strong>${esc(s.title)}</strong><small>Home position ${index+1}</small></div><div class="home-order-actions"><button type="button" class="button secondary" data-home-move="${esc(s.id)}" data-direction="-1" aria-label="Move ${esc(s.title)} up" ${busy||index===0?"disabled":""}>↑ <span>Up</span></button><button type="button" class="button secondary" data-home-move="${esc(s.id)}" data-direction="1" aria-label="Move ${esc(s.title)} down" ${busy||index===rows.length-1?"disabled":""}>↓ <span>Down</span></button></div></li>`).join("")||'<li class="muted">No collections are enabled on Home. Enable “Show on Home” below first.</li>';
      $("home-order-state").textContent=stale?"The collection layout changed while you were arranging it. Reload the layout before saving.":dirty()?"Unsaved Home order":"Saved Home order";
      $("home-order-save").disabled=busy||stale||!dirty();$("home-order-reset").disabled=busy||(!dirty()&&!stale);
    }
    function update(sections){
      const next=sorted(sections);
      if(dirty()){
        if(JSON.stringify(snapshot(next))!==JSON.stringify(snapshot(baseline)))stale=true;
      }else{baseline=next.map(s=>({...s}));draft=next.map(s=>({...s}));stale=false;}
      render();
    }
    $("home-order-list").addEventListener("click",event=>{
      const b=event.target.closest("[data-home-move]");if(!b||busy||stale)return;
      const rows=visible(),index=rows.findIndex(s=>s.id===b.dataset.homeMove),next=index+Number(b.dataset.direction);
      if(index<0||next<0||next>=rows.length)return;
      [rows[index],rows[next]]=[rows[next],rows[index]];
      draft=[...rows,...draft.filter(s=>!s.visible)];render();
    });
    let latest=[];
    $("home-order-reset").addEventListener("click",async()=>{
      if(busy)return;busy=true;render();const session=epoch;
      try{const result=await api("/api/admin/catalog/home-sections");if(session!==epoch)return;latest=result.sections;baseline=sorted(latest).map(s=>({...s}));draft=baseline.map(s=>({...s}));stale=false;onSaved(latest);}
      catch(failure){if(session===epoch)notify(failure.message,true);}
      finally{if(session===epoch){busy=false;render();}}
    });
    $("home-order-save").addEventListener("click",async()=>{
      if(busy||stale||!dirty())return;
      busy=true;render();const session=epoch;
      try{
        const result=await api("/api/admin/catalog/home-sections/order",{method:"PATCH",body:JSON.stringify({orderedIds:[...visible(),...draft.filter(s=>!s.visible)].map(s=>s.id),expected:snapshot(baseline)})});
        if(session!==epoch)return;
        latest=result.sections;baseline=sorted(latest);draft=baseline.map(s=>({...s}));stale=false;onSaved(result.sections);notify("Home collection order saved. The app will use it on its next Home refresh.");
      }catch(failure){if(session===epoch){stale=true;notify(failure.message,true);}}
      finally{if(session===epoch){busy=false;render();}}
    });
    function reset(){epoch++;baseline=[];draft=[];latest=[];stale=false;busy=false;render();}
    return {update(sections){latest=sections;update(sections);},reset};
  }
  const exported={create};if(typeof module!=="undefined"&&module.exports)module.exports=exported;else window.MaddsHomeOrder=exported;
})();
