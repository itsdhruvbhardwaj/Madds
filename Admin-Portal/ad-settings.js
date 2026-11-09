(() => {
  const placements = {
    generation_continue:"Continue after photo selection", custom_generate:"Custom creation: Generate",
    avatar_saved:"Edit avatar: saved successfully", buy_more:"Buy More: open credit options",
    my_generations:"Open My Generations", home_see_all:"Home: See all",
    image_download:"Download image", appearance_applied:"Apply style preference",
    timed_navigation:"Usage-based ad at navigation transitions",
  };
  function create({api,notify}) {
    const $=id=>document.getElementById(id), form=$("ad-settings-form"), base="/api/admin/settings/ads";
    const host=$("ad-placement-options");
    for(const [key,text] of Object.entries(placements)) {
      const label=document.createElement("label"),input=document.createElement("input");
      label.className="watermark-enable"; input.type="checkbox";input.name=key;
      label.append(input,document.createTextNode(` ${text}`));host.append(label);
    }
    let revision=null,saved="",busy=false,loading=false,epoch=0;
    function values() {
      return {enabled:form.elements.enabled.checked,bannersEnabled:form.elements.bannersEnabled.checked,
        rewardedEnabled:form.elements.rewardedEnabled.checked,minGapSeconds:Number(form.elements.minGapSeconds.value),
        timedIntervalSeconds:Number(form.elements.timedIntervalSeconds.value),
        placements:Object.fromEntries(Object.keys(placements).map(key=>[key,form.elements[key].checked]))};
    }
    function controls() {
      for(const input of form.querySelectorAll("input"))input.disabled=busy||loading||revision===null;
      $("ad-settings-refresh").disabled=busy||loading;$("ad-settings-refresh").ariaBusy=String(loading);
      $("ad-settings-save").disabled=busy||loading||revision===null||JSON.stringify(values())===saved;
      $("ad-settings-save").ariaBusy=String(busy);
    }
    function accept(data) {
      revision=data.revision;
      for(const key of ["enabled","bannersEnabled","rewardedEnabled"])form.elements[key].checked=data[key];
      for(const key of ["minGapSeconds","timedIntervalSeconds"])form.elements[key].value=data[key];
      for(const key of Object.keys(placements))form.elements[key].checked=data.placements[key];
      saved=JSON.stringify(values());
      $("ad-settings-editor").textContent=data.updatedAt?`Last changed by ${data.updatedByName||"Team member"} · ${window.MaddsDates.dateTime(data.updatedAt)}`:"Default settings; no Workspace override saved yet.";
    }
    async function refresh() {
      if(busy||loading)return;
      if(revision!==null&&saved!==JSON.stringify(values())&&!window.confirm("Discard unsaved ad settings?"))return;
      const session=epoch;loading=true;controls();$("ad-settings-error").textContent="";
      try {const data=await api(base);if(session===epoch)accept(data);}
      catch(error){if(session===epoch){revision=null;$("ad-settings-error").textContent=error.message;}}
      finally{if(session===epoch){loading=false;controls();}}
    }
    form.addEventListener("submit",async event=>{
      event.preventDefault();if(busy||loading||revision===null||saved===JSON.stringify(values()))return;
      if(!form.reportValidity())return;
      const session=epoch;busy=true;controls();$("ad-settings-error").textContent="";
      try {const data=await api(base,{method:"PATCH",body:JSON.stringify({...values(),expectedRevision:revision})});
        if(session===epoch){accept(data);notify("Ad settings saved. Updated apps pick them up on their next settings refresh.");}}
      catch(error){if(session===epoch)$("ad-settings-error").textContent=error.message;}
      finally{if(session===epoch){busy=false;controls();}}
    });
    form.addEventListener("input",controls);$("ad-settings-refresh").addEventListener("click",refresh);
    function reset(){epoch++;revision=null;saved="";busy=false;loading=false;form.reset();$("ad-settings-error").textContent="";$("ad-settings-editor").textContent="";controls();}
    controls();return {refresh,reset};
  }
  window.MaddsAdSettings={create};
})();
