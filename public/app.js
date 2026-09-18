const socket = io();
let currentUser = null;
let allBots = [];
let selectedEmoji = '❤️';

// ================= AUTH =================
async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');
  err.textContent = '';

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) { err.textContent = data.error; return; }
  currentUser = data.user;
  enterApp();
}

async function doLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.reload();
}

async function checkSession() {
  const res = await fetch('/api/auth/me');
  if (res.ok) {
    currentUser = await res.json();
    enterApp();
  }
}

function enterApp() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  document.getElementById('current-user').textContent = '👤 ' + currentUser.username;
  loadBots();
  loadAutoTasks();
  initChart();
}

// ================= TABS =================
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'react') loadAutoTasks();
  });
});

// ================= EMOJI PICKER =================
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('emoji-opt')) {
    document.querySelectorAll('.emoji-opt').forEach(el => el.classList.remove('active'));
    e.target.classList.add('active');
    selectedEmoji = e.target.dataset.emoji;
  }
});

// ================= BOTS =================
async function loadBots() {
  const res = await fetch('/api/bots');
  if (!res.ok) return;
  allBots = await res.json();
  renderBots();
  updateStats();
}

function renderBots() {
  const list = document.getElementById('bots-list');
  if (!allBots.length) {
    list.innerHTML = '<p style="color:#94a3b8; padding:20px;">No bots yet. Click "+ Add Bot" to create one.</p>';
    return;
  }

  list.innerHTML = allBots.map(bot => `
    <div class="bot-card">
      <div class="status-dot status-${bot.status}"></div>
      <h3>${escapeHtml(bot.name)}</h3>
      <div class="bot-row"><span>Status</span><span>${bot.status.toUpperCase()}</span></div>
      <div class="bot-row"><span>Phone</span><span>${bot.phoneNumber || '—'}</span></div>
      <div class="bot-row"><span>RSS</span><span>${bot.stats?.rss || '0M'}</span></div>
      <div class="bot-row"><span>Heap</span><span>${bot.stats?.heap || '0M/0M'}</span></div>
      <div class="bot-row"><span>Uptime</span><span>${bot.stats?.uptime || '0s'}</span></div>
      <div class="bot-row"><span>Reactions</span><span>${bot.stats?.reactionsSent || 0}</span></div>
      <div class="bot-row"><span>Follows</span><span>${bot.stats?.followsDone || 0}</span></div>
      <div class="bot-actions">
        ${bot.status === 'online'
          ? `<button class="btn-disconnect" onclick="disconnectBot('${bot.botId}')">Disconnect</button>`
          : `<button class="btn-connect" onclick="connectBot('${bot.botId}')">Connect</button>`}
        <button class="btn-delete" onclick="deleteBot('${bot.botId}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function updateStats() {
  const total = allBots.length;
  const online = allBots.filter(b => b.status === 'online').length;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-online').textContent = online;
  document.getElementById('stat-offline').textContent = total - online;
}

function openAddBot() {
  const modal = document.getElementById('modal');
  document.getElementById('modal-title').textContent = 'Add New Bot';
  document.getElementById('modal-body').innerHTML = `
    <label style="color:#cbd5e1;font-size:13px;">Bot Name</label>
    <input id="new-bot-name" placeholder="e.g., Sasiya Bot 1" />
    <button class="btn-primary" onclick="createBot()" style="width:100%;">Create Bot 🤖</button>
  `;
  modal.classList.add('open');
}

async function createBot() {
  const name = document.getElementById('new-bot-name').value.trim();
  if (!name) return;
  const res = await fetch('/api/bots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (res.ok) {
    closeModal();
    loadBots();
  }
}

async function connectBot(botId) {
  const modal = document.getElementById('modal');
  document.getElementById('modal-title').textContent = 'Connect Bot';
  document.getElementById('modal-body').innerHTML = `
    <p style="color:#94a3b8;font-size:13px;margin-bottom:14px;">
      Enter your WhatsApp number with country code (e.g. 94771234567). Then click "Get Pairing Code".
    </p>
    <input id="pair-phone" placeholder="94771234567" />
    <button class="btn-primary" onclick="startPair('${botId}')" style="width:100%;">Get Pairing Code 🔐</button>
    <div id="pair-result" style="margin-top:14px;"></div>
  `;
  modal.classList.add('open');
}

async function startPair(botId) {
  const phone = document.getElementById('pair-phone').value.replace(/\D/g, '');
  if (!phone) return alert('Enter phone number');
  const res = await fetch(`/api/bots/${botId}/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: phone })
  });
  if (res.ok) {
    document.getElementById('pair-result').innerHTML =
      '<div class="result show info">⏳ Connecting... Wait for the pairing code (10-15s)</div>';
    loadBots();
  } else {
    const data = await res.json();
    document.getElementById('pair-result').innerHTML =
      `<div class="result show error">❌ ${data.error}</div>`;
  }
}

async function disconnectBot(botId) {
  if (!confirm('Disconnect this bot?')) return;
  await fetch(`/api/bots/${botId}/disconnect`, { method: 'POST' });
  loadBots();
  loadAutoTasks();
}

async function deleteBot(botId) {
  if (!confirm('Delete this bot permanently?')) return;
  await fetch(`/api/bots/${botId}`, { method: 'DELETE' });
  loadBots();
  loadAutoTasks();
}

// ================= REACT + FOLLOW (MAIN) =================
async function sendReactFollow() {
  const channelUrl = document.getElementById('react-url').value.trim();
  const box = document.getElementById('react-result');

  if (!channelUrl) {
    box.className = 'result show error';
    box.textContent = '⚠️ Please enter channel URL';
    return;
  }

  box.className = 'result show info';
  box.innerHTML = '⏳ Following channel + sending reactions... Please wait (10-20s)';

  try {
    const res = await fetch('/api/tools/react-follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelUrl, emoji: selectedEmoji })
    });
    const data = await res.json();

    if (!res.ok) {
      box.className = 'result show error';
      box.textContent = '❌ ' + data.error;
      return;
    }

    const successRows = data.results.map(r => {
      if (r.followed || r.reacted) {
        return `✅ <b>${r.bot}</b> — Follow: ${r.followed ? '✔️' : '❌'} | React: ${r.reacted ? '✔️' : '❌'} | Auto: ${r.autoEnabled ? '✔️' : '❌'}`;
      }
      return `❌ <b>${r.bot}</b> — ${r.error || 'Failed'}`;
    }).join('<br>');

    box.className = 'result show success';
    box.innerHTML = `
      ✅ <b>${data.summary.success}/${data.summary.total}</b> bots processed!<br>
      🔥 Emoji: ${data.emoji}<br>
      📌 Auto-react <b>activated</b> for future posts!<br>
      <hr style="opacity:0.2;margin:10px 0;">
      ${successRows}
    `;

    loadAutoTasks();
    loadBots();
  } catch (err) {
    box.className = 'result show error';
    box.textContent = '❌ ' + err.message;
  }
}

// ================= AUTO TASKS =================
async function loadAutoTasks() {
  try {
    const res = await fetch('/api/tools/auto-tasks');
    if (!res.ok) return;
    const tasks = await res.json();
    const list = document.getElementById('auto-tasks-list');
    const stat = document.getElementById('stat-tasks');
    if (stat) stat.textContent = tasks.length;

    if (!list) return;
    if (!tasks.length) {
      list.innerHTML = '<p style="color:#94a3b8;">No active auto-tasks yet. Add one above ⬆️</p>';
      return;
    }

    list.innerHTML = tasks.map(t => `
      <div class="auto-task-card">
        <span class="task-emoji">${t.emoji}</span>
        <div class="task-info">
          <div class="task-bot">🤖 ${t.botName}</div>
          <div class="task-channel">📡 ${t.channelUrl || t.channelJid}</div>
          <div class="task-bot" style="margin-top:4px;">⚡ Reacted: ${t.reactedCount || 0} times</div>
        </div>
        <button class="task-delete" onclick="deleteAutoTask('${t._id}')">Remove</button>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

async function deleteAutoTask(id) {
  if (!confirm('Remove this auto-react task?')) return;
  await fetch('/api/tools/auto-tasks/' + id, { method: 'DELETE' });
  loadAutoTasks();
}

// ================= POLL =================
async function sendPoll() {
  const groupJid = document.getElementById('poll-jid').value.trim();
  const question = document.getElementById('poll-q').value.trim();
  const options = document.getElementById('poll-opts').value.split('\n').map(o => o.trim()).filter(Boolean);
  const box = document.getElementById('poll-result');

  if (!groupJid || !question || options.length < 2) {
    box.className = 'result show error';
    box.textContent = '⚠️ Fill all fields (min 2 options)';
    return;
  }

  box.className = 'result show info';
  box.textContent = '⏳ Creating poll...';

  const res = await fetch('/api/tools/poll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupJid, question, options })
  });
  const data = await res.json();
  if (res.ok) {
    box.className = 'result show success';
    box.textContent = '✅ Poll sent successfully!';
  } else {
    box.className = 'result show error';
    box.textContent = '❌ ' + data.error;
  }
}

// ================= MODAL =================
function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

// ================= SOCKET =================
socket.on('bots:update', (bot) => {
  const idx = allBots.findIndex(b => b.botId === bot.botId);
  if (idx !== -1) allBots[idx] = bot;
  else allBots.push(bot);
  renderBots();
  updateStats();
});

socket.on('bots:list:refresh', () => loadBots());

socket.on('bot:qr', ({ botId, qr }) => {
  const body = document.getElementById('modal-body');
  if (!body) return;
  body.innerHTML = `
    <p style="color:#cbd5e1;font-size:13px;">Scan this QR with WhatsApp → Linked Devices:</p>
    <div class="qr-box"><img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qr)}" /></div>
  `;
});

socket.on('bot:pairing', ({ botId, code }) => {
  const body = document.getElementById('modal-body');
  if (!body) return;
  body.innerHTML = `
    <p style="color:#cbd5e1;font-size:13px;">
      Open WhatsApp → Linked Devices → Link with phone number → Enter this code:
    </p>
    <div class="pair-code">${code}</div>
  `;
});

// ================= CHART =================
let chart;
function initChart() {
  const ctx = document.getElementById('activityChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['5m', '4m', '3m', '2m', '1m', 'now'],
      datasets: [{
        data: [0, 0, 0, 0, 0, 0],
        borderColor: '#a855f7',
        backgroundColor: 'rgba(168,85,247,0.15)',
        fill: true, tension: 0.4, pointRadius: 3,
        pointBackgroundColor: '#6366f1'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: 'rgba(99,102,241,0.1)' }, ticks: { color: '#94a3b8' } },
        x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
      }
    }
  });

  setInterval(() => {
    if (!chart) return;
    const online = allBots.filter(b => b.status === 'online').length;
    chart.data.datasets[0].data.shift();
    chart.data.datasets[0].data.push(online);
    chart.update('none');
  }, 5000);
}

// ================= UTILS =================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ================= BOOT =================
checkSession();
