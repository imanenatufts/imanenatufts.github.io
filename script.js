/* ==========================================================================
   Wordle (Project 2) — script.js
   - No external libraries. Works on GitHub Pages / any static host.
   - Requirements satisfied:
     * array (WORD_LIST)
     * arrow function(s)
     * event handlers (click + keydown)
     * .forEach and .map
     * JavaScript class (WordleGame)
     * used letter board with visual indicators
   ========================================================================== */

(() => {
  "use strict";

  // ---------- DOM helpers (arrow function requirement) ----------
  const $ = (sel) => document.querySelector(sel);

  // ---------- Dictionary (array requirement; at least 30 five-letter words) ----------
  const WORD_LIST = [
    "PRIDE","CRANE","SLATE","TRACE","SHARE","SHEEN","GLASS","SWEET","BRAVE",
    "STONE","CLOUD","NURSE","FROST","PLANT","GRAPE","LIGHT","MUSIC","QUIET",
    "ROBIN","WATER","SPOON","HOUSE","PAPER","SMILE","BRAIN","CHESS","WORLD",
    "NINJA","ZEBRA","MANGO","SUSHI","RIVER","FAITH","SOUND","TRAIN","CROWN",
    "DREAM","BLOOM","CIDER","CANDY","BERRY","LEMON","PEACH","HONEY","SPICE",
    "LUNCH","DINER","BREAD","RANCH","BASIL","CHILI","EAGLE","OTTER","PANDA"
  ].filter(w => w.length === 5).map(w => w.toUpperCase());

  // Keyboard layout for the "used letters" board
  const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

  // Status priority (so we don't downgrade a letter later)
  const STATUS_RANK = { absent: 0, present: 1, correct: 2 };

  const getCookie = (name) => {
    const match = document.cookie.match(new RegExp("(^|; )" + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, "\\$1") + "=([^;]*)"));
    return match ? decodeURIComponent(match[2]) : "";
  };

  const setCookie = (name, value, days = 365) => {
    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
  };

  const loadStats = () => {
    try {
      const raw = getCookie("wordle_stats_v1");
      if (!raw) return { games: 0, wins: 0, losses: 0, totalGuessesInWins: 0 };
      const parsed = JSON.parse(raw);
      return {
        games: Number(parsed.games) || 0,
        wins: Number(parsed.wins) || 0,
        losses: Number(parsed.losses) || 0,
        totalGuessesInWins: Number(parsed.totalGuessesInWins) || 0
      };
    } catch {
      return { games: 0, wins: 0, losses: 0, totalGuessesInWins: 0 };
    }
  };

  const saveStats = (stats) => setCookie("wordle_stats_v1", JSON.stringify(stats));

  // ---------- Core game class ----------
  class WordleGame {
    constructor({ wordList, boardEl, keyboardEl, statusEl, inputEl, submitBtn, restartBtn, apiCheckbox }) {
      this.wordList = wordList;
      this.boardEl = boardEl;
      this.keyboardEl = keyboardEl;
      this.statusEl = statusEl;
      this.inputEl = inputEl;
      this.submitBtn = submitBtn;
      this.restartBtn = restartBtn;
      this.apiCheckbox = apiCheckbox;

      this.maxGuesses = 6;
      this.wordLength = 5;

      this.tiles = [];       // 2D array of tile elements
      this.keyEls = {};      // letter => element
      this.usedLetters = {}; // letter => status
      this.stats = loadStats();

      this.buildBoard();
      this.buildKeyboard();
      this.reset();
    }

    // Build 6x5 board using .forEach and .map
    buildBoard() {
      this.boardEl.innerHTML = "";
      this.tiles = [];

      const rows = Array.from({ length: this.maxGuesses }, (_, r) => r);
      rows.forEach((r) => {
        const rowEl = document.createElement("div");
        rowEl.className = "row";
        const rowTiles = Array.from({ length: this.wordLength }, (_, c) => {
          const tile = document.createElement("div");
          tile.className = "tile";
          tile.setAttribute("data-row", String(r));
          tile.setAttribute("data-col", String(c));
          tile.setAttribute("aria-label", `Row ${r + 1} column ${c + 1}`);
          rowEl.appendChild(tile);
          return tile;
        });
        this.boardEl.appendChild(rowEl);
        this.tiles.push(rowTiles);
      });
    }

    buildKeyboard() {
      this.keyboardEl.innerHTML = "";
      this.keyEls = {};

      KEY_ROWS.forEach((rowText) => {
        const row = document.createElement("div");
        row.className = "keyRow";
        rowText.split("").forEach((ch) => {
          const key = document.createElement("div");
          key.className = "key";
          key.textContent = ch;
          key.setAttribute("data-letter", ch);
          this.keyEls[ch] = key;
          row.appendChild(key);
        });
        this.keyboardEl.appendChild(row);
      });
    }

    reset() {
      this.answer = this.pickAnswer();
      console.log("[Wordle] Answer:", this.answer); 

      this.currentRow = 0;
      this.gameOver = false;
      this.usedLetters = {};
      this.setStatus("New game started. Good luck!");

      // Clear board
      this.tiles.forEach((row) => row.forEach((tile) => {
        tile.textContent = "";
        tile.className = "tile";
      }));

      // Clear keyboard
      Object.values(this.keyEls).forEach((el) => { el.className = "key"; });

      // UI state
      this.restartBtn.hidden = true;
      this.inputEl.disabled = false;
      this.submitBtn.disabled = false;
      this.inputEl.value = "";
      this.inputEl.focus();

      this.renderStats();
    }

    pickAnswer() {
      const idx = Math.floor(Math.random() * this.wordList.length);
      return this.wordList[idx].toUpperCase();
    }

    setStatus(msg) {
      this.statusEl.textContent = msg;
    }

    renderStats() {
      const avgEl = $("#avgGuesses");
      const recordEl = $("#record");
      const { wins, losses, totalGuessesInWins } = this.stats;

      const avg = wins > 0 ? (totalGuessesInWins / wins) : 0;
      avgEl.textContent = `Avg guesses (wins): ${wins > 0 ? avg.toFixed(2) : "—"}`;
      recordEl.textContent = `W-L: ${wins}-${losses}`;
    }

    // Validate guess locally
    // Requirement only says guesses must be 5 letters, so by default we accept any A–Z word.
    isValidLocalWord(word) {
      return /^[A-Z]{5}$/.test(word);
    }

    async isValidWord(word) {
      if (!this.apiCheckbox.checked) return true;

      try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`, { cache: "no-store" });
        if (res.ok) return true;
        if (res.status === 404) return false;
        // unknown error -> allow, but warn
        this.setStatus("Could not validate via API (non-404). Proceeding with your guess.");
        return true;
      } catch {
        this.setStatus("Could not validate via API (network). Proceeding with your guess.");
        return true;
      }
    }

    // Duplicate-safe evaluation:
    // 1) mark greens first and decrement counts
    // 2) mark yellows using remaining counts
    evaluateGuess(guess) {
      const result = Array(this.wordLength).fill("absent");

      // letter counts in answer
      const counts = {};
      for (let i = 0; i < this.wordLength; i++) {
        const ch = this.answer[i];
        counts[ch] = (counts[ch] || 0) + 1;
      }

      // pass 1: correct positions
      for (let i = 0; i < this.wordLength; i++) {
        if (guess[i] === this.answer[i]) {
          result[i] = "correct";
          counts[guess[i]] -= 1;
        }
      }

      // pass 2: wrong position but in word
      for (let i = 0; i < this.wordLength; i++) {
        if (result[i] === "correct") continue;
        const ch = guess[i];
        if ((counts[ch] || 0) > 0) {
          result[i] = "present";
          counts[ch] -= 1;
        }
      }

      return result;
    }

    applyToBoard(row, guess, statuses) {
      for (let c = 0; c < this.wordLength; c++) {
        const tile = this.tiles[row][c];
        tile.textContent = guess[c];
        tile.classList.add("filled", statuses[c]);
      }
    }

    updateUsedLetters(guess, statuses) {
      statuses.forEach((status, i) => {
        const letter = guess[i];
        const prev = this.usedLetters[letter];
        if (!prev || STATUS_RANK[status] > STATUS_RANK[prev]) {
          this.usedLetters[letter] = status;
        }
      });

      Object.entries(this.usedLetters).forEach(([letter, status]) => {
        const el = this.keyEls[letter];
        if (!el) return;
        el.className = `key ${status}`;
      });
    }

    endGame(win) {
      this.gameOver = true;
      this.inputEl.disabled = true;
      this.submitBtn.disabled = true;
      this.restartBtn.hidden = false;

      if (win) {
        const guessesUsed = this.currentRow; // because we increment after applying
        this.setStatus(`You win in ${guessesUsed} guess${guessesUsed === 1 ? "" : "es"}!`);
        this.stats.games += 1;
        this.stats.wins += 1;
        this.stats.totalGuessesInWins += guessesUsed;
        saveStats(this.stats);
        this.renderStats();
      } else {
        this.setStatus("No more guesses. Game over!");
        this.stats.games += 1;
        this.stats.losses += 1;
        saveStats(this.stats);
        this.renderStats();

        // show answer word in a popup when lost
        alert(`Game over! The answer was: ${this.answer}`);
      }
    }

    async submitGuess(raw) {
      if (this.gameOver) return;

      const guess = raw.trim().toUpperCase();

      // Basic validation
      if (!/^[A-Z]{5}$/.test(guess)) {
        this.setStatus("Please enter exactly 5 letters (A–Z).");
        return;
      }

      const isValid = await this.isValidWord(guess);
      if (!isValid) {
        this.setStatus("That doesn't look like a valid word. Try another 5-letter word.");
        return;
      }

      // Apply guess
      const statuses = this.evaluateGuess(guess);
      this.applyToBoard(this.currentRow, guess, statuses);
      this.updateUsedLetters(guess, statuses);

      const win = statuses.every(s => s === "correct");
      this.currentRow += 1;
      this.inputEl.value = "";

      if (win) {
        this.endGame(true);
        return;
      }

      if (this.currentRow >= this.maxGuesses) {
        this.endGame(false);
        return;
      }

      this.setStatus(`Guess ${this.currentRow} of ${this.maxGuesses}.`);
      this.inputEl.focus();
    }
  }

  // ---------- Boot ----------
  const game = new WordleGame({
    wordList: WORD_LIST,
    boardEl: $("#board"),
    keyboardEl: $("#keyboard"),
    statusEl: $("#status"),
    inputEl: $("#guessInput"),
    submitBtn: $("#submitBtn"),
    restartBtn: $("#restartBtn"),
    apiCheckbox: $("#apiValidate"),
  });

  // button click and Enter key
  $("#submitBtn").addEventListener("click", () => game.submitGuess($("#guessInput").value));
  $("#restartBtn").addEventListener("click", () => game.reset());

  $("#guessInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      game.submitGuess($("#guessInput").value);
    }
  });

})();
