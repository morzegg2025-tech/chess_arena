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

/* Chess Arena additions: local mode, replay, editor, arrows, promotion and themes. */
let gameMode = "bot";
let puzzleMode = false;
let editorMode = false;
let replayPositions = [game.fen()];
let replayIndex = 0;
let replaying = false;
let pendingPromotion = null;
let drawnArrows = [];
let arrowStart = null;
const modeSelect = document.getElementById("mode");
const modeLabel = document.getElementById("mode-label");
const themeSelect = document.getElementById("theme");
const editBtn = document.getElementById("editBtn");
const editorPiece = document.getElementById("editorPiece");
let editorChoice = editorPiece ? editorPiece.value : "wP";
if (editorPiece) editorPiece.addEventListener("change", () => { editorChoice = editorPiece.value; });
const backBtn = document.getElementById("backBtn");
const forwardBtn = document.getElementById("forwardBtn");
const promotionModal = document.getElementById("promotionModal");

function rememberPosition() {
    const fen = game.fen();
    if (replayPositions[replayPositions.length - 1] !== fen) {
        replayPositions = replayPositions.slice(0, replayIndex + 1);
        replayPositions.push(fen);
        replayIndex = replayPositions.length - 1;
    }
}
function setReplayPosition(index) {
    if (index < 0 || index >= replayPositions.length) return;
    replayIndex = index;
    replaying = index < replayPositions.length - 1;
    game.load(replayPositions[index]);
    selected = null; legalMoves = []; lastMove = null;
    const verbose = game.history({verbose:true});
    if (verbose.length) lastMove = verbose[verbose.length - 1];
    renderBoard(); updateHistory();
    statusBox.textContent = "Просмотр партии: ход " + index + " из " + (replayPositions.length - 1);
}
function choosePromotion(color) {
    return new Promise(resolve => {
        pendingPromotion = resolve;
        promotionModal.classList.remove("hidden");
        promotionModal.dataset.color = color;
    });
}
document.querySelectorAll("[data-promotion]").forEach(button => {
    button.addEventListener("click", () => {
        promotionModal.classList.add("hidden");
        if (pendingPromotion) pendingPromotion(button.dataset.promotion);
        pendingPromotion = null;
    });
});
function applyTheme(theme) {
    document.body.dataset.boardTheme = theme;
}
if (themeSelect) themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));
if (modeSelect) modeSelect.addEventListener("change", () => {
    gameMode = modeSelect.value;
    if (modeLabel) modeLabel.textContent = gameMode === "local" ? "Два игрока на одном устройстве" : "Против бота";
    if (difficultySelect) difficultySelect.disabled = gameMode === "local";
    if (sideSelect) sideSelect.disabled = gameMode === "local";
    newGame();
});
if (editBtn) editBtn.addEventListener("click", () => {
    editorMode = !editorMode;
    editBtn.classList.toggle("active-tool", editorMode);
    statusBox.textContent = editorMode ? "Редактор включён: выбери фигуру и нажми на клетку. Для выхода нажми «Редактор»." : "Редактор выключен.";
});
if (backBtn) backBtn.addEventListener("click", () => setReplayPosition(replayIndex - 1));
if (forwardBtn) forwardBtn.addEventListener("click", () => setReplayPosition(replayIndex + 1));
const clearArrowsBtn = document.getElementById("clearArrowsBtn");
if (clearArrowsBtn) clearArrowsBtn.addEventListener("click", () => { drawnArrows = []; drawArrowOverlay(); });
function drawArrowOverlay() {
    let svg = document.getElementById("arrowOverlay");
    if (!svg) {
        svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
        svg.id = "arrowOverlay"; svg.setAttribute("viewBox","0 0 800 800");
        svg.setAttribute("preserveAspectRatio","none");
        document.querySelector(".board-wrapper").appendChild(svg);
    }
    svg.innerHTML = drawnArrows.map(a => {
        const x1=(a.from.charCodeAt(0)-97)*100+50, y1=(8-Number(a.from[1]))*100+50;
        const x2=(a.to.charCodeAt(0)-97)*100+50, y2=(8-Number(a.to[1]))*100+50;
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#f2c94c" stroke-width="13" stroke-linecap="round" opacity=".85" marker-end="url(#arrowHead)"/>`;
    }).join("");
    svg.insertAdjacentHTML("afterbegin",'<defs><marker id="arrowHead" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#f2c94c"/></marker></defs>');
}
function squareAtPoint(x,y) {
    const el = document.elementFromPoint(x,y);
    const cell = el && el.closest ? el.closest(".square") : null;
    return cell ? cell.dataset.square : null;
}
let editorPainting = false;
let lastEditorPaintSquare = null;
function paintEditorSquare(square) {
    if (!editorMode || !square || square === lastEditorPaintSquare) return;
    lastEditorPaintSquare = square;
    const choice = editorChoice;
    if (choice === "remove") game.remove(square);
    else game.put({ type: choice[1].toLowerCase(), color: choice[0] }, square);
    rememberPosition();
    renderBoard();
}
board.addEventListener("pointerdown", e => {
    if (!editorMode || e.button !== 0) return;
    const cell = e.target.closest(".square");
    if (!cell) return;
    editorPainting = true;
    lastEditorPaintSquare = null;
    paintEditorSquare(cell.dataset.square);
});
// Track the pointer on document: renderBoard replaces square elements while painting.
document.addEventListener("pointermove", e => {
    if (!editorPainting || !editorMode || !(e.buttons & 1)) return;
    const square = squareAtPoint(e.clientX, e.clientY);
    if (square) paintEditorSquare(square);
});
document.addEventListener("pointerup", () => { editorPainting = false; lastEditorPaintSquare = null; });

const boardWrapper = document.querySelector(".board-wrapper");
if (boardWrapper) {
    boardWrapper.addEventListener("contextmenu", e => e.preventDefault());
    boardWrapper.addEventListener("pointerdown", e => {
        if (e.button !== 2) return;
        arrowStart = squareAtPoint(e.clientX,e.clientY);
    });
    boardWrapper.addEventListener("pointerup", e => {
        if (!arrowStart) return;
        const end = squareAtPoint(e.clientX,e.clientY);
        if (end && end !== arrowStart) { drawnArrows.push({from:arrowStart,to:end}); drawArrowOverlay(); }
        arrowStart = null;
    });
}


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
    "1200": { name: "Продвинутый", depth: 3, randomTop: 1, mistakeChance: 0.00, elo: 1200, time: 1800 },
    "1300": { name: "Сильный · Stockfish", depth: 4, randomTop: 1, mistakeChance: 0.00, elo: 1300, time: 3500 }
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
    // В локальной игре нижняя сторона принадлежит игроку, чей сейчас ход.
    // В редакторе ориентация не должна самопроизвольно переключаться.
    if (gameMode === "local" && !editorMode) flipped = game.turn() === "b";
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
    if (replaying) return;
    if (editorMode) {
        const choice = editorChoice;
        if (choice === "remove") game.remove(square);
        else game.put({type: choice[1].toLowerCase(), color: choice[0]}, square);
        rememberPosition(); renderBoard(); updateHistory(); return;
    }
    if (game.game_over() || botThinking ||
        (gameMode === "bot" && game.turn() !== playerColor)) {
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

    const selectableColor = gameMode === "local" ? game.turn() : playerColor;
    if (piece && piece.color === selectableColor) {
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
    const modal = document.getElementById("resultModal");
    const summary = document.getElementById("resultSummary");
    statsBox.innerHTML = `
      <div class="stats-grid">
        <div class="stat-item"><strong>${game.history().length}</strong><span>Всего ходов</span></div>
        <div class="stat-item good"><strong>${counts["Хороший"]}</strong><span>Хороших</span></div>
        <div class="stat-item blunder"><strong>${counts["Зевок"]}</strong><span>Зевков</span></div>
        <div class="stat-item brilliant"><strong>${counts["Бриллиантовый"]}</strong><span>Бриллиантовых</span></div>
      </div>
      <div class="stats-note">Классификация ходов приблизительная и пока не является полноценной оценкой Stockfish.</div>`;
    statsBox.classList.toggle("final-stats", final);
    if (final && modal) {
        let result = "Партия завершена";
        if (game.in_checkmate()) {
            result = gameMode === "local"
                ? (game.turn() === "w" ? "Победили чёрные! Мат." : "Победили белые! Мат.")
                : (game.turn() === playerColor ? "Победил бот! Мат." : "Ты победил! Мат.");
        } else if (game.in_stalemate()) result = "Ничья — пат.";
        else if (game.in_draw()) result = "Ничья.";
        if (summary) summary.textContent = result;
        modal.classList.remove("hidden");
    } else if (modal) {
        modal.classList.add("hidden");
    }
}

async function makePlayerMove(move) {
    try {
        let promotion = "q";
        const movingColor = game.turn();
        if (move.promotion) promotion = await choosePromotion(movingColor);
        const result = game.move({
            from: move.from,
            to: move.to,
            promotion
        });

        if (!result) return;
        if (puzzleMode && result.san !== "Qg7#") {
            game.undo();
            statusBox.textContent = "Не совсем! Попробуй найти матующий ход.";
            selected = null; legalMoves = []; renderBoard();
            return;
        }

        lastMove = result;
        replaying = false; rememberPosition();
        gradePlayerMove(result);
        selected = null;
        legalMoves = [];

        renderBoard();
        updateGame();
        if (puzzleMode && game.in_checkmate()) statusBox.textContent = "🏆 Верно! Это мат. Задача решена!";

        if (!game.game_over() && gameMode === "bot") {
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
    // Если Stockfish недоступен, не запускаем глубокий поиск в главном потоке.
    // Иначе браузер зависает, особенно на телефонах и на уровне 2800.
    const fallbackDepth = Number(botLevel) >= 1200 ? 2 : settings.depth;

    for (const move of moves) {
        game.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
        const score = minimax(fallbackDepth - 1, -Infinity, Infinity, botColor, 1);
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
let stockfishInitPromise = null;
let resolveStockfishInit = null;
const STOCKFISH_JS = "./stockfish-17.1-lite-single-03e3232.js";
// JS и соответствующий WASM лежат в одной папке пакета; Worker подхватывает WASM оттуда.
const STOCKFISH_URL = STOCKFISH_JS;

function finishStockfishInit(ok) {
    if (resolveStockfishInit) {
        const resolve = resolveStockfishInit;
        resolveStockfishInit = null;
        resolve(ok);
    }
}

function startStockfish() {
    if (stockfishWorker) return;
    stockfishInitPromise = new Promise(resolve => { resolveStockfishInit = resolve; });
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
                finishStockfishInit(true);
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
            finishStockfishInit(false);
            if (stockfishPending) {
                const pending = stockfishPending;
                stockfishPending = null;
                clearTimeout(pending.timer);
                pending.resolve(null);
            }
        };
        stockfishWorker.postMessage("uci");
        stockfishInitTimer = setTimeout(() => {
            if (!stockfishReady) {
                try { stockfishWorker.terminate(); } catch (_) {}
                stockfishWorker = null;
                stockfishReady = false;
                finishStockfishInit(false);
                if (stockfishPending) {
                    const pending = stockfishPending;
                    stockfishPending = null;
                    clearTimeout(pending.timer);
                    pending.resolve(null);
                }
            }
        }, 12000);
    } catch (error) {
        stockfishWorker = null;
        stockfishReady = false;
        finishStockfishInit(false);
    }
}

async function stockfishMove() {
    // Если игрок сделал первый ход раньше завершения загрузки движка,
    // ждём готовности вместо немедленного перехода к слабому запасному боту.
    if (!stockfishWorker) return null;
    if (!stockfishReady && stockfishInitPromise) {
        const ready = await stockfishInitPromise;
        if (!ready) return null;
    }
    if (!stockfishWorker || !stockfishReady || stockfishPending) return null;

    return new Promise(resolve => {
        const settings = difficultySettings[botLevel] || difficultySettings["800"];
        const elo = settings.elo;
        try {
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
                }, settings.time + 5000)
            };
            stockfishWorker.postMessage("go movetime " + settings.time);
        } catch (error) {
            if (stockfishPending) {
                clearTimeout(stockfishPending.timer);
                stockfishPending = null;
            }
            resolve(null);
        }
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
        try {
            // На сильных уровнях сначала используем настоящий шахматный движок в Worker.
            if (Number(botLevel) >= 1200) {
                const uci = await stockfishMove();
                if (thisGame !== gameGeneration) return;
                if (uci) result = applyUciMove(uci);
            }
            // Если движок не загрузился, используется облегчённый поиск без зависания вкладки.
            if (!result && Number(botLevel) >= 1200) {
                statusBox.textContent = "Stockfish не загрузился. Проверь, что JS и WASM движка лежат рядом с index.html.";
                console.error("Stockfish unavailable: refusing to pretend this is a strong level.");
            } else if (!result) {
                const move = chooseBotMove();
                if (move) result = game.move({
                    from: move.from,
                    to: move.to,
                    promotion: move.promotion || "q"
                });
            }
        } catch (error) {
            console.error("Bot move error:", error);
        }

        if (thisGame !== gameGeneration) return;
        if (result) { lastMove = result; rememberPosition(); }
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
        statusBox.textContent = gameMode === "local"
            ? (game.turn() === "w" ? "🏆 Мат! Победили чёрные!" : "🏆 Мат! Победили белые!")
            : (game.turn() === playerColor ? "☠ Мат! Победил бот!" : "🏆 Мат! Ты победил!");
    } else if (game.in_stalemate()) {
        statusBox.textContent = "Ничья: пат.";
    } else if (game.in_draw()) {
        statusBox.textContent = "Ничья! Игра окончена.";
    } else if (game.in_check()) {
        statusBox.textContent = "⚠ Шах!";
    } else {
        statusBox.textContent = gameMode === "local"
            ? (game.turn() === "w" ? "♙ Ход белых" : "♟ Ход чёрных")
            : (game.turn() === playerColor ? "♟ Твой ход!" : "🤖 Ход бота...");
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
    replayPositions = [game.fen()]; replayIndex = 0; replaying = false;
    drawnArrows = []; drawArrowOverlay();
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
    if (playerColor === "b" && gameMode === "bot") {
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
    if (gameMode === "bot" && game.turn() !== playerColor && game.history().length > 0) {
        game.undo();
    }
    if (moveGrades.length > 0) moveGrades.pop();
    replayPositions = [game.fen()]; replayIndex = 0; replaying = false;
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

// Главное меню и отдельные разделы
const mainMenu = document.getElementById("mainMenu");
const gameApp = document.getElementById("gameApp");
const puzzleHub = document.getElementById("puzzleHub");
const openingHub = document.getElementById("openingHub");
const puzzleBanner = document.getElementById("puzzleBanner");
function showScreen(screen) {
    mainMenu.classList.toggle("hidden", screen !== "menu");
    gameApp.classList.toggle("hidden", screen !== "game");
    puzzleHub.classList.toggle("hidden", screen !== "puzzles");
    openingHub.classList.toggle("hidden", screen !== "openings");
}
function enterGame(mode) {
    puzzleMode = false;
    if (puzzleBanner) puzzleBanner.classList.add("hidden");
    gameMode = mode;
    if (modeSelect) modeSelect.value = mode === "local" ? "local" : "bot";
    if (modeLabel) modeLabel.textContent = mode === "local" ? "Два игрока на одном устройстве" : "Против бота";
    if (difficultySelect) difficultySelect.disabled = mode === "local";
    if (sideSelect) sideSelect.disabled = mode === "local";
    playerColor = sideSelect ? sideSelect.value : "w";
    showScreen("game");
    newGame();
}
document.querySelectorAll("[data-menu]").forEach(button => button.addEventListener("click", () => {
    const target = button.dataset.menu;
    if (target === "bot") return enterGame("bot");
    if (target === "friend") return enterGame("local");
    if (target === "puzzles") { showScreen("puzzles"); return; }
    if (target === "openings") { showScreen("openings"); return; }
    if (target === "editor") { enterGame("local"); editorMode = true; if (editBtn) editBtn.classList.add("active-tool"); statusBox.textContent = "Редактор включён: выбери фигуру и нажимай или проводи мышью по клеткам."; return; }
    if (target === "settings") { enterGame("bot"); document.getElementById("theme").scrollIntoView({behavior:"smooth",block:"center"}); }
}));
document.getElementById("homeBtn").addEventListener("click", () => { puzzleMode = false; editorMode = false; showScreen("menu"); });
document.querySelectorAll(".back-home").forEach(button => button.addEventListener("click", () => showScreen("menu")));
document.querySelectorAll("[data-puzzle]").forEach(button => button.addEventListener("click", () => {
    if (button.dataset.puzzle !== "mate1") return;
    puzzleMode = true; gameMode = "puzzle"; playerColor = "w"; flipped = false;
    game.load("7k/8/5KQ1/8/8/8/8/8 w - - 0 1");
    replayPositions = [game.fen()]; replayIndex = 0; replaying = false;
    selected = null; legalMoves = []; lastMove = null; drawnArrows = []; moveGrades = [];
    showScreen("game");
    if (puzzleBanner) puzzleBanner.classList.remove("hidden");
    document.getElementById("puzzleTitle").textContent = "Мат в 1 ход";
    document.getElementById("puzzleHint").textContent = "Белые ходят. Найди Qg7#";
    statusBox.textContent = "Найди мат одним ходом.";
    renderBoard(); updateHistory(); renderGameStats(false);
}));
document.getElementById("puzzleBack").addEventListener("click", () => { puzzleMode = false; showScreen("puzzles"); });
document.querySelectorAll("[data-opening]").forEach(button => button.addEventListener("click", () => {
    enterGame("local"); game.reset();
    const sans = button.dataset.opening.split(/\s+/); let played = [];
    for (const san of sans) { const m = game.move(san); if (!m) break; played.push(m.san); }
    replayPositions = [new Chess().fen()];
    const temp = new Chess();
    for (const san of played) { temp.move(san); replayPositions.push(temp.fen()); }
    replayIndex = replayPositions.length - 1; replaying = true;
    selected = null; legalMoves = []; lastMove = game.history({verbose:true}).slice(-1)[0] || null;
    renderBoard(); updateHistory(); statusBox.textContent = "Дебют загружен: " + button.querySelector("b").textContent;
}));


// Окно итогов показывается только после завершения партии.
const resultModal = document.getElementById("resultModal");
const resultClose = document.getElementById("resultClose");
const resultNewGame = document.getElementById("resultNewGame");
const resultHome = document.getElementById("resultHome");
if (resultClose) resultClose.addEventListener("click", () => resultModal.classList.add("hidden"));
if (resultNewGame) resultNewGame.addEventListener("click", () => { resultModal.classList.add("hidden"); newGame(); });
if (resultHome) resultHome.addEventListener("click", () => { resultModal.classList.add("hidden"); puzzleMode = false; editorMode = false; showScreen("menu"); });

// Запуск движка и партии; посетитель сначала видит главное меню.
startStockfish();
newGame();
showScreen("menu");
