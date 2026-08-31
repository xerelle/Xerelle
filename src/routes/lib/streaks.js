// Manages chat streaks between a subscriber/model pair — a streak
// increments once per calendar day, but ONLY once BOTH sides have sent
// at least one message that day. Missing a full day (neither side
// completing their half) breaks the streak back to 0.
//
// Dates are stored as plain "YYYY-MM-DD" strings, not timestamps —
// comparing real calendar days, not a rolling 24-hour window. This
// keeps the rule simple and explainable: "did we both message today?"

function todayString() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function yesterdayString() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Call this every time a message is sent, from either side. Updates
// that side's "last active" date, and re-evaluates whether today's
// streak credit should be awarded.
export async function recordStreakActivity(env, subscriberId, modelId, senderType) {
  const today = todayString();
  const yesterday = yesterdayString();

  let row = await env.DB.prepare(
    "SELECT * FROM chat_streaks WHERE subscriber_id = ? AND model_id = ?"
  )
    .bind(subscriberId, modelId)
    .first();

  if (!row) {
    await env.DB.prepare(
      `INSERT INTO chat_streaks (subscriber_id, model_id, streak_count, last_subscriber_date, last_model_date, last_credited_date)
       VALUES (?, ?, 0, NULL, NULL, NULL)`
    )
      .bind(subscriberId, modelId)
      .run();
    row = { streak_count: 0, last_subscriber_date: null, last_model_date: null, last_credited_date: null };
  }

  const lastSubscriberDate = senderType === "subscriber" ? today : row.last_subscriber_date;
  const lastModelDate = senderType === "model" ? today : row.last_model_date;

  let streakCount = row.streak_count;
  let lastCreditedDate = row.last_credited_date;

  // Both sides have now messaged today, and today hasn't already been
  // credited — this is the moment the streak actually advances.
  const bothActiveToday = lastSubscriberDate === today && lastModelDate === today;
  if (bothActiveToday && lastCreditedDate !== today) {
    if (lastCreditedDate === yesterday) {
      streakCount += 1; // continuing an existing streak
    } else {
      streakCount = 1; // starting fresh, or restarting after a broken streak
    }
    lastCreditedDate = today;
  }

  await env.DB.prepare(
    `UPDATE chat_streaks
     SET streak_count = ?, last_subscriber_date = ?, last_model_date = ?, last_credited_date = ?
     WHERE subscriber_id = ? AND model_id = ?`
  )
    .bind(streakCount, lastSubscriberDate, lastModelDate, lastCreditedDate, subscriberId, modelId)
    .run();
}

// Call this when DISPLAYING a streak (chat header, inbox list) — never
// trust the stored streak_count blindly, since a broken streak (missed
// a full day) should show as 0 even if the row hasn't been touched
// since. This computes the true current value at read time.
export function getEffectiveStreak(row) {
  if (!row || !row.last_credited_date) return 0;

  const today = todayString();
  const yesterday = yesterdayString();

  // If the last credited day is neither today nor yesterday, too much
  // time has passed without both sides messaging — the streak is dead.
  if (row.last_credited_date !== today && row.last_credited_date !== yesterday) {
    return 0;
  }

  return row.streak_count;
}
