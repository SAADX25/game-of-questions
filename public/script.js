const socket = io();
let myAvatar = ""; 

const sounds = {
    click: new Audio('/voices/click-play.mp3'),
    correct: new Audio('/voices/victory-play.mp3'),
    wrong: new Audio('/voices/loss-play.mp3'),
    win: new Audio('/voices/victory-play.mp3'),
    alarm: new Audio('/voices/warning-play.mp3'),
    freeze: new Audio('/voices/freezing-play.mp3'),
    steal: new Audio('/voices/warning-play.mp3')
};

let isMuted = false;

function playSound(name) {
    if (!isMuted && sounds[name]) {
        sounds[name].currentTime = 0;
        sounds[name].play().catch(() => {});
    }
}

document.getElementById('chat-input').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        const text = this.value;
        if (text) {
            socket.emit('send_chat', text);
            this.value = '';
        }
    }
});

socket.on('receive_chat', (data) => {
    const box = document.getElementById('chat-messages');
    box.innerHTML += `<div class="msg-line"><span class="msg-user">${data.user}:</span> <span class="msg-text">${data.text}</span></div>`;
    box.scrollTop = box.scrollHeight;
});

document.addEventListener('keydown', (e) => {
    if (['1', '2', '3', '4'].includes(e.key)) {
        const div = document.getElementById('options-container');
        if (!div.classList.contains('options-hidden')) { 
            const index = parseInt(e.key) - 1;
            const btns = document.querySelectorAll('.option-btn');
            if (btns[index] && !btns[index].disabled) btns[index].click();
        }
    }
    if (e.code === 'Space') {
        const readyBtn = document.getElementById('ready-btn');
        if (readyBtn && !readyBtn.classList.contains('hidden')) toggleReady();
    }
});

function copyInviteLink() {
    const link = window.location.href;
    navigator.clipboard.writeText(link).then(() => {
        playSound('click');
        const btn = document.querySelector('.invite-btn');
        const originalText = btn.innerText;
        btn.innerText = "✅ تم النسخ!";
        btn.style.background = "#0f0";
        setTimeout(() => { btn.innerText = originalText; btn.style.background = "#00e5ff"; }, 2000);
    }).catch(err => console.error(err));
}

const bootText = ["INITIALIZING...", "CONNECTING...", "ACCESS GRANTED."];
let lineIndex = 0;
function runBoot() {
    if (lineIndex < bootText.length) {
        const p = document.createElement('div');
        p.innerText = "> " + bootText[lineIndex++];
        document.getElementById('boot-text').appendChild(p);
        setTimeout(runBoot, 500);
    } else {
        setTimeout(() => {
            document.getElementById('boot-screen').style.display = 'none';
            document.getElementById('setup-screen').classList.remove('hidden');
        }, 800);
    }
}
window.onload = runBoot;

function previewImage() {
    const file = document.getElementById('file-upload').files[0];
    const reader = new FileReader();
    reader.onloadend = function() {
        myAvatar = reader.result;
        document.getElementById('avatar-preview').src = myAvatar;
    }
    if (file) reader.readAsDataURL(file);
}

function joinGame() {
    const name = document.getElementById('player-input').value;
    if (name) {
        playSound('click');
        socket.emit('join_game', { name: name, avatar: myAvatar });
        document.getElementById('file-upload').parentNode.style.display = 'none';
        document.getElementById('player-input').style.display = 'none';
        document.querySelector('button[onclick="joinGame()"]').style.display = 'none';
        document.getElementById('waiting-area').classList.remove('hidden');
        document.getElementById('chat-container').classList.remove('hidden');
        const bgMusic = document.getElementById('bg-music');
        if(bgMusic && !isMuted) bgMusic.play().catch(()=>{});
    }
}

function toggleReady() { playSound('click'); socket.emit('toggle_ready'); }
function useAbility(type) { playSound('click'); socket.emit('use_ability', type); }
function launchAttack() { playSound('click'); socket.emit('launch_attack'); document.getElementById('attack-btn').classList.add('hidden'); }

// --- SOCKET EVENTS ---

socket.on('update_players', (players) => {
    const lobby = document.getElementById('lobby-list');
    if (lobby) {
        lobby.innerHTML = '';
        players.forEach(p => {
            const statusClass = p.isReady ? 'status-ready' : 'status-wait';
            const statusText = p.isReady ? 'جاهز' : 'ينتظر';
            lobby.innerHTML += `<li>
                <div style="display:flex; align-items:center;">
                    <img src="${p.avatar}" class="avatar-small">
                    <span style="margin-right:10px;">${p.name}</span>
                </div>
                <span class="status-badge ${statusClass}">${statusText}</span>
            </li>`;
        });
    }
    const scores = document.getElementById('live-scores');
    if (scores) {
        scores.innerHTML = '';
        players.sort((a,b) => b.score - a.score).forEach(p => {
            let status = "";
            if(p.isFrozen) status = "❄️";
            if(p.hasShield) status += "🛡️";
            if(p.streak >= 3) status += "🔥";
            if(p.isDead) status += "☠️";

            // === إخفاء نقاط الأعداء (Blind Scoreboard) ===
            let displayedScore = p.id === socket.id ? p.score : "???";
            if (p.isDead) displayedScore = "DEAD";

            scores.innerHTML += `<li>
                <div style="display:flex; align-items:center;">
                    <img src="${p.avatar}" class="avatar-small"> ${p.name} ${status}
                </div>
                <span style="color:${p.score > 0 ? 'yellow' : 'white'}">${displayedScore}</span>
            </li>`;
        });
    }
    
    const myPlayer = players.find(p => p.id === socket.id);
    const btn = document.getElementById('ready-btn');
    if(myPlayer && btn) {
        if(myPlayer.isReady) {
            btn.innerText = "أنت جاهز"; btn.style.background = "#0f0"; btn.style.color = "black";
        } else {
            btn.innerText = "اضغط للاستعداد"; btn.style.background = "black"; btn.style.color = "white";
        }
    }
});

socket.on('lobby_timer_update', (t) => { document.getElementById('lobby-timer').innerText = t; });

socket.on('start_game', () => {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('winner-screen').classList.add('hidden'); 
    document.getElementById('game-screen').classList.remove('hidden');
});

socket.on('new_question', (q) => {
    playSound('click');
    const txt = document.getElementById('question-text');
    txt.innerText = q.q;
    txt.style.color = "white";
    document.getElementById('attack-btn').classList.add('hidden');

    const div = document.getElementById('options-container');
    div.innerHTML = '';
    
    div.classList.remove('options-visible');
    div.classList.add('options-hidden');

    q.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.onclick = () => {
            socket.emit('submit_answer', i);
            document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
        };
        btn.innerHTML = `<span style="color:yellow; font-size:0.8em;">[${i+1}]</span> ${opt}`;
        div.appendChild(btn);
    });

    setTimeout(() => {
        div.classList.remove('options-hidden');
        div.classList.add('options-visible');
        playSound('click');
    }, 4000);
});

// --- نظام القتل ---
socket.on('grant_kill_ability', (enemies) => {
    const modal = document.getElementById('kill-modal');
    const container = document.getElementById('kill-list');
    container.innerHTML = '';

    if (enemies.length === 0) return; // لا يوجد أحد لقتله

    playSound('alarm');
    modal.style.display = 'block';

    enemies.forEach(enemy => {
        const btn = document.createElement('button');
        btn.className = 'victim-btn';
        btn.innerText = `EXECUTE ${enemy.name}`;
        btn.onclick = () => {
            socket.emit('execute_player', enemy.id);
            modal.style.display = 'none';
        };
        container.appendChild(btn);
    });
});

socket.on('you_died', (killerName) => {
    document.getElementById('game-screen').classList.add('hidden');
    const deathScreen = document.getElementById('death-screen');
    deathScreen.style.display = 'flex';
    document.getElementById('killer-name').innerText = `قتلك: ${killerName}`;
    playSound('wrong');
});

socket.on('timer_update', (t) => {
    const percentage = (t/30)*100;
    document.getElementById('timer-bar').style.width = percentage + "%";
    const bar = document.getElementById('timer-bar');
    const music = document.getElementById('bg-music');
    
    if(t <= 5 && t > 0) {
        bar.style.background = "red";
        if(music) music.playbackRate = 1.5; 
    } else {
        bar.style.background = "#ff00c1";
        if(music) music.playbackRate = 1.0; 
    }
});

socket.on('apply_hack', (indices) => {
    const btns = document.querySelectorAll('.option-btn');
    indices.forEach(i => { if(btns[i]) btns[i].style.visibility = 'hidden'; });
});

socket.on('you_are_frozen', () => {
    playSound('freeze');
    const overlay = document.getElementById('notification-overlay');
    overlay.innerText = "❄️ أنت مجمد! ❄️";
    overlay.style.display = "block";
    document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
    setTimeout(() => overlay.style.display = "none", 3000);
});

socket.on('announcement', (msg) => {
    const overlay = document.getElementById('notification-overlay');
    overlay.innerText = msg;
    overlay.style.display = "block";
    if(msg.includes('سرق')) playSound('steal');
    if(msg.includes('تجميد')) playSound('freeze');
    if(msg.includes('درع')) playSound('click');
    if(msg.includes('إعدام')) playSound('wrong');
    setTimeout(() => overlay.style.display = "none", 3000);
});

socket.on('under_attack', (name) => {
    playSound('alarm');
    document.body.classList.add('shake-effect');
    const ov = document.getElementById('attack-overlay');
    ov.innerText = `⚠️ SYSTEM BREACH BY ${name} ⚠️`;
    ov.style.display = "flex";
    setTimeout(() => { 
        ov.style.display = "none"; 
        document.body.classList.remove('shake-effect');
    }, 3000);
});

socket.on('answer_result', (res) => {
    const txt = document.getElementById('question-text');
    const panel = document.querySelector('.panel');
    
    if(res.correct) {
        playSound('correct');
        txt.innerText = "ACCESS GRANTED"; 
        txt.style.color = "#0f0";
        panel.classList.add('correct-effect');
        setTimeout(() => panel.classList.remove('correct-effect'), 1000);
        if(res.canAttack) document.getElementById('attack-btn').classList.remove('hidden');
    } else {
        playSound('wrong');
        txt.innerText = "ACCESS DENIED"; 
        txt.style.color = "red";
        document.body.classList.add('shake-effect');
        setTimeout(() => document.body.classList.remove('shake-effect'), 500);
    }
    setTimeout(() => txt.style.color = "white", 1000);
});

socket.on('game_over', (players) => {
    playSound('win');
    document.getElementById('death-screen').style.display = 'none'; // إخفاء شاشة الموت
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('winner-screen').classList.remove('hidden');
    document.getElementById('chat-container').classList.add('hidden');
    
    // إظهار النتائج النهائية كاملة الآن (لكي يعرفوا ترتيبهم)
    players.sort((a,b) => b.score - a.score);
    const win = players[0];
    document.getElementById('winner-info').innerHTML = `
        <img src="${win.avatar}" class="avatar-large">
        <h2>${win.name}</h2>
        <h3>SCORE: ${win.score}</h3>
    `;
});

socket.on('return_to_lobby', () => {
    playSound('click');
    document.getElementById('winner-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('waiting-area').classList.remove('hidden');
    document.getElementById('death-screen').style.display = 'none';
    const readyBtn = document.getElementById('ready-btn');
    if(readyBtn) {
        readyBtn.innerText = "اضغط للاستعداد";
        readyBtn.style.background = "black";
        readyBtn.style.color = "white";
    }
});

const canvas = document.getElementById('matrix-bg');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth; canvas.height = window.innerHeight;
const cols = canvas.width / 20;
const drops = Array(Math.floor(cols)).fill(1);
setInterval(() => {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0F0';
    drops.forEach((y, i) => {
        const text = String.fromCharCode(0x30A0 + Math.random() * 96);
        ctx.fillText(text, i*20, y*20);
        if(y*20 > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
    });
}, 50);

function toggleMute() {
    isMuted = !isMuted;
    const btn = document.getElementById('mute-btn');
    const m = document.getElementById('bg-music');
    if(isMuted) { if(m) m.pause(); btn.innerText = "🔇"; } 
    else { if(m) m.play().catch(()=>{}); btn.innerText = "🔊"; }
}