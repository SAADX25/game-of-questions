const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// --- إعدادات الوقت (تم التعديل هنا) ---
const GAME_WAIT_TIME = 120; // دقيقتين (120 ثانية)
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

const questions = [
    { q: "في PUBG، ما اسم الخريطة الصحراوية؟", options: ["Erangel", "Miramar", "Sanhok", "Vikendi"], answer: 1 },
    { q: "سلاح يقتل بطلقة رأس واحدة في CS2؟", options: ["Glock", "AK-47", "M4A4", "P90"], answer: 1 },
    { q: "ما هي الشركة المطورة لـ GTA V؟", options: ["Rockstar", "Ubisoft", "EA", "Activision"], answer: 0 },
    { q: "مادة لا تكسر في Minecraft Survival؟", options: ["Obsidian", "Bedrock", "Diamond", "Gold"], answer: 1 },
    { q: "اسم أخ ماريو؟", options: ["Wario", "Luigi", "Bowser", "Yoshi"], answer: 1 },
    { q: "لعبة Among Us، القاتل يسمى؟", options: ["Impostor", "Crewmate", "Sus", "Killer"], answer: 0 },
    { q: "شخصية Kratos هي بطل لعبة؟", options: ["Halo", "God of War", "Zelda", "Doom"], answer: 1 },
    { q: "أكثر لعبة مبيعاً في التاريخ؟", options: ["GTA V", "Minecraft", "Tetris", "FIFA"], answer: 2 },
    { q: "في FIFA، مدة الشوط الافتراضي؟", options: ["4 د", "6 د", "10 د", "45 د"], answer: 1 },
    { q: "جهاز Xbox من إنتاج؟", options: ["Sony", "Microsoft", "Sega", "Nintendo"], answer: 1 }
];

io.on('connection', (socket) => {
    console.log(`New player connected: ${socket.id}`);

    socket.on('join_game', (data) => {
        players[socket.id] = {
            id: socket.id,
            name: data.name,
            avatar: data.avatar || `https://robohash.org/${data.name}?set=set1`,
            score: 0, streak: 0, answered: false, isReady: false,
            isFrozen: false, hasShield: false,
            abilities: { hack: true, freeze: true, steal: true, shield: true }
        };
        
        io.emit('update_players', Object.values(players));

        if (gameStarted) {
            // دخول متأخر للاعبين الجدد
            socket.emit('start_game');
            socket.emit('new_question', questions[currentQuestionIndex]);
            socket.emit('timer_update', timeLeft);
        } else {
            // إذا كان أول لاعب، ابدأ العداد
            if (Object.keys(players).length === 1) {
                console.log("First player joined! Starting lobby timer...");
                startLobbyTimer();
            } else {
                socket.emit('lobby_timer_update', lobbyTimeLeft);
            }
        }
    });

    socket.on('toggle_ready', () => {
        if (players[socket.id]) {
            players[socket.id].isReady = !players[socket.id].isReady;
            io.emit('update_players', Object.values(players));

            // === الميزة الجديدة: التحقق إذا كان الجميع جاهزاً ===
            const allPlayers = Object.values(players);
            if (allPlayers.length > 0 && allPlayers.every(p => p.isReady)) {
                console.log("All players are ready! Starting game immediately...");
                startGameNow(); // ابدأ اللعبة فوراً دون انتظار المؤقت
            }
        }
    });

    socket.on('use_ability', (type) => {
        const player = players[socket.id];
        if (!player || !gameStarted || !player.abilities[type]) return;
        player.abilities[type] = false;

        if (type === 'hack') {
            const correct = questions[currentQuestionIndex].answer;
            let wrong = [0, 1, 2, 3].filter(i => i !== correct).sort(() => 0.5 - Math.random()).slice(0, 2);
            socket.emit('apply_hack', wrong);
        } else if (type === 'freeze') {
            const leader = Object.values(players).filter(p => p.id !== player.id).sort((a, b) => b.score - a.score)[0];
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
            const leader = Object.values(players).filter(p => p.id !== player.id).sort((a, b) => b.score - a.score)[0];
            if (leader && leader.score > 0) {
                if (leader.hasShield) {
                    players[leader.id].hasShield = false;
                    io.emit('announcement', `🛡️ درع ${leader.name} منع السرقة!`);
                } else {
                    players[leader.id].score -= 10;
                    player.score += 10;
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
        if (!player || !gameStarted || player.answered || player.isFrozen) return;

        player.answered = true;
        const correct = questions[currentQuestionIndex].answer;

        if (answerIndex === correct) {
            player.score += 10 + (player.streak * 2);
            player.streak++;
            socket.emit('answer_result', { correct: true, canAttack: player.streak >= 3 });
        } else {
            player.score -= 5;
            player.streak = 0;
            socket.emit('answer_result', { correct: false, canAttack: false });
        }
        io.emit('update_players', Object.values(players));

        const activePlayers = Object.values(players).filter(p => !p.isFrozen);
        if (activePlayers.length > 0 && activePlayers.every(p => p.answered)) {
            clearInterval(gameInterval);
            currentQuestionIndex++;
            sendNewQuestion();
        }
    });

    socket.on('launch_attack', () => {
        const p = players[socket.id];
        if(p) { p.streak = 0; socket.broadcast.emit('under_attack', p.name); }
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('update_players', Object.values(players));
        
        // التحقق من الجاهزية عند خروج لاعب (ربما يصبح الباقون كلهم جاهزين)
        if (!gameStarted && Object.values(players).length > 0 && Object.values(players).every(p => p.isReady)) {
             startGameNow();
        }

        if (Object.keys(players).length === 0) {
            console.log("No players left. Resetting.");
            stopLobbyTimer();
            clearInterval(gameInterval);
            gameStarted = false;
        }
    });
});

// --- Logic ---

function startLobbyTimer() {
    lobbyTimeLeft = GAME_WAIT_TIME;
    stopLobbyTimer();
    console.log(`Lobby started: ${lobbyTimeLeft}s`);
    
    // تحديث فوري للوقت عند البدء
    io.emit('lobby_timer_update', lobbyTimeLeft);

    lobbyInterval = setInterval(() => {
        lobbyTimeLeft--;
        io.emit('lobby_timer_update', lobbyTimeLeft);
        
        if (lobbyTimeLeft <= 0) {
            startGameNow();
        }
    }, 1000);
}

function stopLobbyTimer() {
    if (lobbyInterval) clearInterval(lobbyInterval);
}

function startGameNow() {
    if (gameStarted) return; // منع التشغيل المزدوج
    gameStarted = true;
    stopLobbyTimer();
    currentQuestionIndex = 0;
    io.emit('start_game');
    sendNewQuestion();
}

function sendNewQuestion() {
    if (currentQuestionIndex >= questions.length) { 
        endGame(); 
        return; 
    }
    
    Object.values(players).forEach(p => { 
        p.answered = false; 
        p.isFrozen = false; 
    });
    
    timeLeft = QUESTION_TIME;
    io.emit('new_question', questions[currentQuestionIndex]);
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
    console.log("Game Over. Restarting in 10s...");

    setTimeout(() => {
        console.log("Resetting game loop...");
        Object.values(players).forEach(p => {
            p.score = 0;
            p.streak = 0;
            p.isReady = false;
            p.answered = false;
            p.isFrozen = false;
            p.hasShield = false;
            p.abilities = { hack: true, freeze: true, steal: true, shield: true };
        });

        io.emit('update_players', Object.values(players));
        io.emit('return_to_lobby');
        currentQuestionIndex = 0;
        
        // إذا بقي لاعبون، ابدأ مؤقت الانتظار من جديد
        if (Object.keys(players).length > 0) {
            startLobbyTimer();
        }
    }, 10000);
}

server.listen(3000, () => { console.log('Server running on port 3000'); });