import { round, score } from './score.js';

/**
 * Path to directory containing `_list.json` and all levels
 */
const dir = '/data';

export async function fetchList() {
    const listResult = await fetch(`${dir}/_list.json`);
    try {
        const list = await listResult.json();
        return await Promise.all(
            list.map(async (path, rank) => {
                const levelResult = await fetch(`${dir}/${path}.json`);
                try {
                    const level = await levelResult.json();
                    return [
                        {
                            ...level,
                            path,
                            records: level.records.sort((a, b) => b.percent - a.percent),
                        },
                        null,
                    ];
                } catch {
                    console.error(`Failed to load level #${rank + 1} ${path}.`);
                    return [null, path];
                }
            }),
        );
    } catch {
        console.error(`Failed to load list.`);
        return null;
    }
}

export async function fetchEditors() {
    try {
        const editorsResults = await fetch(`${dir}/_editors.json`);
        const editors = await editorsResults.json();
        return editors;
    } catch {
        return null;
    }
}

export async function fetchPacks() {
    try {
        const packsResult = await fetch(`${dir}/packs.json`);
        const packs = await packsResult.json();
        return packs;
    } catch {
        console.error('Failed to load packs.');
        return [];
    }
}

export async function fetchLeaderboard() {
    const list = await fetchList();
    const packs = await fetchPacks();

    const scoreMap = {};
    const errs = [];

    // Build initial maps and score arrays
    list.forEach(([level, err], rank) => {
        if (err) {
            errs.push(err);
            return;
        }

        // Verification
        const verifier =
            Object.keys(scoreMap).find((u) => u.toLowerCase() === level.verifier.toLowerCase()) ||
            level.verifier;
        scoreMap[verifier] ??= {
            verified: [],
            completed: [],
            progressed: [],
            packs: { completed: [], progressed: [] },
        };
        const { verified } = scoreMap[verifier];
        verified.push({
            rank: rank + 1,
            level: level.name,
            score: score(rank + 1, 100, level.percentToQualify),
            link: level.verification,
            path: level.path,            // <-- add this so verifications count as a path
        });

        // Records
        level.records.forEach((record) => {
            const user =
                Object.keys(scoreMap).find((u) => u.toLowerCase() === record.user.toLowerCase()) ||
                record.user;
            scoreMap[user] ??= {
                verified: [],
                completed: [],
                progressed: [],
                packs: { completed: [], progressed: [] },
            };
            const { completed, progressed } = scoreMap[user];
            if (record.percent === 100) {
                completed.push({
                    rank: rank + 1,
                    level: level.name,
                    score: score(rank + 1, 100, level.percentToQualify),
                    link: record.link,
                    path: level.path,
                });
                return;
            }

            progressed.push({
                rank: rank + 1,
                level: level.name,
                percent: record.percent,
                score: score(rank + 1, record.percent, level.percentToQualify),
                link: record.link,
                path: level.path,
            });
        });
    });

    // Build helper maps for path/name lookup
    const pathByName = {};
    const nameByPath = {};
    list.forEach(([level, err]) => {
        if (!level) return;
        pathByName[level.name] = level.path;
        nameByPath[level.path] = level.name;
    });

    // Build per-user completed path sets
    const userCompletedPaths = {};
    Object.entries(scoreMap).forEach(([user, scores]) => {
        const completedPaths = (scores.completed || []).map((c) => c.path).filter(Boolean);
        const verifiedPaths = (scores.verified || []).map((v) => v.path).filter(Boolean);
        userCompletedPaths[user] = new Set([...completedPaths, ...verifiedPaths]);
    });

    // Helper: try to resolve a pack level entry to a level path in our list
    function resolvePackLevelPath(packLevel) {
        // Try matching by title -> path
        if (!packLevel) return null;
        const candidates = [packLevel.title, packLevel.id];
        for (const cand of candidates) {
            if (!cand) continue;
            // direct path match
            if (nameByPath[cand]) return cand;
            // if cand matches a path in list
            if (list.find(([lvl]) => lvl && lvl.path === cand)) return cand;
            // if cand matches a level name
            if (pathByName[cand]) return pathByName[cand];
        }

        // last resort: try normalized matches (underscores/spaces)
        const norm = (s) => s && s.replace(/\s+/g, '_');
        for (const [lvl, pathName] of Object.entries(nameByPath)) {
            for (const cand of candidates) {
                if (!cand) continue;
                if (norm(cand) === norm(lvl)) return pathName;
                if (norm(cand) === norm(pathName)) return pathName;
            }
        }

        return null;
    }

    // For each pack, resolve its level paths
    const packsResolved = packs.map((pack) => {
        const paths = (pack.levels || [])
            .map((pl) => resolvePackLevelPath(pl))
            .filter(Boolean);
        return { ...pack, paths };
    });

    // For each user, evaluate packs and award points into a separate packPoints value
    const packPointsByUser = {};
    Object.keys(scoreMap).forEach((user) => (packPointsByUser[user] = 0));

    packsResolved.forEach((pack) => {
        const totalLevels = pack.paths.length;
        if (totalLevels === 0) return; // nothing to match

        Object.keys(scoreMap).forEach((user) => {
            const completedSet = userCompletedPaths[user] || new Set();
            let completedCount = 0;
            pack.paths.forEach((p) => {
                if (completedSet.has(p)) completedCount += 1;
            });

            if (completedCount === totalLevels) {
                // fully completed -> award pack points
                packPointsByUser[user] += pack.pointsReward || 0;
                scoreMap[user].packs.completed.push({
                    id: pack.id,
                    title: pack.title,
                    points: pack.pointsReward || 0,
                });
            } else if (completedCount > 0) {
                // partial progress
                const percent = Math.round((completedCount / totalLevels) * 100);
                scoreMap[user].packs.progressed.push({
                    id: pack.id,
                    title: pack.title,
                    percent,
                    completed: completedCount,
                    total: totalLevels,
                    points: pack.pointsReward || 0,
                });
            }
        });
    });

    // Wrap in extra Object containing the user and total score
    const res = Object.entries(scoreMap).map(([user, scores]) => {
        const { verified, completed, progressed } = scores;
        const baseTotal = [verified, completed, progressed]
            .flat()
            .reduce((prev, cur) => prev + cur.score, 0);
        const packTotal = packPointsByUser[user] || 0;
        const total = baseTotal + packTotal;

        return {
            user,
            total: round(total),
            packPoints: packTotal,
            ...scores,
        };
    });

    // Sort by total score
    return [res.sort((a, b) => b.total - a.total), errs];
}
