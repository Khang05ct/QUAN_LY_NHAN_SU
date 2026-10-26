const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const defaultEmployees = [
  {name:'Trần Ngọc Anh',email:'anh.tran@hrm.vn',department:'Nhân sự',role:'Chuyên viên nhân sự',status:'Đang làm việc',initials:'TA',color:'#e4d8ff'},
  {name:'Lê Minh Hoàng',email:'hoang.le@hrm.vn',department:'Công nghệ',role:'Lập trình viên',status:'Đang làm việc',initials:'LH',color:'#d5f3e5'},
  {name:'Phạm Thu Trang',email:'trang.pham@hrm.vn',department:'Kinh doanh',role:'Trưởng nhóm kinh doanh',status:'Đang làm việc',initials:'PT',color:'#ffe3cf'},
  {name:'Nguyễn Quốc Bảo',email:'bao.nguyen@hrm.vn',department:'Thiết kế',role:'UI/UX Designer',status:'Đang làm việc',initials:'NB',color:'#d8edff'}
];
let employees = JSON.parse(localStorage.getItem('hrm_employees') || 'null') || defaultEmployees;
let account = JSON.parse(localStorage.getItem('hrm_account') || 'null');
let attendance = JSON.parse(localStorage.getItem('hrm_attendance') || 'null') || {};
let attendanceSettings = JSON.parse(localStorage.getItem('hrm_attendance_settings') || 'null') || {startTime:'08:30',graceMinutes:0};
const initials = name => name.split(' ').filter(Boolean).slice(-2).map(x => x[0]).join('').toUpperCase();
const saveEmployees = () => localStorage.setItem('hrm_employees', JSON.stringify(employees));
const saveAttendance = () => localStorage.setItem('hrm_attendance', JSON.stringify(attendance));
const saveAttendanceSettings = () => localStorage.setItem('hrm_attendance_settings', JSON.stringify(attendanceSettings));
const attendanceLabels = {present:'Có mặt', late:'Đi muộn', absent:'Vắng mặt'};
function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),3000); }
function avatar(e) { return `<span class="avatar" style="background:${e.color||'#dedbff'}">${e.initials||initials(e.name)}</span>`; }
function attendanceState(record) {
  if (record.state==='absent' || record.in==='—') return 'absent';
  const [hour,minute]=record.in.split(':').map(Number), [startHour,startMinute]=attendanceSettings.startTime.split(':').map(Number);
  if (![hour,minute,startHour,startMinute].every(Number.isFinite)) return record.state;
  return hour*60+minute>startHour*60+startMinute+Number(attendanceSettings.graceMinutes)?'late':'present';
}
function formatTime(totalMinutes) { return `${String(Math.floor(totalMinutes/60)).padStart(2,'0')}:${String(totalMinutes%60).padStart(2,'0')}`; }
function updateAttendanceSettingsView() {
  $('#shift-start-time').value=attendanceSettings.startTime;
  $('#late-grace-minutes').value=attendanceSettings.graceMinutes;
  const [hour,minute]=attendanceSettings.startTime.split(':').map(Number);
  $('#late-time-preview').textContent=`Từ ${formatTime(hour*60+minute+Number(attendanceSettings.graceMinutes)+1)} trở đi sẽ tính là đi trễ.`;
}
function recordFor(employee,index) {
  if (!attendance[employee.email]) { const state=index===1?'late':index===employees.length-1?'absent':'present'; attendance[employee.email]={state,in:state==='absent'?'—':index===1?'08:47':`08:${String(12+index*3).padStart(2,'0')}`,out:state==='absent'?'—':`17:3${index}`,hours:state==='absent'?'—':index===1?'7 giờ 43 phút':`8 giờ ${18-index*2} phút`}; }
  return attendance[employee.email];
}
function totals() { const rows=employees.map(recordFor).map(attendanceState); return {total:employees.length,present:rows.filter(r=>r==='present').length,late:rows.filter(r=>r==='late').length,absent:rows.filter(r=>r==='absent').length}; }
function render() {
  const t=totals(); $('#employee-total').textContent=t.total; $('#present-total').textContent=t.present; $('#late-total').textContent=t.late; $('#attendance-percent').textContent=t.total?`${Math.round(t.present/t.total*100)}%`:'0%'; $('.donut').style.setProperty('--percent',t.total?`${t.present/t.total*100}%`:'0%'); $('#legend-present').textContent=t.present; $('#legend-late').textContent=t.late; $('#legend-absent').textContent=t.absent;
  $('#recent-employees').innerHTML=employees.slice(-4).reverse().map(e=>`<div class="person">${avatar(e)}<div><b>${e.name}</b><small>${e.role}</small></div><span class="tag">Mới</span></div>`).join('')||'<p class="empty">Chưa có nhân viên.</p>'; renderEmployeeTable(); renderAttendance();
}
function renderEmployeeTable() { const q=$('#employee-search').value.toLowerCase(), d=$('#department-filter').value; const list=employees.filter(e=>(!q||`${e.name} ${e.email}`.toLowerCase().includes(q))&&(!d||e.department===d)); $('#employee-table').innerHTML=list.map(e=>`<tr><td><div class="table-person">${avatar(e)}<div>${e.name}<small>${e.email}</small></div></div></td><td>${e.department}</td><td>${e.role}</td><td><span class="status active">${e.status}</span></td><td>•••</td></tr>`).join(''); $('#empty-employees').classList.toggle('hidden',!!list.length); }
function renderAttendance() {
  const t=totals(); $('#attendance-table').innerHTML=employees.map((e,i)=>{const r=recordFor(e,i),state=attendanceState(r);return `<tr><td><div class="table-person">${avatar(e)}<div>${e.name}<small>${e.department}</small></div></div></td><td>${r.in}</td><td>${r.out}</td><td>${r.hours}</td><td><span class="status ${state}">${attendanceLabels[state]}</span></td><td><button class="attendance-action" data-attendance="${e.email}">Cập nhật</button></td></tr>`}).join('')||'<tr><td colspan="6" class="empty">Chưa có dữ liệu.</td></tr>'; $('#attendance-summary').textContent=t.total?`${t.present}/${t.total} nhân viên có mặt hôm nay`:'Chưa có nhân viên để chấm công'; $$('[data-attendance]').forEach(b=>b.addEventListener('click',()=>cycleAttendance(b.dataset.attendance)));
}
function cycleAttendance(email) { const r=attendance[email], next={present:'late',late:'absent',absent:'present'}[attendanceState(r)], [hour,minute]=attendanceSettings.startTime.split(':').map(Number), cutoff=hour*60+minute+Number(attendanceSettings.graceMinutes); r.state=next; if(next==='present')Object.assign(r,{in:attendanceSettings.startTime,out:'17:30',hours:'8 giờ 00 phút'}); if(next==='late')Object.assign(r,{in:formatTime(cutoff+1),out:'17:30',hours:'7 giờ 45 phút'}); if(next==='absent')Object.assign(r,{in:'—',out:'—',hours:'—'}); saveAttendance(); render(); toast(`Đã cập nhật: ${attendanceLabels[next]}.`); }
function setPage(page) { $$('.page').forEach(x=>x.classList.remove('active-page')); $(`#${page}`).classList.add('active-page'); $$('.nav-item[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===page)); $('#page-title').textContent=''; $('.sidebar').classList.remove('open'); }
function updateClock() { const d=new Date(); $('#current-time').textContent=d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); $('#today-label').textContent=d.toLocaleDateString('vi-VN',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}); }
function updateUser() { const name=account?.name||'Admin HRM'; $('#user-name').textContent=name; $('#welcome-name').textContent=name.split(' ').pop(); $('#user-initials').textContent=initials(name); }
function openAuth(id) { $$('.auth-card>div[id$="form"]').forEach(x=>x.classList.add('hidden')); $(`#${id}`).classList.remove('hidden'); }
function prepareAttendanceManager() { const quick=$('#quick-clock'); quick.textContent='◷ Quản lý chấm công'; quick.onclick=()=>setPage('attendance'); $('#clock-in')?.remove(); const status=$('#clock-status'); status.id='attendance-summary'; status.textContent='Đang tải dữ liệu chấm công…'; $('#clock-detail').textContent='Chọn trạng thái cho từng nhân viên trong bảng bên dưới.'; $('#attendance-table').closest('table').querySelector('thead tr').insertAdjacentHTML('beforeend','<th>THAO TÁC</th>'); }
$$('[data-open]').forEach(b=>b.addEventListener('click',()=>openAuth(b.dataset.open))); $$('[data-toggle]').forEach(b=>b.addEventListener('click',()=>{const i=$('#'+b.dataset.toggle);i.type=i.type==='password'?'text':'password'}));
$('#sign-in').addEventListener('submit',e=>{e.preventDefault();const email=$('#login-email').value,password=$('#login-password').value;if((email==='admin@hrm.vn'&&password==='123456')||(account&&email===account.email&&password===account.password))showApp();else toast('Email hoặc mật khẩu chưa đúng.')});
$('#sign-up').addEventListener('submit',e=>{e.preventDefault();account={name:$('#reg-name').value.trim(),email:$('#reg-email').value.trim(),password:$('#reg-password').value};localStorage.setItem('hrm_account',JSON.stringify(account));toast('Tạo tài khoản thành công. Bạn có thể đăng nhập ngay.');openAuth('login-form');$('#login-email').value=account.email;$('#login-password').focus()});
$('#forgot-password').addEventListener('submit',e=>{e.preventDefault();toast('Hướng dẫn đặt lại mật khẩu đã được gửi (mô phỏng).');openAuth('login-form')});
$('#attendance-settings-form').addEventListener('submit',e=>{e.preventDefault();const startTime=$('#shift-start-time').value,graceMinutes=Number($('#late-grace-minutes').value),[hour,minute]=startTime.split(':').map(Number),cutoff=hour*60+minute+graceMinutes;if(!startTime||!Number.isInteger(graceMinutes)||graceMinutes<0||graceMinutes>120||cutoff>=1439){toast('Vui lòng chọn giờ bắt đầu và thời gian ân hạn hợp lệ.');return}attendanceSettings={startTime,graceMinutes};saveAttendanceSettings();updateAttendanceSettingsView();render();toast('Đã lưu cài đặt chấm công.')});
function showApp() { $('#auth-view').classList.add('hidden'); $('#app-view').classList.remove('hidden'); updateUser(); render(); updateClock(); setPage('dashboard'); }
$$('.nav-item[data-page],.go-page').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page))); $('#menu-button').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));
$('#logout').addEventListener('click',()=>{$('#app-view').classList.add('hidden');$('#auth-view').classList.remove('hidden');openAuth('login-form');toast('Bạn đã đăng xuất.')});
$('#open-add-employee').addEventListener('click',()=>$('#employee-modal').classList.remove('hidden')); $$('.close-modal').forEach(b=>b.addEventListener('click',()=>$('#employee-modal').classList.add('hidden'))); $('#employee-modal').addEventListener('click',e=>{if(e.target.id==='employee-modal')e.currentTarget.classList.add('hidden')});
$('#add-employee-form').addEventListener('submit',e=>{e.preventDefault();const name=$('#emp-name').value.trim();employees.push({name,email:$('#emp-email').value.trim(),department:$('#emp-department').value,role:$('#emp-role').value.trim(),status:'Đang làm việc',initials:initials(name),color:'#e4d8ff'});saveEmployees();e.target.reset();$('#employee-modal').classList.add('hidden');render();toast(`Đã thêm nhân viên ${name}.`)});
$('#employee-search').addEventListener('input',renderEmployeeTable); $('#department-filter').addEventListener('change',renderEmployeeTable);
prepareAttendanceManager(); updateAttendanceSettingsView(); updateClock(); setInterval(updateClock,1000);
