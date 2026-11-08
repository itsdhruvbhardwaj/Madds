(() => {
  function create({api,notify}) {
    const $ = id => document.getElementById(id), base = "/api/admin/settings/credits";
    let epoch=0,revision=null,saved=null,busy=false,loading=false,ticket=0;
    const form=$("app-settings-form"), input=form.elements.welcomeCredits;
    function controls(){input.disabled=busy||loading||revision===null;$("app-settings-save").disabled=busy||loading||revision===null||input.value.trim()===""||Number(input.value)===saved;$("app-settings-refresh").disabled=busy||loading;$("app-settings-save").ariaBusy=String(busy);$("app-settings-refresh").ariaBusy=String(loading);}
    function accept(data){revision=data.revision;saved=data.welcomeCredits;input.value=String(saved);$("app-settings-current").textContent=`Current welcome credits: ${saved}`;$("app-settings-editor").textContent=data.updatedAt?`Last changed by ${data.updatedByName||"Team member"} · ${window.MaddsDates.dateTime(data.updatedAt)}`:"Default amount; no Workspace override saved yet.";}
    async function refresh(){
      if(busy||loading)return;
      if(revision!==null&&input.value!==String(saved)&&!window.confirm("Discard your unsaved welcome-credit change and refresh?"))return;
      loading=true;controls();const session=epoch,request=++ticket;$("app-settings-error").textContent="";
      try{const data=await api(base);if(session===epoch&&request===ticket)accept(data);}
      catch(failure){if(session===epoch){revision=null;$("app-settings-error").textContent=failure.message;}}
      finally{if(session===epoch){loading=false;controls();}}
    }
    async function save(event){
      event.preventDefault();if(busy||loading||revision===null)return;
      const amount=Number(input.value);
      if(input.value.trim()===""||!Number.isInteger(amount)||amount<0||amount>100000){$("app-settings-error").textContent="Enter a whole number from 0 to 100,000.";return;}
      if(amount===saved)return;
      if(!window.confirm(`Give ${amount} welcome credits to future signups? Existing accounts keep their current balance.`))return;
      busy=true;controls();const session=epoch;$("app-settings-error").textContent="";
      try{const data=await api(base,{method:"PATCH",body:JSON.stringify({welcomeCredits:amount,expectedRevision:revision})});if(session!==epoch)return;accept(data);notify("Welcome credits saved. Applies to future email and Google signups.");}
      catch(failure){if(session===epoch)$("app-settings-error").textContent=failure.message;}
      finally{if(session===epoch){busy=false;controls();}}
    }
    input.addEventListener("input",controls);form.addEventListener("submit",save);$("app-settings-refresh").addEventListener("click",refresh);
    function reset(){epoch++;ticket++;revision=null;saved=null;busy=false;loading=false;input.value="";$("app-settings-error").textContent="";$("app-settings-current").textContent="";$("app-settings-editor").textContent="";controls();}
    controls();return {refresh,reset};
  }
  const exported={create};if(typeof module!=="undefined"&&module.exports)module.exports=exported;else window.MaddsSettings=exported;
})();
