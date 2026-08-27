export type AchievementId = "first_win" | "hot_streak" | "veteran" | "comeback";

export interface PlayerProfile {
  games: number;
  wins: number;
  losses: number;
  xp: number;
  streak: number;
  bestStreak: number;
  achievements: AchievementId[];
}

export interface MatchReward {
  xp: number;
  levelBefore: number;
  levelAfter: number;
  unlocked: AchievementId[];
}

const STORAGE_KEY = "chillno-profile-v1";
const EMPTY: PlayerProfile = { games: 0, wins: 0, losses: 0, xp: 0, streak: 0, bestStreak: 0, achievements: [] };

export const achievementLabels: Record<AchievementId, { icon: string; title: string }> = {
  first_win: { icon: "🏆", title: "First Crown" },
  hot_streak: { icon: "🔥", title: "Hot Streak" },
  veteran: { icon: "🎴", title: "Table Regular" },
  comeback: { icon: "💪", title: "Back in Business" },
};

export function levelForXp(xp: number) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 80)) + 1;
}

export function levelProgress(xp: number) {
  const level = levelForXp(xp);
  const floor = (level - 1) ** 2 * 80;
  const ceiling = level ** 2 * 80;
  return { level, current: xp - floor, needed: ceiling - floor, percent: ((xp - floor) / (ceiling - floor)) * 100 };
}

export function loadProfile(): PlayerProfile {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<PlayerProfile> | null;
    return stored ? { ...EMPTY, ...stored, achievements: Array.isArray(stored.achievements) ? stored.achievements : [] } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

export function recordSoloMatch(won: boolean): { profile: PlayerProfile; reward: MatchReward } {
  const previous = loadProfile();
  const nextStreak = won ? previous.streak + 1 : 0;
  const next: PlayerProfile = {
    ...previous,
    games: previous.games + 1,
    wins: previous.wins + (won ? 1 : 0),
    losses: previous.losses + (won ? 0 : 1),
    xp: previous.xp + (won ? 120 : 45),
    streak: nextStreak,
    bestStreak: Math.max(previous.bestStreak, nextStreak),
  };
  const candidates: AchievementId[] = [];
  if (next.wins >= 1) candidates.push("first_win");
  if (next.streak >= 3) candidates.push("hot_streak");
  if (next.games >= 10) candidates.push("veteran");
  if (won && previous.streak === 0 && previous.losses > 0) candidates.push("comeback");
  const unlocked = candidates.filter((id) => !previous.achievements.includes(id));
  next.achievements = [...new Set([...previous.achievements, ...unlocked])];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return { profile: next, reward: { xp: won ? 120 : 45, levelBefore: levelForXp(previous.xp), levelAfter: levelForXp(next.xp), unlocked } };
}
