import { escape, languageHTML } from './task-ui.js';
import { translate, translateError, normalizeLanguage, documentLanguage, format } from './i18n.js';

const $=selector=>document.querySelector(selector);
let language='ja',data=null,message='',busy=false,loading=false,controlKey=null;
let draft={studyIds:[],randomizeExperiments:false,randomizeChoices:false},requestId=null;
try{language=normalizeLanguage(JSON.parse(localStorage.getItem('classroom.language')));draft={...draft,...JSON.parse(localStorage.getItem('classroom.teacherPlan'))};}catch{}
const t=text=>translate(text,language);
const saveDraft=()=>{requestId=null;localStorage.setItem('classroom.teacherPlan',JSON.stringify(draft));};

function renderPage(){
  document.documentElement.lang=documentLanguage(language);document.title=t('実験の管理');
  document.querySelectorAll('[data-i18n]').forEach(element=>element.textContent=t(element.dataset.i18n));
  $('#language-control').innerHTML=languageHTML(language);
  $('#language-select').onchange=event=>{
    language=normalizeLanguage(event.target.value);localStorage.setItem('classroom.language',JSON.stringify(language));
    controlKey=null;renderPage();$('#language-select').focus();
  };
  render();
}
function render(){
  $('#teacher-error').textContent=message?translateError(message,language):'';
  if(!data)return;
  const active=Boolean(data.lesson),key=(data.lesson?.id||'idle')+':'+language+':'+busy;
  $('#classroom-status').textContent=t(active?'実施中':'待機中');
  $('#classroom-status').dataset.active=String(active);
  if(controlKey!==key){controlKey=key;renderControls();}
  const statusLabels={active:'回答中',completed:'完了',withdrawn:'中止'};
  $('#records').innerHTML=data.students.length?'<div class="table-scroll"><table class="session-table"><thead><tr>'+['学生証番号','状態','進捗'].map(label=>'<th scope="col">'+escape(t(label))+'</th>').join('')+'</tr></thead><tbody>'+data.students.map(student=>'<tr><td>'+escape(student.studentId)+'</td><td>'+escape(t(statusLabels[student.status]||'待機中'))+'</td><td>'+(student.runId?student.answered+' / '+student.totalTrials:'—')+'</td></tr>').join('')+'</tbody></table></div>':'<p class="empty-state">'+escape(t('ログインを待っています。'))+'</p>';
}
function renderControls(){
  const active=Boolean(data.lesson),settings=active?data.lesson.settings:draft;
  const enabled=data.studies.filter(study=>study.enabled);
  draft.studyIds=draft.studyIds.filter(id=>enabled.some(study=>study.id===id));
  const blocks=enabled.map(study=>'<article class="experiment-block"><label class="experiment-select"><span class="experiment-head"><input type="checkbox" name="study" value="'+escape(study.id)+'" aria-labelledby="study-title-'+study.id+'" aria-describedby="study-description-'+study.id+'"'+(settings.studyIds.includes(study.id)?' checked':'')+(active||busy?' disabled':'')+'><span class="experiment-title" id="study-title-'+study.id+'">'+escape(study.names[language])+'</span></span><span class="experiment-description" id="study-description-'+study.id+'">'+escape(study.description?.[language]||'')+'</span></label></article>').join('');
  $('#controls').innerHTML='<div class="selection-workspace"><div class="experiment-grid">'+blocks+'</div><aside class="control-panel" aria-labelledby="selection-count">'+
    '<span id="selection-count" aria-live="polite" aria-atomic="true"></span><ul id="selected-experiments" class="selected-experiments"></ul><div class="lesson-settings">'+
    '<label><input id="shuffle-experiments" type="checkbox"'+(settings.randomizeExperiments?' checked':'')+(active||busy?' disabled':'')+'>'+escape(t('学生ごとに実験順をランダム化'))+'</label>'+
    '<label><input id="shuffle-choices" type="checkbox"'+(settings.randomizeChoices?' checked':'')+(active||busy?' disabled':'')+'>'+escape(t('選択肢の位置をランダム化'))+'</label></div>'+
    '<div class="lesson-buttons"><button id="preview-action" class="button secondary">'+escape(t('プレビュー'))+'</button><button id="lesson-action" class="button primary"'+(busy?' disabled':'')+'>'+escape(t(active?'実験を終了':'開始する'))+'</button></div></aside></div>'+
    '<dialog id="end-dialog" aria-labelledby="end-title"><h2 id="end-title">'+escape(t('実施中の実験を終了しますか。'))+'</h2><div class="dialog-actions"><button id="cancel-end" class="button secondary">'+escape(t('戻る'))+'</button><button id="confirm-end" class="button primary">'+escape(t('終了する'))+'</button></div></dialog>';
  const updateCount=()=>{
    $('#selection-count').textContent=format('{count}件選択',language,{count:settings.studyIds.length});
    $('#selected-experiments').innerHTML=settings.studyIds.map(id=>enabled.find(study=>study.id===id)).filter(Boolean).map(study=>'<li>'+escape(study.names[language])+'</li>').join('');
    $('#lesson-action').disabled=busy||(!active&&!draft.studyIds.length);
    $('#preview-action').disabled=busy||!settings.studyIds.length;
  };
  $('#controls').onchange=()=>{
    if(active||busy)return;
    draft.studyIds=[...document.querySelectorAll('input[name=study]:checked:not(:disabled)')].map(input=>input.value);
    draft.randomizeExperiments=$('#shuffle-experiments').checked;draft.randomizeChoices=$('#shuffle-choices').checked;
    saveDraft();updateCount();
  };
  $('#lesson-action').onclick=()=>active?$('#end-dialog').showModal():start();
  $('#preview-action').onclick=()=>{
    const params=new URLSearchParams({studies:settings.studyIds.join(','),experiments:String(settings.randomizeExperiments),choices:String(settings.randomizeChoices),lang:language});
    location.href='/preview?'+params;
  };
  $('#cancel-end').onclick=()=>$('#end-dialog').close();
  $('#confirm-end').onclick=()=>end();updateCount();
}
async function mutate(path,body){
  const response=await fetch('/api/classroom/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const value=await response.json();if(!response.ok)throw new Error(value.error);return value;
}
async function start(){
  busy=true;message='';requestId??=crypto.randomUUID();render();
  try{await mutate('start',{...draft,requestId});requestId=null;await load();}
  catch(error){message=error.message||'接続できませんでした。';}
  finally{busy=false;render();}
}
async function end(){
  const id=data.lesson.id;$('#end-dialog').close();busy=true;message='';render();
  try{await mutate('end/'+id,{});await load();}
  catch(error){message=error.message||'接続できませんでした。';}
  finally{busy=false;render();}
}
async function load(){
  if(loading)return;loading=true;
  try{
    const response=await fetch('/api/classroom');if(!response.ok)throw new Error('回答一覧を取得できませんでした。');
    data=await response.json();
  }catch(error){message=error.message||'接続できませんでした。';}
  finally{loading=false;render();}
}
renderPage();load();setInterval(()=>{if(!busy)load();},2000);
