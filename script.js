

const $ = id => document.getElementById(id);

const KEY = 'funplay-v2-save';

const defaults = {
  name: 'Player',
  sound: true,
  total: 0,
  games: 0,
  levels: { fruit: 1, word: 1, memory: 1 },
  scores: [],
  history: []
};

let data;

try {
  data = {
    ...defaults,
    ...JSON.parse(localStorage.getItem(KEY) || '{}')
  };
  data.levels = { ...defaults.levels, ...(data.levels || {}) };
} catch {
  data = { ...defaults, levels: { ...defaults.levels } };
}

let current = 'fruit';
let deck = [];
let opened = [];
let matched = 0;
let moves = 0;
let roundPoints = 0;
let locked = false;
let target = '';
let picked = '';
let completed = false;
let audioCtx = null;

const fruits = [
  '🍎','🍌','🍇','🍓','🍊','🍉','🥝',
  '🍍','🍒','🥭','🍐','🍑','🫐','🥥'
];

const wordBank = [
  'APPLE','GRAPE','LEMON','MANGO','PEACH',
  'BERRY','MELON','PLUM','ORANGE','CHERRY',
  'BANANA','PAPAYA'
];

function save() {
  localStorage.setItem(KEY, JSON.stringify(data));
}

function sound(kind = 'tap') {
  if (!data.sound) return;

  try {
    audioCtx = audioCtx || new (
      window.AudioContext || window.webkitAudioContext
    )();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    const frequency = {
      win: 660,
      bad: 180,
      match: 520,
      tap: 360
    };

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency[kind], now);

    if (kind === 'win') {
      osc.frequency.exponentialRampToValueAtTime(990, now + .18);
    }

    gain.gain.setValueAtTime(.075, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + .2);

    osc.start(now);
    osc.stop(now + .21);
  } catch (error) {}
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function level(game) {
  return data.levels[game] || 1;
}

function xpLevel() {
  return Math.max(1, Math.floor(data.total / 100) + 1);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function render() {
  $('playerName').textContent = data.name;
  $('avatar').textContent = (data.name.trim()[0] || 'P').toUpperCase();

  $('totalPoints').textContent = data.total;
  $('highestLevel').textContent = Math.max(...Object.values(data.levels));
  $('gamesPlayed').textContent = data.games;

  ['fruit', 'word', 'memory'].forEach(game => {
    $(game + 'Level').textContent = 'Level ' + level(game);
  });

  const xp = data.total % 100;

  $('progressTitle').textContent = 'Level ' + xpLevel();
  $('progressText').textContent = xp + ' / 100 XP';
  $('progressBar').style.width = xp + '%';

  $('soundBtn').textContent = data.sound ? '🔊' : '🔇';

  const rows = [...data.scores]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  $('leaderboard').innerHTML = rows.length
    ? rows.map((row, index) => `
      <div class="leader-row">
        <span>${['🥇','🥈','🥉','4','5'][index]}</span>
        <span>${escapeHtml(row.name)}</span>
        <strong>${row.score} ⭐</strong>
      </div>
    `).join('')
    : '<p class="muted">Play a game to appear here.</p>';
}

function showGame(game) {
  current = game;
  $('homeView').style.display = 'none';
  $('gameView').classList.add('active');
  startGame();
}

function goHome() {
  $('gameView').classList.remove('active');
  $('homeView').style.display = 'block';
  render();
}

function startGame() {
  moves = 0;
  roundPoints = 0;
  matched = 0;
  opened = [];
  locked = false;
  completed = false;
  picked = '';

  $('movesStat').textContent = '0';
  $('roundStat').textContent = '0';
  $('levelStat').textContent = level(current);

  $('wordTarget').hidden = current !== 'word';
  $('wordProgress').hidden = current !== 'word';

  $('gameGrid').innerHTML = '';
  $('gameGrid').className = 'game-grid';
  $('gameMessage').textContent = 'Good luck!';

  const lv = level(current);

  if (current === 'fruit' || current === 'memory') {
    const pairCount = Math.min(6 + Math.floor((lv - 1) / 2), 10);
    const emojis = fruits.slice(0, pairCount);

    deck = shuffle([...emojis, ...emojis]);

    $('gameHeading').textContent =
      current === 'fruit' ? '🍎 Fruit Match' : '🧠 Memory Match';

    $('instructions').textContent =
      current === 'fruit'
        ? 'Flip two cards and find matching fruits.'
        : 'Remember the cards and match every pair.';

    const grid = $('gameGrid');

    grid.style.gridTemplateColumns =
      `repeat(${pairCount > 8 ? 5 : 4}, minmax(0, 1fr))`;

    deck.forEach((fruit, index) => {
      const button = document.createElement('button');
      button.className = 'tile';
      button.textContent = '?';

      button.addEventListener('click', () => flip(index, button));

      grid.appendChild(button);
    });

  } else {
    $('gameHeading').textContent = '🔤 Word Hunt';

    $('instructions').textContent =
      'Find the secret word by selecting its letters in the correct order.';

    target = wordBank[
      Math.min(
        wordBank.length - 1,
        Math.floor((lv - 1) / 2) +
        Math.floor(Math.random() * Math.min(3, Math.max(1, lv)))
      )
    ];

    $('wordTarget').textContent = '? ? ? ? ?';
    $('wordProgress').textContent = '0 / ' + target.length + ' letters found';

    const chars = shuffle([
      ...target,
      ...Array.from(
        { length: 25 - target.length },
        () => String.fromCharCode(65 + Math.floor(Math.random() * 26))
      )
    ]);

    const grid = $('gameGrid');
    grid.classList.add('word-grid');
    grid.style.gridTemplateColumns = 'repeat(5, minmax(0, 1fr))';

    chars.forEach((letter, index) => {
      const button = document.createElement('button');
      button.className = 'tile';
      button.textContent = letter;

      button.addEventListener('click', () =>
        pickWord(index, button, letter)
      );

      grid.appendChild(button);
    });
  }
}

function updateStats() {
  $('movesStat').textContent = moves;
  $('roundStat').textContent = roundPoints;
}

function flip(index, button) {
  if (locked || button.disabled || opened.some(item => item.i === index)) {
    return;
  }

  button.textContent = deck[index];
  button.classList.add('revealed');

  opened.push({ i: index, b: button });
  sound();

  if (opened.length === 2) {
    moves++;
    updateStats();
    locked = true;

    if (deck[opened[0].i] === deck[opened[1].i]) {
      opened.forEach(item => {
        item.b.classList.remove('revealed');
        item.b.classList.add('matched');
        item.b.disabled = true;
      });

      opened = [];
      matched++;
      roundPoints += 10;

      sound('match');
      updateStats();
      locked = false;

      $('gameMessage').textContent = '✨ Perfect match!';

      if (matched === deck.length / 2) {
        finish();
      }

    } else {
      const pair = [...opened];
      opened = [];

      $('gameMessage').textContent = 'Not a match — try again!';
      sound('bad');

      setTimeout(() => {
        pair.forEach(item => {
          item.b.textContent = '?';
          item.b.classList.remove('revealed');
        });

        locked = false;
      }, 750);
    }
  }
}

function pickWord(index, button, letter) {
  if (locked || button.disabled) return;

  if (letter === target[picked.length]) {
    picked += letter;
    button.classList.add('correct');
    button.disabled = true;

    roundPoints += 5;
    sound('match');

    $('wordTarget').textContent =
      picked.split('').join(' ') + ' ' +
      Array(target.length - picked.length).fill('_').join(' ');

    $('wordProgress').textContent =
      picked.length + ' / ' + target.length + ' letters found';

    $('gameMessage').textContent = 'Correct letter! Keep going.';
    updateStats();

    if (picked.length === target.length) {
      roundPoints += 20;
      moves++;
      updateStats();
      finish();
    }

  } else {
    moves++;
    updateStats();

    button.classList.add('wrong');
    sound('bad');

    $('gameMessage').textContent =
      'Try again! Look for: ' + target[picked.length];

    setTimeout(() => button.classList.remove('wrong'), 450);
  }
}

function finish() {
  if (completed) return;

  completed = true;
  locked = true;
  sound('win');

  const bonus = level(current) * 5;

  roundPoints += bonus;
  data.total += roundPoints;
  data.games++;
  data.levels[current] = level(current) + 1;

  const existing = data.scores.find(
    item => item.name.toLowerCase() === data.name.toLowerCase()
  );

  if (existing) {
    existing.score = Math.max(existing.score, data.total);
    existing.games = data.games;
  } else {
    data.scores.push({
      name: data.name,
      score: data.total,
      games: data.games
    });
  }

  data.history.push({
    game: current,
    points: roundPoints,
    at: Date.now()
  });

  save();
  render();

  $('resultTitle').textContent = '🎉 Level completed!';

  $('resultText').textContent =
    `Amazing work, ${data.name}! You earned ${roundPoints} points.`;

  $('resultModal').classList.add('show');
}

function closeResult() {
  $('resultModal').classList.remove('show');
}

$('nextLevel').addEventListener('click', () => {
  closeResult();
  startGame();
});

$('resultHome').addEventListener('click', () => {
  closeResult();
  goHome();
});

$('backBtn').addEventListener('click', goHome);
$('homeBtn').addEventListener('click', goHome);
$('newGameBtn').addEventListener('click', startGame);

document.querySelectorAll('[data-open]').forEach(card => {
  card.addEventListener('click', () => showGame(card.dataset.open));
});

$('soundBtn').addEventListener('click', () => {
  data.sound = !data.sound;
  save();
  render();

  if (data.sound) sound();
});

$('profileBtn').addEventListener('click', () => {
  $('nameInput').value = data.name;
  $('profileModal').classList.add('show');
  $('nameInput').focus();
});

$('cancelProfile').addEventListener('click', () => {
  $('profileModal').classList.remove('show');
});

$('saveProfile').addEventListener('click', () => {
  const name = $('nameInput').value.trim().slice(0, 18);

  if (!name) {
    $('nameInput').focus();
    return;
  }

  data.name = name;
  save();

  $('profileModal').classList.remove('show');
  render();
});

$('nameInput').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    $('saveProfile').click();
  }
});

$('resetBtn').addEventListener('click', () => {
  if (confirm('Reset all your points, levels and leaderboard data?')) {
    const name = data.name;
    const soundOn = data.sound;

    data = {
      ...defaults,
      name,
      sound: soundOn,
      levels: { ...defaults.levels },
      scores: [],
      history: []
    };

    save();
    render();
  }
});

render();

if (!localStorage.getItem(KEY)) {
  $('profileModal').classList.add('show');
}
