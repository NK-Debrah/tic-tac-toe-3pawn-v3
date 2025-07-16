const firebaseConfig = {
    apiKey: "AIzaSyBGbRWE0fq5WS7kKyqWJfWuUEFXpv2cDp4",
    authDomain: "tictactoe3pawn.firebaseapp.com",
    databaseURL: "https://tictactoe3pawn-default-rtdb.firebaseio.com/",
    projectId: "tictactoe3pawn",
    storageBucket: "tictactoe3pawn.firebasestorage.app",
    messagingSenderId: "436228130776",
    appId: "1:436228130776:web:5dc524e82528a62c6514ad",
    measurementId: "G-DZDTHY91RB"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Helper to ensure we always have a 9‑length array
function normalizeBoard(rawBoard) {
    if (Array.isArray(rawBoard) && rawBoard.length === 9) {
        return rawBoard;
    }
    const arr = Array(9).fill(null);
    if (rawBoard && typeof rawBoard === 'object') {
        Object.entries(rawBoard).forEach(([key, val]) => {
            const idx = Number(key);
            if (!isNaN(idx) && idx >= 0 && idx < 9) {
                arr[idx] = val;
            }
        });
    }
    return arr;
}

// Helper to convert Firebase objects to arrays
function toArray(val) {
    if (Array.isArray(val)) return val;
    if (val && typeof val === 'object') {
        return Object.keys(val).sort((a, b) => a - b).map(key => val[key]);
    }
    return [];
}

document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const boardElement     = document.getElementById('board');
    const statusElement    = document.getElementById('status');
    const resetBtn         = document.getElementById('resetBtn');
    const newGameBtn       = document.getElementById('newGameBtn');
    const createBtn        = document.getElementById('createBtn');
    const joinBtn          = document.getElementById('joinBtn');
    const copyBtn          = document.getElementById('copyBtn');
    const gameIdInput      = document.getElementById('gameIdInput');
    const playerListElement= document.getElementById('playerList');
    const notification     = document.getElementById('notification');
    const notificationText = document.getElementById('notificationText');
    const connectionStatus = document.getElementById('connectionStatus');

    // Game state
    let board = Array(9).fill(null);
    let currentPlayer = 'X';
    let gameActive = false;
    let playerRole = null; // 'X' or 'O' for online play
    let gameId = null;
    let xMoves = [];
    let oMoves = [];
    let players = {};
    let gameRef = null;

    // Show notification
    function showNotification(message, type = 'info') {
        notificationText.textContent = message;
        notification.className = 'notification ' + type;
        notification.classList.add('show');
        setTimeout(() => notification.classList.remove('show'), 3000);
    }

    // Update player list display
    function updatePlayerList() {
        playerListElement.innerHTML = '';
        Object.values(players).forEach(p => {
            const playerTag = document.createElement('div');
            playerTag.className = 'player-tag';
            playerTag.innerHTML = `
                <i class="fas fa-user"></i>
                <span>${p.name || 'Player'}</span>
                <span class="player-icon ${p.role.toLowerCase()}">${p.role}</span>
            `;
            playerListElement.appendChild(playerTag);
        });
    }

    // Initialize the board UI & click handlers
    function initializeBoard() {
        boardElement.innerHTML = '';
        for (let i = 0; i < 9; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.index = i;
            cell.addEventListener('click', () => handleCellClick(i));
            boardElement.appendChild(cell);
        }
    }

    // Update the game display based on current state
    function updateGameDisplay() {
        // Update player status
        const xPlayerOnline = Object.values(players).some(p => p.role === 'X');
        const oPlayerOnline = Object.values(players).some(p => p.role === 'O');
        document.getElementById('playerXStatus').textContent = xPlayerOnline ? 'Online' : 'Offline';
        document.getElementById('playerOStatus').textContent = oPlayerOnline ? 'Online' : 'Offline';
        
        // Update connection status
        const connectionDot = connectionStatus.querySelector('.connection-dot');
        const connectionText = connectionStatus.querySelector('span');
        
        if (xPlayerOnline && oPlayerOnline) {
            connectionDot.className = 'connection-dot connected';
            connectionText.textContent = 'Connected';
        } else {
            connectionDot.className = 'connection-dot disconnected';
            connectionText.textContent = 'Waiting for opponent...';
        }

        // Board
        board.forEach((value, idx) => {
            const cell = boardElement.querySelector(`.cell[data-index="${idx}"]`);
            cell.className = 'cell';
            if (value === 'X') cell.classList.add('x');
            if (value === 'O') cell.classList.add('o');
        });

        // Clear removal indicators
        document.querySelectorAll('.cell.next-to-remove').forEach(cell => {
            cell.classList.remove('next-to-remove');
        });

        // Show removal indicator on board
        if (gameActive) {
            let pawnToRemove = null;
            if (currentPlayer === 'X' && xMoves.length === 3) {
                pawnToRemove = xMoves[0];
            } else if (currentPlayer === 'O' && oMoves.length === 3) {
                pawnToRemove = oMoves[0];
            }

            if (pawnToRemove !== null) {
                const cell = boardElement.querySelector(`.cell[data-index="${pawnToRemove}"]`);
                if (cell) {
                    cell.classList.add('next-to-remove');
                }
            }
        }

        // Pawns
        const xPawns = document.querySelector('#playerXSection .player-pawns');
        const oPawns = document.querySelector('#playerOSection .player-pawns');
        xPawns.innerHTML = ''; 
        oPawns.innerHTML = '';
        
        for (let i = 0; i < 3; i++) {
            // Player X pawns
            const xp = document.createElement('div'); 
            xp.className = 'pawn-counter';
            if (i < xMoves.length) {
                xp.textContent = 'X';
            }
            xPawns.appendChild(xp);

            // Player O pawns
            const op = document.createElement('div'); 
            op.className = 'pawn-counter';
            if (i < oMoves.length) {
                op.textContent = 'O';
            }
            oPawns.appendChild(op);
        }

        // Move history
        document.getElementById('xMoves').textContent = xMoves.length ? 'Moves: ' + xMoves.join(', ') : 'No moves yet';
        document.getElementById('oMoves').textContent = oMoves.length ? 'Moves: ' + oMoves.join(', ') : 'No moves yet';

        // Status
        statusElement.textContent = gameActive
            ? `Player ${currentPlayer}'s turn`
            : (players && Object.values(players).length ? statusElement.textContent : 'Create or join a game to start');
    }

    // Highlight winning cells
    function highlightWinningCells() {
        const winPatterns = [
            [0,1,2],[3,4,5],[6,7,8],
            [0,3,6],[1,4,7],[2,5,8],
            [0,4,8],[2,4,6]
        ];
        for (let [a,b,c] of winPatterns) {
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                [a,b,c].forEach(i =>
                    boardElement.querySelector(`.cell[data-index="${i}"]`)
                                .classList.add('winning-cell')
                );
                return;
            }
        }
    }

    // Check for win
    function checkWin(player, board) {
        const patterns = [
            [0,1,2],[3,4,5],[6,7,8],
            [0,3,6],[1,4,7],[2,5,8],
            [0,4,8],[2,4,6]
        ];
        return patterns.some(([a,b,c]) =>
            board[a] === player && board[b] === player && board[c] === player
        );
    }

    // Check if board is full
    function isBoardFull(board) {
        return board.every(cell => cell !== null);
    }

    // Create a new game
    function createGame() {
        gameId = Math.random().toString(36).substr(2,6).toUpperCase();
        playerRole = 'X';
        statusElement.textContent = 'Share game ID: ' + gameId;
        gameActive = true;

        gameRef = database.ref(`games/${gameId}`);
        const playerId = generatePlayerId();

        gameRef.set({
            board: Array(9).fill(null),
            currentPlayer: 'X',
            players: { [playerId]: { role:'X', name:'Player X', id:playerId } },
            xMoves: [], oMoves: [],
            gameActive: true,
            winner: null
        }).catch(err => showNotification('Failed to create: '+err.message,'error'));

        gameRef.on('value', snapshot => {
            const gd = snapshot.val();
            if (!gd) { showNotification('Game not found','error'); return; }

            board         = normalizeBoard(gd.board);
            currentPlayer = gd.currentPlayer || 'X';
            players       = gd.players   || {};
            xMoves        = toArray(gd.xMoves || []);
            oMoves        = toArray(gd.oMoves || []);
            gameActive    = gd.gameActive !== false;

            updateGameDisplay();
            if (gd.winner) {
                if (gd.winner === 'draw') statusElement.textContent = 'Draw!';
                else {
                    statusElement.textContent = `Player ${gd.winner} wins!`;
                    highlightWinningCells();
                }
                gameActive = false;
            }

            updatePlayerList();
        });

        showNotification('Game created! ID: '+gameId,'success');
    }

    // Join an existing game
    function joinGame() {
        const joinId = gameIdInput.value.trim();
        if (!joinId) return showNotification('Enter game ID','error');

        gameId = joinId; playerRole = 'O';
        gameRef = database.ref(`games/${gameId}`);

        gameRef.once('value').then(snapshot => {
            if (!snapshot.exists()) return showNotification('Game not found','error');
            const gd = snapshot.val();
            if (Object.values(gd.players||{}).some(p=>p.role==='O'))
                return showNotification('Game full','error');

            const playerId = generatePlayerId();
            gameRef.child('players').update({ [playerId]: { role:'O', name:'Player O', id:playerId } });

            // initialize local state
            board         = normalizeBoard(gd.board);
            currentPlayer = gd.currentPlayer||'X';
            xMoves        = toArray(gd.xMoves || []);
            oMoves        = toArray(gd.oMoves || []);
            gameActive    = true;

            gameRef.on('value', snap => {
                const g = snap.val();
                if (!g) return showNotification('Game data missing','error');

                board         = normalizeBoard(g.board);
                currentPlayer = g.currentPlayer||'X';
                players       = g.players||{};
                xMoves        = toArray(g.xMoves || []);
                oMoves        = toArray(g.oMoves || []);
                gameActive    = g.gameActive!==false;

                updateGameDisplay();
                if (g.winner) {
                    if (g.winner==='draw') statusElement.textContent='Draw!';
                    else {
                        statusElement.textContent=`Player ${g.winner} wins!`;
                        highlightWinningCells();
                    }
                    gameActive = false;
                }

                updatePlayerList();
            });

            statusElement.textContent = "Player X's turn";
            showNotification('Joined game','success');
        }).catch(err => showNotification('Join failed: '+err.message,'error'));
    }

    // Handle cell click
    async function handleCellClick(index) {
        if (!gameActive) return showNotification('Game not active','error');
        try {
            const result = await gameRef.transaction(snapshot => {
                if (!snapshot) return;  // no game
                const gd = snapshot;
                // normalize move lists & cap at 3
                let xArr = toArray(gd.xMoves||[]).slice(-3),
                    oArr = toArray(gd.oMoves||[]).slice(-3);
                // rebuild board from moves
                const tmpBoard = Array(9).fill(null);
                xArr.forEach(i=> tmpBoard[i]='X');
                oArr.forEach(i=> tmpBoard[i]='O');

                // abort if game over or not your turn
                if (!gd.gameActive || gd.winner || playerRole !== gd.currentPlayer) {
                    return;
                }
                // abort if clicking on opponent pawn
                if (tmpBoard[index] !== null && tmpBoard[index] !== gd.currentPlayer) {
                    return;
                }

                // perform removal if at cap
                if (gd.currentPlayer === 'X') {
                    if (xArr.length === 3) xArr.shift();
                    xArr.push(index);
                } else {
                    if (oArr.length === 3) oArr.shift();
                    oArr.push(index);
                }

                // rebuild board again
                const newBoard = Array(9).fill(null);
                xArr.forEach(i=> newBoard[i]='X');
                oArr.forEach(i=> tmpBoard[i]='O');

                // write back
                gd.board = newBoard;
                gd.xMoves = xArr;
                gd.oMoves = oArr;

                // check win/draw
                const cp = gd.currentPlayer;
                const won = checkWin(cp, newBoard);
                if (won) {
                    gd.winner = cp;
                    gd.gameActive = false;
                } else if (isBoardFull(newBoard)) {
                    gd.winner = 'draw';
                    gd.gameActive = false;
                } else {
                    gd.currentPlayer = cp==='X'?'O':'X';
                }
                return gd;
            });

            if (result && !result.committed) {
                showNotification('Invalid move','error');
            }
        } catch (err) {
            console.error(err);
            showNotification('Error making move','error');
        }
    }

    // Reset the game
    function resetGame() {
        if (!gameRef) return showNotification('No game to reset','error');
        
        // Optimistically reset local state
        board = Array(9).fill(null);
        currentPlayer = 'X';
        xMoves = [];
        oMoves = [];
        gameActive = true;
        
        // Update display immediately
        updateGameDisplay();
        
        // Clear any winning highlights
        document.querySelectorAll('.winning-cell').forEach(cell => {
            cell.classList.remove('winning-cell');
        });
        
        // Push to Firebase
        gameRef.set({
            board: board,
            currentPlayer: currentPlayer,
            players: players,
            xMoves: xMoves,
            oMoves: oMoves,
            gameActive: true,
            winner: null
        }).then(() => showNotification('Game reset','success'))
          .catch(err => showNotification('Reset failed: '+err.message,'error'));
    }

    // Start a brand new game session
    function newGame() {
        if (gameRef) {
            gameRef.off();
            gameRef.remove().catch(() => {});
        }
        // clear local
        board = Array(9).fill(null);
        currentPlayer = 'X';
        gameActive = false;
        playerRole = null;
        gameId = null;
        xMoves = [];
        oMoves = [];
        players = {};
        gameRef = null;

        // UI reset
        statusElement.textContent = 'Create or join a game to start';
        connectionStatus.querySelector('.connection-dot').className = 'connection-dot disconnected';
        connectionStatus.querySelector('span').textContent = 'Connecting...';
        playerListElement.innerHTML = '';
        document.getElementById('playerXStatus').textContent = 'Offline';
        document.getElementById('playerOStatus').textContent = 'Offline';
        document.querySelectorAll('.cell').forEach(c => {
            c.className = 'cell';
            c.classList.remove('winning-cell');
        });
        document.querySelectorAll('.pawn-counter').forEach(pc => pc.textContent = '');

        createGame();
    }

    // Copy game ID
    function copyGameId() {
        if (!gameId) return showNotification('No game ID','error');
        navigator.clipboard.writeText(gameId)
            .then(() => showNotification('Copied!','success'))
            .catch(() => showNotification('Copy failed','error'));
    }

    // Generate a simple player ID
    function generatePlayerId() {
        return 'player_' + Math.random().toString(36).substr(2,9);
    }

    // Event listeners
    resetBtn.addEventListener('click', resetGame);
    newGameBtn.addEventListener('click', newGame);
    createBtn.addEventListener('click', createGame);
    joinBtn.addEventListener('click', joinGame);
    copyBtn.addEventListener('click', copyGameId);

    // Initialize
    initializeBoard();
});
