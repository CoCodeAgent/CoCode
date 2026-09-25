const API_BASE = 'https://cocode.ohfun.online';
let key='',offset=0;
let historyOffset=0;
const $=id=>document.getElementById(id);
const status=(s,error=false)=>{$('status').textContent=s;$('status').classList.toggle('danger',error)};
async function api(path,options={}){const r=await fetch(API_BASE + path,{...options,headers:{'content-type':'application/json',authorization:'Bearer '+key},cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.detail||'操作失败');return j}
function option(user){if(!$('target').querySelector('option[value="'+user.id+'"]')){const o=document.createElement('option');o.value=user.id;o.textContent=(user.username||user.email)+' · '+user.email;$('target').append(o)}}
async function load(more=false){
  const data=await api('/admin/users?q='+encodeURIComponent($('search').value)+'&offset='+(more?offset:0));
  let table=$('users').querySelector('table');
  if(!more){
    $('users').replaceChildren();table=document.createElement('table');
    const head=document.createElement('tr');
    for(const title of ['账户','状态','操作']){const th=document.createElement('th');th.textContent=title;head.append(th)}
    table.append(head);$('users').append(table);
  }
  for(const u of data.users){
    option(u);
    const tr=document.createElement('tr');
    const name=document.createElement('td');name.textContent=(u.username||'未命名')+'\n'+u.email+'\nID '+u.id;name.style.whiteSpace='pre-line';
    const state=document.createElement('td');state.textContent=u.banned?'已封禁':'正常';state.title=u.ban_reason||'';
    const actions=document.createElement('td');actions.className='actions';
    const msg=document.createElement('button');msg.type='button';msg.textContent='发消息';msg.className='small';msg.onclick=()=>{$('target').value=String(u.id);syncNewUserOption();$('title').focus()};
    const ban=document.createElement('button');ban.type='button';ban.textContent=u.banned?'解封':'封禁';ban.className='small';ban.onclick=()=>openBanDialog(u,state,ban);
    actions.append(msg,ban);tr.append(name,state,actions);table.append(tr);
  }
  offset=data.nextOffset;$('more').classList.toggle('hidden',offset===null);
  if(!data.users.length&&!more){const p=document.createElement('p');p.textContent='没有匹配的账户';$('users').append(p)}
}
let pendingBan=null;
function openBanDialog(user,state,button){
  pendingBan={user,state,button};
  const unban=!!user.banned;
  $('banDialogTitle').textContent=unban?'解除封禁':'封禁账户';
  $('banTarget').textContent=(user.username||user.email)+' · '+user.email+' · ID '+user.id;
  $('banReasonWrap').classList.toggle('hidden',unban);$('banReason').classList.toggle('hidden',unban);
  $('banReason').value='';$('banDialogStatus').textContent='';
  $('banConfirm').textContent=unban?'确认解封':'确认封禁';
  $('banDialog').showModal();
  if(!unban)$('banReason').focus();
}
$('banCancel').onclick=()=>$('banDialog').close();
$('banDialog').addEventListener('cancel',event=>{if($('banConfirm').disabled)event.preventDefault()});
$('banDialog').addEventListener('close',()=>{pendingBan=null;$('banReason').value='';$('banDialogStatus').textContent=''});
$('banForm').onsubmit=async event=>{
  event.preventDefault();
  if(!pendingBan)return;
  const {user,state,button}=pendingBan;
  const banned=!user.banned;
  const reason=banned?$('banReason').value.trim():'';
  $('banConfirm').disabled=true;$('banCancel').disabled=true;$('banDialogStatus').textContent='';
  try{
    const result=await api('/admin/users/'+user.id+'/ban',{method:'POST',body:JSON.stringify({banned,reason})});
    user.banned=banned;user.ban_reason=reason;
    state.textContent=banned?'已封禁':'正常';state.title=reason;button.textContent=banned?'解封':'封禁';
    $('banDialog').close();
    status((banned?'封禁':'解封')+'已生效，已通知 '+(result.delivered||0)+' 个在线连接');
    void load().catch(error=>status('操作已生效，但列表刷新失败：'+error.message,true));
  }catch(error){$('banDialogStatus').textContent=error instanceof Error?error.message:'操作失败'}
  finally{$('banConfirm').disabled=false;$('banCancel').disabled=false}
};
$('loginForm').onsubmit=async e=>{e.preventDefault();key=$('key').value.trim();try{await load();$('key').value='';$('login').classList.add('hidden');$('dashboard').classList.remove('hidden');$('logout').classList.remove('hidden');$('history').classList.remove('hidden');$('pollsAdmin').classList.remove('hidden');status('');void loadHistory().catch(e=>status(e.message,true));void loadPollAdmin().catch(e=>status(e.message,true))}catch(e){key='';status(e.message,true)}};
$('logout').onclick=()=>{key='';location.reload()};$('searchForm').onsubmit=e=>{e.preventDefault();load().catch(e=>status(e.message,true))};$('more').onclick=()=>load(true).catch(e=>status(e.message,true));
$('messageForm').onsubmit=async e=>{e.preventDefault();if($('target').value==='all'&&!confirm('确认向全部账户发送这条消息？'))return;$('send').disabled=true;try{const r=await api('/admin/messages',{method:'POST',body:JSON.stringify({userId:$('target').value==='all'?null:Number($('target').value),title:$('title').value,body:$('body').value,includeNewUsers:$('target').value==='all'&&$('includeNewUsers').checked})});status('已发送给 '+r.recipients+' 个账户，已推送至 '+r.delivered+' 个在线连接');$('title').value='';$('body').value='';$('includeNewUsers').checked=false;void loadHistory().catch(e=>status('发送成功，但历史列表刷新失败：'+e.message,true))}catch(e){status(e.message,true)}finally{$('send').disabled=false}};

async function loadHistory(more=false) {
  const data=await api('/admin/messages?offset='+(more?historyOffset:0));
  if(!more)$('sentMessages').replaceChildren();
  for(const message of data.messages) {
    const entry=document.createElement('article');entry.className='card';
    const heading=document.createElement('h3');heading.textContent=message.title;
    const meta=document.createElement('p');meta.textContent=message.recipient+' · '+message.recipients+' 个账户 · '+new Date(message.created_at).toLocaleString()+(message.include_new_users?(message.recalled_at?' · 新用户发放已停止':' · 新用户可收到消息'):'');
    const body=document.createElement('p');body.textContent=message.body;body.style.whiteSpace='pre-wrap';body.style.overflowWrap='anywhere';
    const recall=document.createElement('button');recall.className='small';recall.textContent=message.recalled_at?'已撤回':'撤回消息';recall.disabled=!!message.recalled_at;
    recall.onclick=async()=>{
      if(!confirm('确认撤回「'+message.title+'」？将从 '+message.active+' 个账户中移除此消息，并停止向新用户发放。'))return;
      recall.disabled=true;
      try {
        const result=await api('/admin/messages/'+encodeURIComponent(message.dispatch_id)+'/recall',{method:'POST'});
        status('消息已撤回，移除 '+result.recalled+' 条，已推送至 '+result.delivered+' 个在线连接');
        recall.textContent='已撤回';if(message.include_new_users)meta.textContent=meta.textContent.replace('新用户可收到消息','新用户发放已停止');
      } catch(error) {status(error.message,true);recall.disabled=false;}
    };
    entry.append(heading,meta,body,recall);$('sentMessages').append(entry);
  }
  if(!more&&!data.messages.length){const p=document.createElement('p');p.textContent='暂无已发送消息';$('sentMessages').append(p);}
  historyOffset=data.nextOffset;$('moreHistory').classList.toggle('hidden',historyOffset===null);
}
$('refreshHistory').onclick=()=>loadHistory().catch(e=>status(e.message,true));
$('moreHistory').onclick=()=>loadHistory(true).catch(e=>status(e.message,true));

function syncNewUserOption() {
  const available=$('target').value==='all';
  $('includeNewUsers').disabled=!available;
  if(!available)$('includeNewUsers').checked=false;
}
$('target').addEventListener('change',syncNewUserOption);
syncNewUserOption();

// ---------- 投票管理（只在管理密钥校验成功后展示） ----------
let editingPollId=null, editingPublished=false, activePollId=null, votesOffset=0;
let pollBarChart=null, pollPieChart=null;
const localDateTime=value=>{const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const formatDate=value=>value?new Date(value).toLocaleString():'永久有效';
const pollState={draft:'未发布',scheduled:'未开始',active:'进行中',ended:'已结束',archived:'已归档'};
const formatType={single:'单选',multiple:'多选',score:'百分制打分'};

async function loadPollAdmin(){
  await Promise.all([loadPollSettings(),loadPollGroups(),loadPolls()]);
  if(!$('pollOptions').children.length)resetPollEditor();
}
async function loadPollSettings(){
  const data=await api('/admin/polls/settings');
  $('pollsEnabled').checked=data.enabled;$('pollEntryVisible').checked=data.entryVisible!==false;$('pollIpLimit').checked=data.ipLimitEnabled;$('pollDeviceLimit').checked=data.deviceLimitEnabled;
}
for(const id of ['pollsEnabled','pollEntryVisible','pollIpLimit','pollDeviceLimit'])$(id).addEventListener('change',()=>{$('pollSettingsStatus').textContent='有未保存的更改';$('pollSettingsStatus').classList.remove('danger')});
$('savePollSettings').onclick=async()=>{
  const button=$('savePollSettings'),feedback=$('pollSettingsStatus');
  const controls=['pollsEnabled','pollEntryVisible','pollIpLimit','pollDeviceLimit'].map($);
  const body={enabled:$('pollsEnabled').checked,entryVisible:$('pollEntryVisible').checked,ipLimitEnabled:$('pollIpLimit').checked,deviceLimitEnabled:$('pollDeviceLimit').checked};
  button.disabled=true;button.textContent='保存中…';controls.forEach(control=>control.disabled=true);
  feedback.textContent='正在保存投票设置…';feedback.classList.remove('danger');
  try{
    const result=await api('/admin/polls/settings',{method:'PATCH',body:JSON.stringify(body)});
    $('pollsEnabled').checked=result.enabled;$('pollEntryVisible').checked=result.entryVisible;$('pollIpLimit').checked=result.ipLimitEnabled;$('pollDeviceLimit').checked=result.deviceLimitEnabled;
    const message='已保存：用户端投票入口已'+(result.enabled&&result.entryVisible?'显示':'隐藏')+(result.enabled?'':'；投票功能已关闭');
    feedback.textContent=message;status(message);
  }catch(error){const message='保存失败：'+(error instanceof Error?error.message:'操作失败');feedback.textContent=message;feedback.classList.add('danger');status(message,true)}
  finally{button.disabled=false;button.textContent='保存投票设置';controls.forEach(control=>control.disabled=false)}
};

async function loadPollGroups(){
  const data=await api('/admin/polls/groups');
  $('pollGroups').replaceChildren();$('pollGroupSelect').replaceChildren();
  for(const group of data.groups){
    const option=document.createElement('option');option.value=group.id;option.textContent=group.name+'（'+group.members+' 人）';$('pollGroupSelect').append(option);
    const row=document.createElement('div');row.className='poll-item row';
    const label=document.createElement('span');label.textContent=group.name+' · '+group.members+' 人';label.style.flex='1';
    const members=document.createElement('button');members.textContent='成员';members.className='small';members.onclick=()=>showGroupMembers(group);
    const rename=document.createElement('button');rename.textContent='改名';rename.className='small';rename.onclick=async()=>{const name=prompt('新组名',group.name);if(!name)return;try{await api('/admin/polls/groups/'+group.id,{method:'PATCH',body:JSON.stringify({name})});await loadPollGroups()}catch(error){status(error.message,true)}};
    const remove=document.createElement('button');remove.textContent='删除';remove.className='small';remove.onclick=async()=>{if(!confirm('删除用户组「'+group.name+'」？'))return;try{await api('/admin/polls/groups/'+group.id,{method:'DELETE'});await loadPollGroups()}catch(error){status(error.message,true)}};
    row.append(label,members,rename,remove);$('pollGroups').append(row);
  }
  if(!data.groups.length){const empty=document.createElement('p');empty.textContent='暂无用户组';$('pollGroups').append(empty)}
  syncPollAudience();
}
async function showGroupMembers(group){
  const data=await api('/admin/polls/groups/'+group.id+'/members');
  const existing=$('pollGroups').querySelector('[data-member-list]');if(existing)existing.remove();
  const box=document.createElement('div');box.className='poll-item';box.dataset.memberList='1';
  const heading=document.createElement('h3');heading.textContent=group.name+'的成员';box.append(heading);
  const add=document.createElement('button');add.className='small';add.textContent='添加用户 ID';add.onclick=async()=>{const value=prompt('输入账户列表中的用户 ID');if(!value)return;try{await api('/admin/polls/groups/'+group.id+'/members',{method:'POST',body:JSON.stringify({userId:Number(value)})});await loadPollGroups();await showGroupMembers(group)}catch(error){status(error.message,true)}};box.append(add);
  for(const user of data.users){const row=document.createElement('div');row.className='row';const label=document.createElement('span');label.style.flex='1';label.textContent=(user.username||user.email)+' · ID '+user.id;const remove=document.createElement('button');remove.className='small';remove.textContent='移除';remove.onclick=async()=>{try{await api('/admin/polls/groups/'+group.id+'/members',{method:'DELETE',body:JSON.stringify({userId:user.id})});await loadPollGroups();await showGroupMembers(group)}catch(error){status(error.message,true)}};row.append(label,remove);box.append(row)}
  if(!data.users.length){const empty=document.createElement('p');empty.textContent='尚无成员';box.append(empty)}
  $('pollGroups').append(box);
}
$('pollGroupForm').onsubmit=async event=>{event.preventDefault();try{await api('/admin/polls/groups',{method:'POST',body:JSON.stringify({name:$('pollGroupName').value})});$('pollGroupName').value='';await loadPollGroups();status('用户组已创建')}catch(error){status(error.message,true)}};

const MAX_POLL_OPTIONS=20;
function addOptionRow(value={}){
  const row=document.createElement('div');row.className='option-row';row.dataset.optionId=value.id||crypto.randomUUID();
  const label=document.createElement('input');label.placeholder='选项名称';label.maxLength=120;label.value=value.label||'';
  const note=document.createElement('input');note.placeholder='选项说明（可选）';note.maxLength=300;note.value=value.note||'';
  const actions=document.createElement('div');actions.className='actions';
  for(const [caption,move] of [['↑',-1],['↓',1]]){const button=document.createElement('button');button.type='button';button.className='small';button.textContent=caption;button.onclick=()=>{const sibling=move<0?row.previousElementSibling:row.nextElementSibling;if(sibling){if(move<0)$('pollOptions').insertBefore(row,sibling);else $('pollOptions').insertBefore(sibling,row)}};actions.append(button)}
  const remove=document.createElement('button');remove.type='button';remove.className='small';remove.textContent='删除';remove.onclick=()=>row.remove();actions.append(remove);
  row.append(label,note,actions);$('pollOptions').append(row);
  if(editingPublished){label.disabled=true;note.disabled=true;actions.querySelectorAll('button').forEach(button=>button.disabled=true)}
  return row;
}
function bulkOptionMessage(message,error=false){
  $('pollBulkStatus').textContent=message;$('pollBulkStatus').classList.toggle('danger',error);
}
function closeBulkOptions(){
  $('pollBulkEditor').classList.add('hidden');$('toggleBulkOptions').setAttribute('aria-expanded','false');
  $('pollBulkInput').value='';bulkOptionMessage('');
}
function applyBulkOptions(){
  if(editingPublished)return;
  const options=[];
  for(const [index,line] of $('pollBulkInput').value.split(/\r\n?|\n/).entries()){
    if(!line.trim())continue;
    const columns=line.split('\t');const label=columns.shift().trim();const note=columns.join('\t').trim();
    if(!label){bulkOptionMessage('第 '+(index+1)+' 行缺少选项名称',true);return}
    if(label.length>120||note.length>300){bulkOptionMessage('第 '+(index+1)+' 行超过名称 120 字或说明 300 字的限制',true);return}
    options.push({label,note,line:index+1});
  }
  if(!options.length){bulkOptionMessage('请先粘贴或输入选项，每行一个',true);return}
  const rows=[...$('pollOptions').children];
  const reusable=rows.filter(row=>!row.children[0].value.trim()&&!row.children[1].value.trim());
  if(rows.length-reusable.length+options.length>MAX_POLL_OPTIONS){bulkOptionMessage('每个投票最多 '+MAX_POLL_OPTIONS+' 个选项，请减少本次添加数量',true);return}
  const seen=new Set(rows.map(row=>row.children[0].value.trim()).filter(Boolean));
  for(const option of options){
    if(seen.has(option.label)){bulkOptionMessage('第 '+option.line+' 行的「'+option.label+'」与已有选项重复',true);return}
    seen.add(option.label);
  }
  for(const option of options){
    const row=reusable.shift();
    if(row){row.children[0].value=option.label;row.children[1].value=option.note}
    else addOptionRow(option);
  }
  $('pollBulkInput').value='';bulkOptionMessage('已添加 '+options.length+' 个选项');
}
function resetPollEditor(){
  editingPollId=null;editingPublished=false;$('pollEditorTitle').textContent='创建投票';$('pollForm').reset();
  closeBulkOptions();
  $('pollFormStatus').textContent='';$('pollFormStatus').classList.remove('danger');$('savePollDraft').classList.remove('hidden');
  $('pollStart').value=localDateTime(Date.now()+60000);$('pollEnd').value=localDateTime(Date.now()+7*86400000);
  $('pollOptions').replaceChildren();addOptionRow();addOptionRow();$('pollCoverFile').value='';
  $('pollMax').value='2';$('pollShowCount').checked=true;$('pollShowDetails').checked=true;
  $('publishPoll').textContent='保存并发布';$('savePollDraft').textContent='保存草稿';
  for(const id of ['pollType','pollStart','pollAudience','pollGroupSelect','pollFrequency','pollVisibility','pollMax','pollShowCount','pollShowDetails','pollPermanent','addPollOption','toggleBulkOptions'])$(id).disabled=false;
  syncPollType();syncPollAudience();syncPermanent();
}
function syncPollType(){const multiple=$('pollType').value==='multiple';$('pollMax').disabled=!multiple||editingPublished;$('pollMax').closest('div').classList.toggle('hidden',!multiple)}
function syncPollAudience(){$('pollGroupSelect').disabled=$('pollAudience').value!=='group'||editingPublished}
function syncPermanent(){$('pollEnd').disabled=$('pollPermanent').checked;$('pollEnd').closest('div').classList.toggle('hidden',$('pollPermanent').checked)}
$('pollType').onchange=syncPollType;$('pollAudience').onchange=syncPollAudience;$('pollPermanent').onchange=syncPermanent;
$('addPollOption').onclick=()=>{if($('pollOptions').children.length>=MAX_POLL_OPTIONS){pollFeedback('每个投票最多 '+MAX_POLL_OPTIONS+' 个选项',true);return}addOptionRow()};
$('toggleBulkOptions').onclick=()=>{
  if($('pollBulkEditor').classList.contains('hidden')){
    $('pollBulkEditor').classList.remove('hidden');$('toggleBulkOptions').setAttribute('aria-expanded','true');$('pollBulkInput').focus();
  }else closeBulkOptions();
};
$('applyBulkOptions').onclick=applyBulkOptions;$('cancelBulkOptions').onclick=closeBulkOptions;
$('resetPollEditor').onclick=resetPollEditor;
function pollPayload(){
  const end=$('pollPermanent').checked?null:($('pollEnd').value?new Date($('pollEnd').value).toISOString():null);
  return {title:$('pollTitle').value,description:$('pollDescription').value,cover:$('pollCover').value,note:$('pollNote').value,
    startAt:$('pollStart').value?new Date($('pollStart').value).toISOString():new Date().toISOString(),endAt:end,
    type:$('pollType').value,maxSelections:$('pollType').value==='multiple'?Number($('pollMax').value):1,
    audience:$('pollAudience').value,groupId:$('pollAudience').value==='group'?$('pollGroupSelect').value:null,
    frequency:$('pollFrequency').value,resultVisibility:$('pollVisibility').value,
    showVoterCount:$('pollShowCount').checked,showDetails:$('pollShowDetails').checked,
    options:[...$('pollOptions').children].map(row=>({id:row.dataset.optionId,label:row.children[0].value,note:row.children[1].value}))};
}
async function savePoll(publish,payload){
  if(editingPollId){
    const update=editingPublished?{title:payload.title,description:payload.description,cover:payload.cover,note:payload.note,endAt:payload.endAt}:payload;
    await api('/admin/polls/'+editingPollId,{method:'PATCH',body:JSON.stringify(update)});
    if(publish&&!editingPublished)await api('/admin/polls/'+editingPollId+'/status',{method:'POST',body:JSON.stringify({action:'publish'})});
  }else{
    const created=await api('/admin/polls',{method:'POST',body:JSON.stringify({...payload,publish})});editingPollId=created.id;
  }
  await loadPolls();resetPollEditor();
}
let pollSaveBusy=false;
function pollFeedback(message,error=false){
  $('pollFormStatus').textContent=message;$('pollFormStatus').classList.toggle('danger',error);status(message,error);
}
async function submitPollForm(publish){
  if(pollSaveBusy)return;
  pollSaveBusy=true;$('publishPoll').disabled=true;$('savePollDraft').disabled=true;
  try{
    const payload=pollPayload();
    if(publish&&!editingPublished){
      if(!payload.title.trim()){$('pollTitle').focus();throw Error('请填写投票标题')}
      const labels=payload.options.map(option=>option.label.trim());
      if(labels.length<2||labels.some(label=>!label)||new Set(labels).size!==labels.length){
        const empty=[...$('pollOptions').querySelectorAll('.option-row > input:first-child')].find(input=>!input.value.trim());
        empty?.focus();throw Error('发布前请填写至少两个不同的选项名称');
      }
    }
    const wasPublished=editingPublished;
    await savePoll(publish,payload);
    pollFeedback(wasPublished?'修改已保存':publish?'投票已发布':'投票已保存');
  }catch(error){pollFeedback(error instanceof Error?error.message:'保存失败',true)}
  finally{pollSaveBusy=false;$('publishPoll').disabled=false;$('savePollDraft').disabled=false}
}
$('pollForm').onsubmit=event=>{event.preventDefault();void submitPollForm(true)};
$('savePollDraft').onclick=()=>{void submitPollForm(false)};
$('pollCoverFile').onchange=async()=>{
  const file=$('pollCoverFile').files?.[0];if(!file)return;
  if(file.size>180000){status('封面图片不能超过 180 KB',true);$('pollCoverFile').value='';return}
  $('pollCover').value=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});
};

async function editPoll(id){
  const data=await api('/admin/polls/'+id);const poll=data.poll;resetPollEditor();editingPollId=id;editingPublished=!!poll.publishedAt;
  $('pollEditorTitle').textContent='编辑：'+(poll.title||'未命名草稿');
  $('pollTitle').value=poll.title;$('pollDescription').value=poll.description;$('pollCover').value=poll.cover;$('pollNote').value=poll.note;
  $('pollStart').value=localDateTime(poll.startAt);$('pollPermanent').checked=!poll.endAt;$('pollEnd').value=poll.endAt?localDateTime(poll.endAt):'';
  $('pollType').value=poll.type;$('pollMax').value=String(poll.maxSelections);$('pollAudience').value=poll.audience;
  $('pollGroupSelect').value=poll.groupId||'';$('pollFrequency').value=poll.frequency;$('pollVisibility').value=poll.resultVisibility;
  $('pollShowCount').checked=poll.showVoterCount;$('pollShowDetails').checked=poll.showDetails;
  $('pollOptions').replaceChildren();for(const option of data.options)addOptionRow(option);
  $('savePollDraft').textContent='保存修改';$('savePollDraft').classList.toggle('hidden',editingPublished);$('publishPoll').textContent=editingPublished?'保存修改':'保存并发布';
  if(editingPublished){for(const id of ['pollType','pollStart','pollAudience','pollGroupSelect','pollFrequency','pollVisibility','pollMax','pollShowCount','pollShowDetails','addPollOption','toggleBulkOptions'])$(id).disabled=true;$('pollPermanent').disabled=true}
  syncPollType();syncPollAudience();syncPermanent();
  $('pollEditorTitle').scrollIntoView({behavior:'smooth',block:'start'});
}

let pollCountdownTimer=0,pollStartLastRefresh=0,pollStartRefreshing=false;
function updatePollCountdowns(){
  const clocks=[...$('pollList').querySelectorAll('time[data-poll-start]')];
  if(!clocks.length){if(pollCountdownTimer){clearInterval(pollCountdownTimer);pollCountdownTimer=0}return}
  const now=Date.now();let due=false;
  for(const clock of clocks){
    const remaining=Date.parse(clock.dataset.pollStart)-now;
    if(!Number.isFinite(remaining))continue;
    if(remaining<=0){clock.textContent='即将开始，正在确认状态…';due=true;continue}
    const seconds=Math.ceil(remaining/1000),days=Math.floor(seconds/86400);
    const time=[Math.floor(seconds/3600)%24,Math.floor(seconds/60)%60,seconds%60].map(value=>String(value).padStart(2,'0')).join(':');
    clock.textContent='距开始 '+(days?days+'天 ':'')+time;
  }
  if(due&&document.visibilityState==='visible'&&!pollStartRefreshing&&now-pollStartLastRefresh>=5000){
    pollStartRefreshing=true;pollStartLastRefresh=now;
    void loadPolls().catch(error=>status(error.message,true)).finally(()=>{pollStartRefreshing=false});
  }
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')updatePollCountdowns()});
let pollLoadSequence=0;
async function loadPolls(){
  const sequence=++pollLoadSequence;
  const search=$('pollSearch').value;
  const loading=document.createElement('p');loading.textContent='正在加载投票中';loading.setAttribute('role','status');
  $('pollList').replaceChildren(loading);
  const polls=[];const seenIds=new Set();let offset=0;
  try{
    while(true){
      const data=await api('/admin/polls?q='+encodeURIComponent(search)+'&offset='+offset);
      if(sequence!==pollLoadSequence)return;
      for(const poll of data.polls)if(!seenIds.has(poll.id)){seenIds.add(poll.id);polls.push(poll)}
      if(data.nextOffset==null)break;
      if(!Number.isSafeInteger(data.nextOffset)||data.nextOffset<=offset)throw Error('投票分页数据无效');
      offset=data.nextOffset;
    }
  }catch(error){
    if(sequence!==pollLoadSequence)return;
    const message=document.createElement('p');message.className='danger';message.textContent='投票加载失败，请重试';
    const retry=document.createElement('button');retry.className='small';retry.type='button';retry.textContent='重试';retry.onclick=()=>loadPolls().catch(reason=>status(reason.message,true));
    $('pollList').replaceChildren(message,retry);
    throw error;
  }
  $('pollList').replaceChildren();
  for(const poll of polls){
    const row=document.createElement('article');row.className='poll-item';
    const top=document.createElement('div');top.className='row';const check=document.createElement('input');check.type='checkbox';check.style.width='16px';check.style.flex='none';check.dataset.pollId=poll.id;
    const title=document.createElement('h3');title.textContent=poll.title||'未命名草稿';top.append(check,title);row.append(top);
    const meta=document.createElement('p');meta.textContent=(pollState[poll.state]||poll.state)+' · '+formatType[poll.type]+' · 创建 '+formatDate(poll.createdAt)+' · 截止 '+formatDate(poll.endAt)+(poll.pinned?' · 已置顶':'');row.append(meta);
    if(poll.state==='scheduled'){
      const countdown=document.createElement('p');countdown.className='muted';
      const clock=document.createElement('time');clock.dateTime=poll.startAt;clock.dataset.pollStart=poll.startAt;clock.setAttribute('role','timer');
      countdown.append(clock);row.append(countdown);
    }
    const actions=document.createElement('div');actions.className='actions';
    const button=(label,callback)=>{const b=document.createElement('button');b.type='button';b.className='small';b.textContent=label;b.onclick=()=>Promise.resolve(callback()).catch(error=>status(error.message,true));actions.append(b)};
    if(poll.state!=='archived')button('编辑',()=>editPoll(poll.id));
    button('统计与明细',()=>showPollStats(poll.id));
    if(poll.status==='draft')button('发布',()=>pollAction(poll,'publish'));
    if(poll.status==='published')button('下架',()=>pollAction(poll,'unpublish'));
    button(poll.pinned?'取消置顶':'置顶',()=>pollAction(poll,poll.pinned?'unpin':'pin'));
    if(poll.status!=='archived')button('归档',()=>pollAction(poll,'archive'));
    button('删除',async()=>{if(!confirm('确认删除「'+poll.title+'」？用户端将无法查看此活动。'))return;await api('/admin/polls/'+poll.id,{method:'DELETE'});await loadPolls();status('活动已删除')});
    row.append(actions);$('pollList').append(row);
  }
  if(!polls.length){const empty=document.createElement('p');empty.textContent='暂无投票活动';$('pollList').append(empty)}
  if(!pollCountdownTimer&&$('pollList').querySelector('time[data-poll-start]'))pollCountdownTimer=setInterval(updatePollCountdowns,1000);
  updatePollCountdowns();
}
async function pollAction(poll,action){
  if(['unpublish','archive'].includes(action)&&!confirm('确认对「'+poll.title+'」执行'+(action==='archive'?'归档':'下架')+'？'))return;
  await api('/admin/polls/'+poll.id+'/status',{method:'POST',body:JSON.stringify({action})});await loadPolls();status('活动状态已更新');
}
$('refreshPolls').onclick=()=>loadPollAdmin().catch(error=>status(error.message,true));
$('loadPolls').onclick=$('searchPolls').onclick=()=>loadPolls().catch(error=>status(error.message,true));
$('pollSearch').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void loadPolls().catch(error=>status(error.message,true))}};
async function bulkPoll(action){const ids=[...$('pollList').querySelectorAll('input[data-poll-id]:checked')].map(input=>input.dataset.pollId);if(!ids.length){status('请先勾选活动',true);return}if(!confirm('确认批量操作 '+ids.length+' 个投票活动？'))return;try{const result=await api('/admin/polls/bulk',{method:'POST',body:JSON.stringify({action,ids})});await loadPolls();status('成功处理 '+result.changed+' 个活动')}catch(error){status(error.message,true)}}
$('bulkArchive').onclick=()=>bulkPoll('archive');$('bulkDeleteExpired').onclick=()=>bulkPoll('delete-expired');

async function showPollStats(id){
  activePollId=id;votesOffset=0;
  const data=await api('/admin/polls/'+id+'/results');$('pollStats').classList.remove('hidden');$('pollStatsTitle').textContent='统计：'+data.poll.title;
  const growth=data.growthRate==null?'暂无可比数据':(data.growthRate*100).toFixed(1)+'%';
  $('pollSummary').textContent='投票次数 '+data.participants+' · 独立参与用户 '+data.uniqueUsers+' · 近 24 小时增长率 '+growth;
  if(window.echarts){
    pollBarChart??=echarts.init($('pollBarChart'));pollPieChart??=echarts.init($('pollPieChart'));
    const score=data.poll.type==='score';const labels=data.options.map(option=>option.label);
    pollBarChart.setOption({backgroundColor:'transparent',textStyle:{color:'#ddd'},tooltip:{trigger:'axis'},xAxis:{type:'category',data:labels,axisLabel:{color:'#aaa'}},yAxis:{type:'value',max:score?100:null,axisLabel:{color:'#aaa'}},series:[{type:'bar',data:data.options.map(option=>score?(option.averageScore||0):option.votes),itemStyle:{color:'#ddd',borderRadius:[5,5,0,0]}}]},true);
    pollPieChart.setOption({backgroundColor:'transparent',textStyle:{color:'#ddd'},tooltip:{trigger:'item'},legend:{bottom:0,textStyle:{color:'#aaa'}},series:[{type:'pie',radius:['42%','70%'],data:data.options.map(option=>({name:option.label,value:score?option.scoreTotal:option.votes})),itemStyle:{borderColor:'#202020',borderWidth:2}}]},true);
    setTimeout(()=>{pollBarChart.resize();pollPieChart.resize()},0);
  }else $('pollSummary').textContent+=' · 图表库未加载，请检查静态资源';
  await loadPollVotes();$('pollStats').scrollIntoView({behavior:'smooth',block:'start'});
}
async function loadPollVotes(more=false){
  if(!activePollId)return;
  const data=await api('/admin/polls/'+activePollId+'/votes?offset='+(more?votesOffset:0));
  if(!more){$('pollVotes').replaceChildren();const table=document.createElement('table');table.innerHTML='<tr><th>账户</th><th>时间</th><th>投票内容</th><th>操作</th></tr>';$('pollVotes').append(table)}
  const table=$('pollVotes').querySelector('table');
  for(const vote of data.votes){
    const row=document.createElement('tr');
    const account=document.createElement('td');account.textContent=(vote.username||vote.email)+'\n'+vote.email+'\nID '+vote.userId;account.style.whiteSpace='pre-line';
    const time=document.createElement('td');time.textContent=formatDate(vote.createdAt);
    const content=document.createElement('td');content.textContent=vote.items.map(item=>item.score==null?item.label:item.label+'：'+item.score+' 分').join('、');
    const action=document.createElement('td');const remove=document.createElement('button');remove.className='small';remove.textContent='删除违规票';remove.onclick=async()=>{const reason=prompt('违规原因（必填）');if(!reason)return;if(!confirm('确认删除此条投票记录？'))return;try{await api('/admin/polls/'+activePollId+'/votes/'+vote.id,{method:'DELETE',body:JSON.stringify({reason})});await showPollStats(activePollId);status('违规投票已删除，统计已刷新')}catch(error){status(error.message,true)}};action.append(remove);
    row.append(account,time,content,action);table.append(row);
  }
  votesOffset=data.nextOffset;$('morePollVotes').classList.toggle('hidden',votesOffset===null);
  if(!data.votes.length&&!more){const empty=document.createElement('p');empty.textContent='暂无投票记录';$('pollVotes').append(empty)}
}
$('morePollVotes').onclick=()=>loadPollVotes(true).catch(error=>status(error.message,true));
$('closePollStats').onclick=()=>{$('pollStats').classList.add('hidden');activePollId=null};
async function exportPoll(kind){
  if(!activePollId)return;
  const response=await fetch(API_BASE+'/admin/polls/'+activePollId+'/export?kind='+kind,{headers:{authorization:'Bearer '+key},cache:'no-store'});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.detail||'导出失败')}
  const blob=await response.blob();const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='cocode-poll-'+kind+'-'+activePollId+'.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),60000);
}
$('exportPollSummary').onclick=()=>exportPoll('summary').catch(error=>status(error.message,true));
$('exportPollDetails').onclick=()=>exportPoll('details').catch(error=>status(error.message,true));
$('savePollChart').onclick=async()=>{
  if(!pollBarChart||!pollPieChart)return;
  const images=await Promise.all([pollBarChart,pollPieChart].map(chart=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=chart.getDataURL({type:'png',pixelRatio:2,backgroundColor:'#202020'})})));
  const canvas=document.createElement('canvas');canvas.width=images[0].width+images[1].width;canvas.height=Math.max(images[0].height,images[1].height);const context=canvas.getContext('2d');context.fillStyle='#202020';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(images[0],0,0);context.drawImage(images[1],images[0].width,0);
  const link=document.createElement('a');link.download='cocode-poll-'+activePollId+'.png';link.href=canvas.toDataURL('image/png');link.click();
};
