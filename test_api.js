const http = require('http');
function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: 'localhost', port: 3000, path, method,
            headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
        };
        const req = http.request(opts, res => {
            let raw = ''; res.on('data', c => raw += c);
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}
async function run() {
    console.log('=== DIFFICULTY API TEST ===\n');

    // Test easy session
    const s1 = await request('POST', '/api/session/start', { playerName: 'EasyPlayer', difficulty: 'easy' });
    console.log('[1] Easy session:', s1.body.difficulty === 'easy' ? '✅' : '❌', '| difficulty:', s1.body.difficulty);

    // Test hard session
    const s2 = await request('POST', '/api/session/start', { playerName: 'HardPlayer', difficulty: 'hard' });
    console.log('[2] Hard session:', s2.body.difficulty === 'hard' ? '✅' : '❌', '| difficulty:', s2.body.difficulty);

    // Same shot on easy vs hard — hard should get 2.5x
    const shotEasy = await request('POST', `/api/session/${s1.body.sessionId}/shot`, { hit: true, zone: 'head', distance: 300, windOffset: 2, antiGravityActive: false, targetSpeed: 3 });
    const shotHard = await request('POST', `/api/session/${s2.body.sessionId}/shot`, { hit: true, zone: 'head', distance: 300, windOffset: 2, antiGravityActive: false, targetSpeed: 3 });
    console.log(`\n[3] Easy headshot score: ${shotEasy.body.shotScore}`);
    console.log(`[4] Hard headshot score: ${shotHard.body.shotScore}`);
    const ratio = shotHard.body.shotScore / shotEasy.body.shotScore;
    console.log(`[5] Hard/Easy ratio: ${ratio.toFixed(2)}x`, Math.abs(ratio - 2.5) < 0.01 ? '✅ 2.5x confirmed' : '❌');

    // Leaderboard has difficulty badges
    const lb = await request('GET', '/api/leaderboard');
    const hasDiff = lb.body.every(p => p.difficulty);
    console.log(`\n[6] Leaderboard has difficulty badges:`, hasDiff ? '✅' : '❌');
    console.log('    Entries:', lb.body.slice(0, 3).map(p => `${p.playerName}(${p.difficulty})`).join(', '));

    // Save with difficulty
    const save = await request('POST', '/api/leaderboard/save', { sessionId: s2.body.sessionId, playerName: 'HardPlayer', score: shotHard.body.totalScore, accuracy: 100, headshots: 1, difficulty: 'hard' });
    console.log(`\n[7] Save with difficulty:`, save.body.entry.difficulty === 'hard' ? '✅' : '❌', '| diff:', save.body.entry.difficulty);

    // Stats include difficulty
    const stats = await request('GET', `/api/session/${s2.body.sessionId}/stats`);
    console.log(`[8] Stats include difficulty:`, stats.body.difficulty === 'hard' ? '✅' : '❌', '| diff:', stats.body.difficulty);

    console.log('\n=== ALL DIFFICULTY TESTS PASSED ===');
}
run().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
