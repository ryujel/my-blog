(function () {
  'use strict';

  var SIZE = 4;
  var WIN_VALUE = 2048;
  var STORAGE_KEY = 'game-2048-best-score';
  var SWIPE_THRESHOLD = 20;

  var boardEl = document.getElementById('board');
  var boardWrapperEl = document.getElementById('board-wrapper');
  var scoreEl = document.getElementById('score');
  var bestEl = document.getElementById('best-score');
  var overlayEl = document.getElementById('overlay');
  var overlayMessageEl = document.getElementById('overlay-message');
  var overlayRestartBtn = document.getElementById('overlay-restart-btn');
  var overlayContinueBtn = document.getElementById('overlay-continue-btn');
  var newGameBtn = document.getElementById('new-game-btn');

  var board = [];
  var score = 0;
  var bestScore = 0;
  var isGameOver = false;
  var hasWon = false;
  var inputLocked = false;

  function createEmptyBoard() {
    var b = [];
    for (var r = 0; r < SIZE; r++) {
      b.push([0, 0, 0, 0]);
    }
    return b;
  }

  function cloneBoard(b) {
    return b.map(function (row) { return row.slice(); });
  }

  function boardsEqual(a, b) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (a[r][c] !== b[r][c]) return false;
      }
    }
    return true;
  }

  function boardHasValue(b, target) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (b[r][c] >= target) return true;
      }
    }
    return false;
  }

  function getEmptyCells(b) {
    var cells = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (b[r][c] === 0) cells.push([r, c]);
      }
    }
    return cells;
  }

  // Adds a random tile (90% -> 2, 10% -> 4) to an empty cell.
  // Returns the [row, col] of the placed tile, or null if the board is full.
  function addRandomTile(b) {
    var empties = getEmptyCells(b);
    if (empties.length === 0) return null;
    var pick = empties[Math.floor(Math.random() * empties.length)];
    b[pick[0]][pick[1]] = Math.random() < 0.9 ? 2 : 4;
    return pick;
  }

  // Slides a single row to the left, merging equal adjacent values.
  // A merged tile is never merged again in the same call.
  // e.g. [2,2,2,0] -> [4,2,0,0] (not [4,4,0,0])
  function slideRowLeft(row) {
    var values = row.filter(function (v) { return v !== 0; });
    var result = [];
    var mergedIndices = [];
    var gained = 0;
    var i = 0;
    while (i < values.length) {
      if (i + 1 < values.length && values[i] === values[i + 1]) {
        var mergedValue = values[i] * 2;
        result.push(mergedValue);
        mergedIndices.push(result.length - 1);
        gained += mergedValue;
        i += 2;
      } else {
        result.push(values[i]);
        i += 1;
      }
    }
    while (result.length < SIZE) result.push(0);
    return { row: result, score: gained, mergedIndices: mergedIndices };
  }

  function moveLeft(b) {
    var newBoard = [];
    var gained = 0;
    var merged = [];
    for (var r = 0; r < SIZE; r++) {
      var slid = slideRowLeft(b[r]);
      newBoard.push(slid.row);
      gained += slid.score;
      slid.mergedIndices.forEach(function (c) { merged.push([r, c]); });
    }
    return { board: newBoard, score: gained, merged: merged };
  }

  function moveRight(b) {
    var reversed = b.map(function (row) { return row.slice().reverse(); });
    var moved = moveLeft(reversed);
    var finalBoard = moved.board.map(function (row) { return row.slice().reverse(); });
    var finalMerged = moved.merged.map(function (pos) { return [pos[0], SIZE - 1 - pos[1]]; });
    return { board: finalBoard, score: moved.score, merged: finalMerged };
  }

  function transpose(b) {
    var t = createEmptyBoard();
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        t[c][r] = b[r][c];
      }
    }
    return t;
  }

  function moveUp(b) {
    var transposed = transpose(b);
    var moved = moveLeft(transposed);
    var finalBoard = transpose(moved.board);
    var finalMerged = moved.merged.map(function (pos) { return [pos[1], pos[0]]; });
    return { board: finalBoard, score: moved.score, merged: finalMerged };
  }

  function moveDown(b) {
    var transposed = transpose(b);
    var moved = moveRight(transposed);
    var finalBoard = transpose(moved.board);
    var finalMerged = moved.merged.map(function (pos) { return [pos[1], pos[0]]; });
    return { board: finalBoard, score: moved.score, merged: finalMerged };
  }

  function canMove(b) {
    if (getEmptyCells(b).length > 0) return true;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var v = b[r][c];
        if (c + 1 < SIZE && b[r][c + 1] === v) return true;
        if (r + 1 < SIZE && b[r + 1][c] === v) return true;
      }
    }
    return false;
  }

  function loadBestScore() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      return stored ? (parseInt(stored, 10) || 0) : 0;
    } catch (e) {
      return 0;
    }
  }

  function saveBestScore(value) {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch (e) {
      // localStorage unavailable (private mode, etc.) - ignore.
    }
  }

  function positionMatches(list, r, c) {
    if (!list) return false;
    for (var i = 0; i < list.length; i++) {
      if (list[i][0] === r && list[i][1] === c) return true;
    }
    return false;
  }

  function render(newTilePositions, mergedPositions) {
    var existingTiles = boardEl.querySelectorAll('.tile');
    existingTiles.forEach(function (el) { el.remove(); });

    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var value = board[r][c];
        if (value === 0) continue;

        var tile = document.createElement('div');
        var colorClass = value <= WIN_VALUE ? 'tile-' + value : 'tile-super';
        tile.className = 'tile ' + colorClass;
        tile.style.gridRowStart = String(r + 1);
        tile.style.gridColumnStart = String(c + 1);
        tile.textContent = String(value);

        var digitCount = String(value).length;
        if (digitCount >= 4) {
          tile.classList.add('digits-4');
        } else if (digitCount === 3) {
          tile.classList.add('digits-3');
        }

        if (positionMatches(newTilePositions, r, c)) {
          tile.classList.add('tile-new');
        }
        if (positionMatches(mergedPositions, r, c)) {
          tile.classList.add('tile-merged');
        }

        boardEl.appendChild(tile);
      }
    }

    scoreEl.textContent = String(score);
    bestEl.textContent = String(bestScore);
  }

  function showOverlay(message, showContinue) {
    overlayMessageEl.textContent = message;
    overlayEl.classList.remove('hidden');
    overlayContinueBtn.classList.toggle('hidden', !showContinue);
  }

  function hideOverlay() {
    overlayEl.classList.add('hidden');
  }

  function handleMove(moveFn) {
    if (isGameOver || inputLocked) return;

    var before = cloneBoard(board);
    var result = moveFn(board);
    var changed = !boardsEqual(before, result.board);
    if (!changed) return;

    board = result.board;
    score += result.score;
    if (score > bestScore) {
      bestScore = score;
      saveBestScore(bestScore);
    }

    var newTilePos = addRandomTile(board);
    render(newTilePos ? [newTilePos] : [], result.merged);

    if (!hasWon && boardHasValue(board, WIN_VALUE)) {
      hasWon = true;
      inputLocked = true;
      showOverlay('You Win!', true);
      return;
    }

    if (!canMove(board)) {
      isGameOver = true;
      showOverlay('Game Over!', false);
    }
  }

  function resetGame() {
    board = createEmptyBoard();
    score = 0;
    isGameOver = false;
    hasWon = false;
    inputLocked = false;
    hideOverlay();

    var first = addRandomTile(board);
    var second = addRandomTile(board);
    render([first, second].filter(Boolean), []);
  }

  var KEY_MOVES = {
    ArrowLeft: moveLeft,
    ArrowRight: moveRight,
    ArrowUp: moveUp,
    ArrowDown: moveDown
  };

  document.addEventListener('keydown', function (e) {
    var moveFn = KEY_MOVES[e.key];
    if (!moveFn) return;
    e.preventDefault();
    handleMove(moveFn);
  });

  // Touch swipe support for mobile.
  var touchStartX = 0;
  var touchStartY = 0;

  boardWrapperEl.addEventListener('touchstart', function (e) {
    var t = e.changedTouches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  }, { passive: true });

  boardWrapperEl.addEventListener('touchend', function (e) {
    var t = e.changedTouches[0];
    var dx = t.clientX - touchStartX;
    var dy = t.clientY - touchStartY;
    var absDx = Math.abs(dx);
    var absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) < SWIPE_THRESHOLD) return;

    if (absDx > absDy) {
      handleMove(dx > 0 ? moveRight : moveLeft);
    } else {
      handleMove(dy > 0 ? moveDown : moveUp);
    }
  }, { passive: true });

  newGameBtn.addEventListener('click', resetGame);
  overlayRestartBtn.addEventListener('click', resetGame);
  overlayContinueBtn.addEventListener('click', function () {
    inputLocked = false;
    hideOverlay();
  });

  bestScore = loadBestScore();
  resetGame();
})();
