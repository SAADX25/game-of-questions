const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// --- إعدادات اللعبة ---
const GAME_WAIT_TIME = 120; // وقت الانتظار في اللوبي
const QUESTION_TIME = 30;   // وقت السؤال

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

let players = {};
let gameStarted = false;
let currentQuestionIndex = 0;
let timeLeft = QUESTION_TIME;
let gameInterval;
let lobbyTimeLeft = GAME_WAIT_TIME;
let lobbyInterval;
let currentGameQuestions = [];

// --- 🌐 بنك الأسئلة الشامل (مدمج) ---
const allQuestions = [
    { q: "ما هي عاصمة اليابان؟", options: ["سول", "بكين", "طوكيو", "بانكوك"], answer: 2 },
    { q: "أطول نهر في العالم؟", options: ["النيل", "الأمازون", "الفرات", "المسيسيبي"], answer: 0 },
    { q: "في أي قارة تقع البرازيل؟", options: ["أفريقيا", "أوروبا", "آسيا", "أمريكا الجنوبية"], answer: 3 },
    { q: "دولة تشتهر بالأهرامات؟", options: ["المكسيك", "مصر", "السودان", "بيرو"], answer: 1 },
    { q: "وحدة المعالجة المركزية تسمى؟", options: ["GPU", "RAM", "CPU", "SSD"], answer: 2 },
    { q: "لغة برمجة لتصميم الويب؟", options: ["Python", "C++", "HTML", "Java"], answer: 2 },
    { q: "ماذا يعني AI؟", options: ["Apple Inc", "Artificial Intelligence", "All Internet", "Auto Image"], answer: 1 },
    { q: "متى انتهت الحرب العالمية الثانية؟", options: ["1918", "1939", "1945", "1960"], answer: 2 },
    { q: "فاتح القسطنطينية؟", options: ["خالد بن الوليد", "محمد الفاتح", "طارق بن زياد", "بيبرس"], answer: 1 },
    { q: "شعارها حصان يثب؟", options: ["لامبورغيني", "فورد", "فيراري", "بورش"], answer: 2 },
    { q: "السيارة الملقبة بـ 'جودزيلا'؟", options: ["Toyota Supra", "Nissan GTR", "Honda NSX", "Mazda RX7"], answer: 1 },
    { q: "الفائز بكأس العالم 2022؟", options: ["فرنسا", "البرازيل", "الأرجنتين", "ألمانيا"], answer: 2 },
    { q: "خريطة صحراوية في PUBG؟", options: ["Erangel", "Miramar", "Sanhok", "Vikendi"], answer: 1 },
    { q: "سلاح القنص في CS2؟", options: ["AK-47", "AWP", "M4A1", "Desert Eagle"], answer: 1 }
];

function prepareNewGame() {
    let shuffled = [...allQuestions].sort(() => 0.5 - Math.random());
    currentGameQuestions = shuffled.slice(0, 15);
}

io.on('connection', (socket) => {
    socket.on('join_game', (data) => {
        players[socket.id] = {
            id: socket.id,
            name: data.name,
            avatar: data.avatar || `https://robohash.org/${data.name}?set=set1`,
            score: 0, streak: 0, answered: false, isReady: false,
            isFrozen: false, hasShield: false, isDead: false,
            abilities: { hack: true, freeze: true, steal: true, shield: true }
        };
        io.emit('update_players', Object.values(players));

        if (gameStarted) {
            socket.emit('start_game');
            socket.emit('new_question', currentGameQuestions[currentQuestionIndex]);
            socket.emit('timer_update', timeLeft);
        } else {
            if (Object.keys(players).length === 1) startLobbyTimer();
            else socket.emit('lobby_timer_update', lobbyTimeLeft);
        }
    });

    // الشات (مفتوح للجميع بمن فيهم الموتى)
    socket.on('send_chat', (msg) => {
        const player = players[socket.id];
        if (player) {
            io.emit('receive_chat', { user: player.name, text: msg });
        }
    });

    socket.on('toggle_ready', () => {
        if (players[socket.id]) {
            players[socket.id].isReady = !players[socket.id].isReady;
            io.emit('update_players', Object.values(players));
            const allPlayers = Object.values(players);
            if (allPlayers.length > 0 && allPlayers.every(p => p.isReady)) startGameNow();
        }
    });

    // نظام الإعدام
    socket.on('execute_player', (targetId) => {
        const killer = players[socket.id];
        const victim = players[targetId];

        if (killer && victim && !victim.isDead && killer.streak >= 6) {
            victim.isDead = true;
            victim.score = -9999;
            killer.streak = 0;

            io.to(targetId).emit('you_died', killer.name);
            io.emit('announcement', `☠️ تم إعدام ${victim.name} بواسطة ${killer.name}!`);
            io.emit('update_players', Object.values(players));
        }
    });

    socket.on('use_ability', (type) => {
        const player = players[socket.id];
        if (!player || !gameStarted || !player.abilities[type] || player.isDead) return;
        player.abilities[type] = false;

        if (type === 'hack') {
            const correct = currentGameQuestions[currentQuestionIndex].answer;
            let wrong = [0, 1, 2, 3].filter(i => i !== correct).sort(() => 0.5 - Math.random()).slice(0, 2);
            socket.emit('apply_hack', wrong);
        } else if (type === 'freeze') {
            const leader = Object.values(players).filter(p => p.id !== player.id && !p.isDead).sort((a, b) => b.score - a.score)[0];
            if (leader) {
                if (!leader.hasShield) {
                    players[leader.id].isFrozen = true;
                    io.to(leader.id).emit('you_are_frozen');
                    io.emit('announcement', `❄️ ${player.name} جمد ${leader.name}!`);
                } else {
                    players[leader.id].hasShield = false;
                    io.emit('announcement', `🛡️ درع ${leader.name} تصدى لتجميد ${player.name}!`);
                }
            }
        } else if (type === 'steal') {
            const leader = Object.values(players).filter(p => p.id !== player.id && !p.isDead).sort((a, b) => b.score - a.score)[0];
            if (leader && leader.score > 0) {
                if (leader.hasShield) {
                    players[leader.id].hasShield = false;
                    io.emit('announcement', `🛡️ درع ${leader.name} منع السرقة!`);
                } else {
                    players[leader.id].score -= 100;
                    player.score += 100;
                    io.emit('announcement', `💰 ${player.name} سرق نقاط ${leader.name}!`);
                }
            }
        } else if (type === 'shield') {
            player.hasShield = true;
            io.emit('announcement', `🛡️ ${player.name} فعل جدار الحماية!`);
        }
        io.emit('update_players', Object.values(players));
    });

    socket.on('submit_answer', (answerIndex) => {
        const player = players[socket.id];
        if (!player || !gameStarted || player.answered || player.isFrozen || player.isDead) return;

        player.answered = true;
        const correct = currentGameQuestions[currentQuestionIndex].answer;

        if (answerIndex === correct) {
            const speedBonus = Math.floor(timeLeft * 3);
            player.score += 50 + speedBonus + (player.streak * 10);
            player.streak++;

            if (player.streak === 6) {
                socket.emit('grant_kill_ability', Object.values(players).filter(p => p.id !== player.id && !p.isDead));
            }
            
            socket.emit('answer_result', { correct: true, canAttack: player.streak >= 3 });
        } else {
            player.score -= 20;
            player.streak = 0;
            socket.emit('answer_result', { correct: false, canAttack: false });
        }
        io.emit('update_players', Object.values(players));

        const activePlayers = Object.values(players).filter(p => !p.isFrozen && !p.isDead);
        if (activePlayers.length > 0 && activePlayers.every(p => p.answered)) {
            clearInterval(gameInterval);
            currentQuestionIndex++;
            sendNewQuestion();
        }
    });

    socket.on('launch_attack', () => {
        const p = players[socket.id];
        if(p && !p.isDead) { p.streak = 0; socket.broadcast.emit('under_attack', p.name); }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('update_players', Object.values(players));
        if (Object.keys(players).length === 0) {
            stopLobbyTimer();
            clearInterval(gameInterval);
            gameStarted = false;
        }
    });
});

function startLobbyTimer() {
    lobbyTimeLeft = GAME_WAIT_TIME;
    stopLobbyTimer();
    io.emit('lobby_timer_update', lobbyTimeLeft);
    lobbyInterval = setInterval(() => {
        lobbyTimeLeft--;
        io.emit('lobby_timer_update', lobbyTimeLeft);
        if (lobbyTimeLeft <= 0) startGameNow();
    }, 1000);
}

function stopLobbyTimer() { if (lobbyInterval) clearInterval(lobbyInterval); }

function startGameNow() {
    if (gameStarted) return;
    prepareNewGame();
    gameStarted = true;
    stopLobbyTimer();
    currentQuestionIndex = 0;
    io.emit('start_game');
    sendNewQuestion();
}

function sendNewQuestion() {
    if (currentQuestionIndex >= currentGameQuestions.length) { endGame(); return; }
    Object.values(players).forEach(p => { p.answered = false; p.isFrozen = false; });
    timeLeft = QUESTION_TIME;
    io.emit('new_question', currentGameQuestions[currentQuestionIndex]);
    io.emit('timer_update', timeLeft);
    if(gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(() => {
        timeLeft--;
        io.emit('timer_update', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(gameInterval);
            currentQuestionIndex++;
            sendNewQuestion();
        }
    }, 1000);
}

function endGame() {
    gameStarted = false;
    stopLobbyTimer();
    clearInterval(gameInterval);
    io.emit('game_over', Object.values(players));
    setTimeout(() => {
        Object.values(players).forEach(p => {
            p.score = 0; p.streak = 0; p.isReady = false; p.answered = false;
            p.isFrozen = false; p.hasShield = false; p.isDead = false;
            p.abilities = { hack: true, freeze: true, steal: true, shield: true };
        });
        io.emit('update_players', Object.values(players));
        io.emit('return_to_lobby');
        if (Object.keys(players).length > 0) startLobbyTimer();
    }, 10000);
}

server.listen(3000, () => { console.log('Server running on port 3000'); });