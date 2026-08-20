// Streak milestone icons — first 10 tiers. Each tier has a distinct
// icon and color, telling a small story of a connection deepening
// over time rather than reusing one flame icon for every level.
// Below 7 days, a plain small flame is shown (no milestone reached yet).

window.XERELLE_STREAK_TIERS = [
  {
    threshold: 126, name: "Lantern", color: "#E8B84B",
    svg: `<path d="M9 3h6v2H9z"/><path d="M7 6h10l-1 11a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.2"/><path d="M9 21h6" stroke="currentColor" stroke-width="1.6"/>`,
  },
  {
    threshold: 112, name: "Anchor", color: "#8FB6C9",
    svg: `<circle cx="12" cy="5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v13" stroke="currentColor" stroke-width="1.8"/><path d="M6 10h12" stroke="currentColor" stroke-width="1.8"/><path d="M5 14a7 7 0 0 0 7 6 7 7 0 0 0 7-6" fill="none" stroke="currentColor" stroke-width="1.8"/>`,
  },
  {
    threshold: 98, name: "Key", color: "#D0A868",
    svg: `<circle cx="7" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 10.5L20 20" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l2.5-2.5" stroke="currentColor" stroke-width="1.8"/><path d="M18 18l2-2" stroke="currentColor" stroke-width="1.8"/>`,
  },
  {
    threshold: 84, name: "Entwined Hearts", color: "#DC5A78",
    svg: `<path d="M9 6c-2-1.6-5-.4-5 2.4 0 2.8 3.5 5 6.5 7.1C13 13 16.5 11.2 16.5 8.4c0-2.8-3-4-5-2.4-.6.5-1 1-1.5 1.7C9.5 7 9.1 6.5 9 6z" fill="currentColor" opacity="0.55" transform="translate(-1.5,-1)"/><path d="M9 6c-2-1.6-5-.4-5 2.4 0 2.8 3.5 5 6.5 7.1C13 13 16.5 11.2 16.5 8.4c0-2.8-3-4-5-2.4-.6.5-1 1-1.5 1.7C9.5 7 9.1 6.5 9 6z" fill="currentColor" transform="translate(1.5,1)"/>`,
  },
  {
    threshold: 70, name: "Sunrise", color: "#F0A24C",
    svg: `<path d="M3 16h18" stroke="currentColor" stroke-width="1.8"/><path d="M6 16a6 6 0 0 1 12 0" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 6v2M5 11l1.5 1.2M19 11l-1.5 1.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  },
  {
    threshold: 56, name: "Dove", color: "#C7CDD6",
    svg: `<path d="M4 12c2-3 5-4 7-2 1-3 5-4 8-1-2 0-3 1-3 2 3 0 5 2 5 4-2-1-4-1-5 0-1 2-4 3-7 2 1 1 3 1 4 2-3 1-7 0-9-3-1-1-1-3 0-4z"/>`,
  },
  {
    threshold: 42, name: "Firefly", color: "#D9C24E",
    svg: `<circle cx="12" cy="13" r="2.4"/><path d="M12 5v3M7 8l1.6 2M17 8l-1.6 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/><circle cx="12" cy="13" r="5" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>`,
  },
  {
    threshold: 28, name: "Heart", color: "#E0607F",
    svg: `<path d="M12 20s-7-4.5-9.5-9C1 7.5 3 4 6.5 4 9 4 11 6 12 7.5 13 6 15 4 17.5 4 21 4 23 7.5 21.5 11 19 15.5 12 20 12 20z"/>`,
  },
  {
    threshold: 14, name: "Bloom", color: "#E491B8",
    svg: `<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="6.5" rx="2.4" ry="3.2"/><ellipse cx="12" cy="17.5" rx="2.4" ry="3.2"/><ellipse cx="6.5" cy="12" rx="3.2" ry="2.4"/><ellipse cx="17.5" cy="12" rx="3.2" ry="2.4"/>`,
  },
  {
    threshold: 7, name: "Spark", color: "#F0955C",
    svg: `<path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8z"/>`,
  },
];

// Returns { name, color, svg } for the highest tier reached, or a
// plain default flame if under 7 days (streak started but no
// milestone hit yet). Returns null if streak is 0 (don't show anything).
window.getStreakTier = function (streakCount) {
  if (!streakCount || streakCount < 1) return null;

  for (const tier of window.XERELLE_STREAK_TIERS) {
    if (streakCount >= tier.threshold) return tier;
  }

  // 1-6 days: plain default flame, no milestone yet
  return {
    name: "Flame",
    color: "#E8935A",
    svg: `<path d="M12 2c1 3-2 4-2 7a3 3 0 0 0 6 0c0-1-.5-2-1-2.5 1.5.5 3 2.5 3 5.5a6 6 0 0 1-12 0c0-4 3-6 4-10z"/>`,
  };
};

// Builds the actual HTML for a streak badge (icon + count), or an
// empty string if there's no streak to show.
window.renderStreakBadge = function (streakCount) {
  const tier = window.getStreakTier(streakCount);
  if (!tier) return "";

  return `<span class="streak-badge" style="color:${tier.color}" title="${tier.name} — ${streakCount} day streak">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">${tier.svg}</svg>
    <span class="streak-count">${streakCount}</span>
  </span>`;
};
