// Chess Arena — исправленный полный скрипт
// Требует chess.js 0.10.3, подключённый перед этим файлом в index.html.

"use strict";

const board = document.getElementById("board");
const statusBox = document.getElementById("status");
const historyBox = document.getElementById("history");
const sideSelect = document.getElementById("side");
const difficultySelect = document.getElementById("difficulty");
const difficultyLabel = document.getElementById("difficulty-label");
const yourColorLabel = document.getElementById("your-color");
const newBtn = document.getElementById("newBtn");
const flipBtn = document.getElementById("flipBtn");
const undoBtn = document.getElementById("undoBtn");
const statsBox = document.getElementById("game-stats");
let moveGrades = [];

// Проверяем, что HTML содержит все необходимые элементы.
if (!board || !statusBox || !historyBox || !sideSelect ||
    !difficultySelect || !difficultyLabel ||
    !yourColorLabel || !newBtn || !flipBtn || !undoBtn || !statsBox) {
    throw new Error("Chess Arena: не найдены необходимые элементы HTML.");
}

// Проверяем загрузку шахматной библиотеки.
if (typeof window.Chess !== "function") {
    statusBox.textContent =
        "Ошибка: Chess.js не загрузился. Проверь интернет и обнови страницу.";
    board.innerHTML = `
        <div style="grid-column:1/-1;padding:30px;text-align:center;color:#fff">
            Не удалось загрузить шахматную библиотеку Chess.js.
        </div>`;
    throw new Error("Chess.js library not found");
}

const game = new Chess();

const symbols = {
    K: "♔", Q: "♕", R: "♖", B: "♗",
    N: "♘", P: "♙",
    k: "♚", q: "♛", r: "♜",
    b: "♝", n: "♞", p: "♟"
};

const values = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 0
};

// Уровни — это настройки силы именно этого простого бота,
// а не официальный рейтинг FIDE.
const difficultySettings = {
    "100":  { name: "Слабый", depth: 1, randomTop: 8, mistakeChance: 0.55, elo: 100, time: 150 },
    "300":  { name: "Начинающий", depth: 1, randomTop: 5, mistakeChance: 0.30, elo: 300, time: 200 },
    "500":  { name: "Средний", depth: 2, randomTop: 3, mistakeChance: 0.16, elo: 500, time: 300 },
    "800":  { name: "Хороший", depth: 2, randomTop: 2, mistakeChance: 0.07, elo: 800, time: 450 },
    "1200": { name: "Продвинутый", depth: 3, randomTop: 1, mistakeChance: 0.00, elo: 1200, time: 700 },
    "1500": { name: "Сильный", depth: 4, randomTop: 1, mistakeChance: 0.00, elo: 1500, time: 1200 },
    "2800": { name: "Эксперт · Stockfish", depth: 5, randomTop: 1, mistakeChance: 0.00, elo: 2800, time: 900 }
};

let botLevel = difficultySelect.value || "800";

let selected = null;
let legalMoves = [];
let playerColor = "w";
let flipped = false;
let lastMove = null;
let botThinking = false;

// Номер партии защищает от запоздавшего хода бота после начала новой игры.
let gameGeneration = 0;

function renderBoard() {
    board.innerHTML = "";

    const files = flipped
        ? ["h", "g", "f", "e", "d", "c", "b", "a"]
        : ["a", "b", "c", "d", "e", "f", "g", "h"];

    const ranks = flipped
        ? [1, 2, 3, 4, 5, 6, 7, 8]
        : [8, 7, 6, 5, 4, 3, 2, 1];

    ranks.forEach((rank, row) => {
        files.forEach((file, col) => {
            const square = file + rank;
            const piece = game.get(square);
            const cell = document.createElement("div");

            cell.className = "square " +
                ((row + col) % 2 === 0 ? "light" : "dark");
            cell.dataset.square = square;

            if (selected === square) {
                cell.classList.add("selected");
            }

            if (lastMove &&
                (lastMove.from === square || lastMove.to === square)) {
                cell.classList.add("last-move");
            }

            if (legalMoves.some(move => move.to === square)) {
                cell.classList.add(piece ? "capture" : "possible");
            }

            if (piece) {
                const symbol = document.createElement("span");
                symbol.className = "piece " +
                    (piece.color === "w" ? "white-piece" : "black-piece");

                const symbolKey = piece.color === "w"
                    ? piece.type.toUpperCase()
                    : piece.type;

                symbol.textContent = symbols[symbolKey];
                cell.appendChild(symbol);
            }

            if (col === 0) {
                const coordinate = document.createElement("span");
                coordinate.className = "coord rank";
                coordinate.textContent = rank;
                cell.appendChild(coordinate);
            }

            if (row === 7) {
                const coordinate = document.createElement("span");
                coordinate.className = "coord file";
                coordinate.textContent = file;
                cell.appendChild(coordinate);
            }

            cell.addEventListener("click", () => handleClick(square));
            board.appendChild(cell);
        });
    });
}

function handleClick(square) {
    if (game.game_over() || botThinking ||
        game.turn() !== playerColor) {
        return;
    }

    const piece = game.get(square);

    if (selected) {
        const move = legalMoves.find(item => item.to === square);

        if (move) {
            makePlayerMove(move);
            return;
        }
    }

    if (piece && piece.color === playerColor) {
        selected = square;
        legalMoves = game.moves({
            square: square,
            verbose: true
        });
    } else {
        selected = null;
        legalMoves = [];
    }

    renderBoard();
}


function gradePlayerMove(move) {
    const piece = game.get(move.to);
    const pieceValue = piece ? values[piece.type] : 0;
    const replies = game.moves({ verbose: true });
    const hanging = replies.some(reply => reply.to === move.to) && pieceValue >= 300;
    let grade = hanging ? "Зевок" : "Хороший";
    // Эвристика для эффектного шаха с жертвой; не заменяет Stockfish.
    if (hanging && game.in_check()) grade = "Бриллиантовый";
    moveGrades.push({ grade, san: move.san, from: move.from, to: move.to });
    renderGameStats();
}

function renderGameStats(final = false) {
    const counts = { "Хороший": 0, "Зевок": 0, "Бриллиантовый": 0 };
    moveGrades.forEach(item => counts[item.grade]++);
    statsBox.innerHTML = `
      <div class="stats-title">${final ? "🏁 Итоги партии" : "📊 Твоя статистика"}</div>
      <div class="stats-grid">
        <div class="stat-item good"><strong>${counts["Хороший"]}</strong><span>Хороших</span></div>
        <div class="stat-item blunder"><strong>${counts["Зевок"]}</strong><span>Зевков</span></div>
        <div class="stat-item brilliant"><strong>${counts["Бриллиантовый"]}</strong><span>Бриллиантовых</span></div>
      </div>
      <div class="stats-note">Оценка приблизительная, не как у Stockfish.</div>`;
    statsBox.classList.toggle("final-stats", final);
}

function makePlayerMove(move) {
    try {
        const result = game.move({
            from: move.from,
            to: move.to,
            promotion: "q"
        });

        if (!result) return;

        lastMove = result;
        gradePlayerMove(result);
        selected = null;
        legalMoves = [];

        renderBoard();
        updateGame();

        if (!game.game_over()) {
            botMove();
        }
    } catch (error) {
        console.error("Player move error:", error);
    }
}

// Оценка позиции: материал, центр, развитие фигур и продвижение пешек.
// Положительное значение всегда выгодно белым.
function evaluatePosition() {
    const boardState = game.board();
    let score = 0;
    let whiteMinorDeveloped = 0;
    let blackMinorDeveloped = 0;

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = boardState[row][col];
            if (!piece) continue;

            const isWhite = piece.color === "w";
            const sign = isWhite ? 1 : -1;
            const centerDistance = Math.abs(3.5 - col) + Math.abs(3.5 - row);
            let value = values[piece.type];

            if (piece.type === "p") {
                // Пешки полезно продвигать, особенно центральные.
                const advance = isWhite ? 6 - row : row - 1;
                value += Math.max(0, advance) * 9;
                if (col >= 2 && col <= 5) value += 10;
            } else if (piece.type === "n" || piece.type === "b") {
                value += Math.max(0, 4.5 - centerDistance) * 13;
                if ((isWhite && row <= 5) || (!isWhite && row >= 2)) {
                    if (piece.type === "n") value += 12;
                }
                if (piece.type === "n" || piece.type === "b") {
                    if (isWhite && (row === 7 && (col === 1 || col === 6))) {
                        // Не штрафуем начальную позицию в самом дебюте.
                    } else if (!isWhite && (row === 0 && (col === 1 || col === 6))) {
                    } else {
                        if (isWhite) whiteMinorDeveloped++;
                        else blackMinorDeveloped++;
                    }
                }
            } else if (piece.type === "q") {
                value += Math.max(0, 3.5 - centerDistance) * 4;
            }

            score += sign * value;
        }
    }

    // Небольшой бонус за развитие лёгких фигур.
    score += (whiteMinorDeveloped - blackMinorDeveloped) * 8;
    return score;
}

function moveOrderScore(move) {
    let score = 0;
    if (move.captured) score += 10 * values[move.captured] - values[move.piece];
    if (move.promotion) score += 900 + values[move.promotion];
    if (move.flags && (move.flags.includes("k") || move.flags.includes("q"))) score += 35;
    return score;
}

function minimax(depth, alpha, beta, botColor, ply) {
    if (game.in_checkmate()) {
        return game.turn() === botColor ? -100000 + ply : 100000 - ply;
    }
    if (game.in_draw() || game.in_stalemate() || depth === 0) {
        const whiteScore = evaluatePosition();
        return botColor === "w" ? whiteScore : -whiteScore;
    }

    const maximizing = game.turn() === botColor;
    const moves = game.moves({ verbose: true });
    moves.sort((a, b) => moveOrderScore(b) - moveOrderScore(a));

    let best = maximizing ? -Infinity : Infinity;
    for (const move of moves) {
        game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
        const score = minimax(depth - 1, alpha, beta, botColor, ply + 1);
        game.undo();

        if (maximizing) {
            if (score > best) best = score;
            if (best > alpha) alpha = best;
        } else {
            if (score < best) best = score;
            if (best < beta) beta = best;
        }
        if (beta <= alpha) break;
    }
    return best;
}

// Альфа-бета поиск заставляет бота учитывать ответы соперника,
// а не просто выбирать ход по материалу.
function chooseBotMove() {
    const moves = game.moves({ verbose: true });
    if (!moves.length) return null;

    const settings = difficultySettings[botLevel] || difficultySettings["800"];
    const botColor = playerColor === "w" ? "b" : "w";
    moves.sort((a, b) => moveOrderScore(b) - moveOrderScore(a));

    const scoredMoves = [];
    for (const move of moves) {
        game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
        const score = minimax(settings.depth - 1, -Infinity, Infinity, botColor, 1);
        game.undo();
        scoredMoves.push({ move, score });
    }

    scoredMoves.sort((a, b) => b.score - a.score);
    // На низких уровнях бот иногда выбирает не лучший вариант намеренно.
    const poolSize = Math.min(settings.randomTop, scoredMoves.length);
    const pool = scoredMoves.slice(0, poolSize);
    if (pool.length > 1 && Math.random() < settings.mistakeChance) {
        return pool[Math.floor(Math.random() * pool.length)].move;
    }
    return pool[0].move;
}

// Stockfish работает в отдельном потоке, чтобы не зависал интерфейс.
// Если CDN/интернет недоступен, автоматически используется встроенный поиск.
let stockfishWorker = null;
let stockfishReady = false;
let stockfishPending = null;
let stockfishInitTimer = null;
const STOCKFISH_URL = "https://cdn.jsdelivr.net/npm/stockfish@17.1.0/bin/stockfish-17.1-lite-single-03e3232.js";

function startStockfish() {
    if (stockfishWorker) return;
    try {
        stockfishWorker = new Worker(STOCKFISH_URL);
        stockfishWorker.onmessage = event => {
            const line = String(event.data || "");
            if (line === "uciok") {
                stockfishWorker.postMessage("setoption name Threads value 1");
                stockfishWorker.postMessage("setoption name Hash value 64");
                stockfishWorker.postMessage("isready");
            } else if (line === "readyok") {
                stockfishReady = true;
                clearTimeout(stockfishInitTimer);
            } else if (line.startsWith("bestmove ") && stockfishPending) {
                const pending = stockfishPending;
                stockfishPending = null;
                clearTimeout(pending.timer);
                const uci = line.split(/\s+/)[1];
                pending.resolve(uci && uci !== "(none)" ? uci : null);
            }
        };
        stockfishWorker.onerror = () => {
            stockfishReady = false;
            try { stockfishWorker.terminate(); } catch (_) {}
            stockfishWorker = null;
            if (stockfishPending) {
                const pending = stockfishPending;
                stockfishPending = null;
                clearTimeout(pending.timer);
                pending.resolve(null);
            }
        };
        stockfishWorker.postMessage("uci");
        stockfishInitTimer = setTimeout(() => { stockfishReady = false; }, 12000);
    } catch (error) {
        stockfishWorker = null;
        stockfishReady = false;
    }
}

function stockfishMove() {
    return new Promise(resolve => {
        if (!stockfishWorker || !stockfishReady || stockfishPending) {
            resolve(null);
            return;
        }
        const settings = difficultySettings[botLevel] || difficultySettings["800"];
        const elo = settings.elo;
        stockfishWorker.postMessage("setoption name UCI_LimitStrength value true");
        stockfishWorker.postMessage("setoption name UCI_Elo value " + elo);
        stockfishWorker.postMessage("setoption name Skill Level value " + (elo >= 2800 ? 20 : Math.max(0, Math.min(20, Math.round(elo / 140)))));
        stockfishWorker.postMessage("position fen " + game.fen());
        stockfishPending = {
            resolve,
            timer: setTimeout(() => {
                if (!stockfishPending) return;
                stockfishPending = null;
                resolve(null);
            }, settings.time + 2500)
        };
        stockfishWorker.postMessage("go movetime " + settings.time);
    });
}

function applyUciMove(uci) {
    if (!uci || uci.length < 4) return null;
    return game.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : "q"
    });
}

function botMove() {
    if (game.game_over() || botThinking) return;

    botThinking = true;
    const thisGame = gameGeneration;
    statusBox.textContent = "🤖 Бот думает...";

    setTimeout(async () => {
        if (thisGame !== gameGeneration) return;
        if (game.game_over()) {
            botThinking = false;
            updateGame();
            return;
        }

        let result = null;
        // На сильных уровнях сначала используем настоящий шахматный движок.
        if (Number(botLevel) >= 1200) {
            const uci = await stockfishMove();
            if (thisGame !== gameGeneration) return;
            if (uci) result = applyUciMove(uci);
        }
        // Резервный алгоритм: работает даже без интернета или если движок не загрузился.
        if (!result) {
            const move = chooseBotMove();
            if (move) result = game.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion || "q"
            });
        }

        if (result) lastMove = result;
        botThinking = false;
        selected = null;
        legalMoves = [];
        renderBoard();
        updateGame();
    }, 250);
}

function updateGame() {
    updateHistory();

    if (game.in_checkmate()) {
        statusBox.textContent =
            game.turn() === playerColor
                ? "☠ Мат! Победил бот!"
                : "🏆 Мат! Ты победил!";
    } else if (game.in_stalemate()) {
        statusBox.textContent = "Ничья: пат.";
    } else if (game.in_draw()) {
        statusBox.textContent = "Ничья! Игра окончена.";
    } else if (game.in_check()) {
        statusBox.textContent = "⚠ Шах!";
    } else {
        statusBox.textContent =
            game.turn() === playerColor
                ? "♟ Твой ход!"
                : "🤖 Ход бота...";
    }
    renderGameStats(game.game_over());
}

function updateHistory() {
    const history = game.history();

    if (!history.length) {
        historyBox.innerHTML =
            '<p class="empty">Твои ходы появятся здесь.</p>';
        return;
    }

    let html = "";

    for (let i = 0; i < history.length; i += 2) {
        html += `
            <div class="history-row">
                <span>${Math.floor(i / 2) + 1}.</span>
                <strong>${history[i] || ""}</strong>
                <strong>${history[i + 1] || ""}</strong>
            </div>
        `;
    }

    historyBox.innerHTML = html;
    historyBox.scrollTop = historyBox.scrollHeight;
}

function newGame() {
    // Инвалидируем таймер предыдущей партии.
    gameGeneration++;
    botThinking = false;

    game.reset();
    moveGrades = [];
    renderGameStats(false);

    selected = null;
    legalMoves = [];
    lastMove = null;
    flipped = playerColor === "b";

    yourColorLabel.textContent =
        playerColor === "w" ? "White pieces" : "Black pieces";

    difficultyLabel.textContent = botLevel + " ELO · " +
        difficultySettings[botLevel].name;
    document.getElementById("top-rating").textContent = botLevel + " ELO";
    const botLevelName = document.getElementById("bot-level-name");
    if (botLevelName) botLevelName.textContent = difficultySettings[botLevel].name + " · " + botLevel + " ELO";

    renderBoard();
    updateGame();

    // Если игрок выбрал чёрные фигуры, первым ходит бот белыми.
    if (playerColor === "b") {
        botMove();
    }
}

newBtn.addEventListener("click", newGame);

flipBtn.addEventListener("click", () => {
    flipped = !flipped;
    renderBoard();
});

undoBtn.addEventListener("click", () => {
    if (botThinking || game.history().length === 0) return;

    game.undo();

    // Если бот уже ответил, отменяем также ход игрока.
    if (game.turn() !== playerColor && game.history().length > 0) {
        game.undo();
    }
    if (moveGrades.length > 0) moveGrades.pop();
    renderGameStats(game.game_over());

    selected = null;
    legalMoves = [];
    lastMove = null;

    const history = game.history({ verbose: true });
    if (history.length > 0) {
        lastMove = history[history.length - 1];
    }

    renderBoard();
    updateGame();
});

sideSelect.addEventListener("change", () => {
    playerColor = sideSelect.value;
    newGame();
});

difficultySelect.addEventListener("change", () => {
    botLevel = difficultySelect.value;
    difficultyLabel.textContent = botLevel + " ELO · " +
        difficultySettings[botLevel].name;
    document.getElementById("top-rating").textContent = botLevel + " ELO";
    const botLevelName = document.getElementById("bot-level-name");
    if (botLevelName) botLevelName.textContent = difficultySettings[botLevel].name + " · " + botLevel + " ELO";
    // Новый уровень применяется со следующего хода бота.
});

// Запуск движка и игры.
startStockfish();
newGame();
