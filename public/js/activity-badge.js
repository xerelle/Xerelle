// Shows an honest "Active recently" style badge for a model, based on
// her last genuine activity (logging in or sending a message) — lets
// a prospective subscriber judge responsiveness BEFORE subscribing,
// rather than discovering it only after paying.

window.getActivityStatus = function (lastActiveAtUnixSeconds) {
  if (!lastActiveAtUnixSeconds) {
    return null; // never been active — don't show anything misleading
  }

  const now = Math.floor(Date.now() / 1000);
  const secondsAgo = now - lastActiveAtUnixSeconds;

  if (secondsAgo < 300) {
    return { label: "Active now", color: "#5FBF6C", dot: true };
  }
  if (secondsAgo < 86400) {
    return { label: "Active today", color: "#8FBF7A", dot: false };
  }
  if (secondsAgo < 604800) {
    return { label: "Active this week", color: "#C9A85C", dot: false };
  }

  const weeksAgo = Math.floor(secondsAgo / 604800);
  if (weeksAgo === 1) {
    return { label: "Active 1 week ago", color: "#9C8791", dot: false };
  }
  if (weeksAgo < 5) {
    return { label: `Active ${weeksAgo} weeks ago`, color: "#9C8791", dot: false };
  }

  return { label: "Active over a month ago", color: "#9C8791", dot: false };
};

// Builds the actual HTML for the badge, or an empty string if there's
// nothing honest to show yet.
window.renderActivityBadge = function (lastActiveAtUnixSeconds) {
  const status = window.getActivityStatus(lastActiveAtUnixSeconds);
  if (!status) return "";

  const dotHtml = status.dot
    ? `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${status.color}; margin-right:5px;"></span>`
    : "";

  return `<span class="activity-badge" style="color:${status.color}; display:inline-flex; align-items:center; font-size:12.5px; font-weight:500;">${dotHtml}${status.label}</span>`;
};
