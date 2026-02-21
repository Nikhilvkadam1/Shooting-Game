const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
//  In-memory stores
// ─────────────────────────────────────────────
const sessions = {};
const leaderboard = [];

// ─────────────────────────────────────────────
//  Seed 5 fake leaderboard players
// ─────────────────────────────────────────────
const fakeNames = ['Ghost', 'NightOwl', 'ShadowX', 'IronSight', 'ViperOne'];
const fakeScores = [48500, 41200, 36800, 29100, 21600];
const fakeAccuracies = [94, 88, 82, 76, 71];
const fakeHeadshots = [38, 29, 24, 17, 12];
const fakeDiffs = ['hard', 'hard', 'medium', 'medium', 'easy'];

fakeNames.forEach((name, i) => {
  leaderboard.push({
    id: uuidv4(),
    playerName: name,
    score: fakeScores[i],
    accuracy: fakeAccuracies[i],
    headshots: fakeHeadshots[i],
    difficulty: fakeDiffs[i],
    savedAt: new Date(Date.now() - (i + 1) * 3600000).toISOString()
  });
});

// ─────────────────────────────────────────────
//  Scoring helpers
// ─────────────────────────────────────────────
const ZONE_BASE = { head: 1000, torso: 500, legs: 200 };
const DIFF_MULT = { easy: 1.0, medium: 1.5, hard: 2.5 };

function calculateShotScore({ hit, zone, distance, windOffset, antiGravityActive, targetSpeed, difficulty }) {
  if (!hit) return 0;

  const base = ZONE_BASE[zone] || 200;
  const distMult = Math.max(1.0, distance / 100);
  const windBonus = windOffset < 3 ? 1.2 : windOffset < 7 ? 1.0 : 0.85;
  const agBonus = antiGravityActive ? 1.5 : 1.0;
  const speedBonus = 1 + (targetSpeed / 10);
  const diffMult = DIFF_MULT[difficulty] || 1.0;

  const raw = Math.round(base * distMult * windBonus * agBonus * speedBonus * diffMult);
  return raw;
}

function getFeedback(zone, combo, antiGravityActive) {
  const headLines = ['🎯 HEADSHOT!', '💀 SKULL CRACKER!', '👁️ BETWEEN THE EYES!'];
  const torsoLines = ['🫁 TORSO SHOT!', '💥 CENTER MASS!', '🩸 BODY SHOT!'];
  const legLines = ['🦵 LEG SHOT!', '🎯 LOW HIT!', '💢 LIMB SHOT!'];

  let base;
  if (zone === 'head') base = headLines[Math.floor(Math.random() * headLines.length)];
  else if (zone === 'torso') base = torsoLines[Math.floor(Math.random() * torsoLines.length)];
  else base = legLines[Math.floor(Math.random() * legLines.length)];

  if (antiGravityActive) base += ' ⚡ ANTI-GRAV BONUS!';
  if (combo >= 5) base += ` 🔥 x${combo} COMBO!`;

  return base;
}

// ─────────────────────────────────────────────
//  Routes
// ─────────────────────────────────────────────

// POST /api/session/start
app.post('/api/session/start', (req, res) => {
  const { playerName, difficulty } = req.body;
  if (!playerName || !playerName.trim()) {
    return res.status(400).json({ error: 'playerName is required' });
  }

  const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'easy';
  const sessionId = uuidv4();
  sessions[sessionId] = {
    sessionId,
    playerName: playerName.trim(),
    difficulty: diff,
    totalScore: 0,
    shots: [],
    combo: 0,
    maxCombo: 0,
    startedAt: new Date().toISOString()
  };

  res.json({ sessionId, playerName: playerName.trim(), difficulty: diff });
});

// POST /api/session/:sessionId/shot
app.post('/api/session/:sessionId/shot', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions[sessionId];
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { hit, zone, distance, windOffset, antiGravityActive, targetSpeed } = req.body;

  // Combo tracking
  if (hit) {
    session.combo += 1;
    session.maxCombo = Math.max(session.maxCombo, session.combo);
  } else {
    session.combo = 0;
  }

  const comboMultiplier = Math.min(session.combo, 8);
  let shotScore = calculateShotScore({ hit, zone, distance, windOffset, antiGravityActive, targetSpeed, difficulty: session.difficulty });
  shotScore = Math.round(shotScore * (1 + (comboMultiplier - 1) * 0.1));

  session.totalScore += shotScore;

  const shotRecord = {
    hit,
    zone: zone || null,
    distance: distance || 0,
    windOffset: windOffset || 0,
    antiGravityActive: antiGravityActive || false,
    targetSpeed: targetSpeed || 0,
    shotScore,
    combo: session.combo,
    timestamp: new Date().toISOString()
  };
  session.shots.push(shotRecord);

  const feedback = hit ? getFeedback(zone, session.combo, antiGravityActive) : '💨 MISS! Wind got you?';

  res.json({
    shotScore,
    totalScore: session.totalScore,
    feedback,
    combo: session.combo
  });
});

// GET /api/leaderboard
app.get('/api/leaderboard', (req, res) => {
  const top10 = [...leaderboard]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  res.json(top10);
});

// POST /api/leaderboard/save
app.post('/api/leaderboard/save', (req, res) => {
  const { sessionId, playerName, score, accuracy, headshots, difficulty } = req.body;
  if (!playerName || score === undefined) {
    return res.status(400).json({ error: 'playerName and score required' });
  }

  const entry = {
    id: sessionId || uuidv4(),
    playerName,
    score,
    accuracy: accuracy || 0,
    headshots: headshots || 0,
    difficulty: difficulty || 'easy',
    savedAt: new Date().toISOString()
  };

  // Remove existing entry for same sessionId if present
  const existingIdx = leaderboard.findIndex(e => e.id === entry.id);
  if (existingIdx !== -1) {
    leaderboard.splice(existingIdx, 1);
  }
  leaderboard.push(entry);

  res.json({ success: true, entry });
});

// GET /api/session/:sessionId/stats
app.get('/api/session/:sessionId/stats', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions[sessionId];
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const shots = session.shots;
  const hits = shots.filter(s => s.hit);
  const misses = shots.length - hits.length;
  const accuracy = shots.length > 0 ? Math.round((hits.length / shots.length) * 100) : 0;
  const headshots = hits.filter(s => s.zone === 'head').length;
  const bestShot = hits.reduce((best, s) => s.shotScore > (best?.shotScore || 0) ? s : best, null);
  const longestKill = hits.reduce((max, s) => s.distance > (max?.distance || 0) ? s : max, null);

  res.json({
    sessionId,
    playerName: session.playerName,
    difficulty: session.difficulty,
    totalScore: session.totalScore,
    shots: shots.length,
    hits: hits.length,
    misses,
    accuracy,
    headshots,
    maxCombo: session.maxCombo,
    bestShotScore: bestShot ? bestShot.shotScore : 0,
    longestKillDistance: longestKill ? longestKill.distance : 0,
    startedAt: session.startedAt
  });
});

// ─────────────────────────────────────────────
//  Health check
// ─────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', game: 'Anti-Gravity Sniper' }));

// ─────────────────────────────────────────────
//  Start server
// ─────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎯 Sniper Game Server running on port ${PORT}`);
  console.log(`📋 Leaderboard seeded with ${leaderboard.length} players`);
  console.log(`\nAPI Endpoints:`);
  console.log(`  GET  /health`);
  console.log(`  POST /api/session/start`);
  console.log(`  POST /api/session/:sessionId/shot`);
  console.log(`  GET  /api/leaderboard`);
  console.log(`  POST /api/leaderboard/save`);
  console.log(`  GET  /api/session/:sessionId/stats`);
});
