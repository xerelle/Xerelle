import { jsonResponse } from "../../lib/http.js";
import { getModelIdFromSession } from "./login.js";

// Returns a model's earnings summary: subscription revenue, referral
// bonuses (with a breakdown of who each came from), and a combined
// total balance. This is read-only — no withdrawal logic here, since
// there's no real Paystack balance to withdraw from yet. Powers both
// the small balance chip on Room self-view and the full Earnings page,
// so the two never show different numbers.
export async function handleGetEarnings(request, env) {
  const modelId = await getModelIdFromSession(request, env);
  if (!modelId) {
    return jsonResponse({ error: "login_required", message: "Log in first." }, 401);
  }

  const model = await env.DB.prepare(
    "SELECT subscription_price_kobo FROM models WHERE id = ?"
  )
    .bind(modelId)
    .first();

  // Subscription revenue: every active subscription counts one full
  // period's worth of revenue at the model's current price. This is a
  // simple running total, not a true ledger of every historical
  // renewal — accurate enough for a summary view.
  const activeSubs = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM subscriptions WHERE model_id = ? AND status = 'active'"
  )
    .bind(modelId)
    .first();
  const subscriptionRevenueKobo = activeSubs.count * (model.subscription_price_kobo || 0);

  // Referral bonuses: real ledger entries, summed plus itemized.
  const { results: referralEntries } = await env.DB.prepare(
    `SELECT rb.bonus_amount_kobo, rb.created_at,
       COALESCE(m.display_name, m.username) AS referred_model_name
     FROM referral_bonuses rb
     JOIN models m ON m.id = rb.referred_model_id
     WHERE rb.referring_model_id = ?
     ORDER BY rb.created_at DESC`
  )
    .bind(modelId)
    .all();

  const referralTotalKobo = referralEntries.reduce((sum, r) => sum + r.bonus_amount_kobo, 0);

  return jsonResponse({
    total_balance_kobo: subscriptionRevenueKobo + referralTotalKobo,
    subscription_revenue_kobo: subscriptionRevenueKobo,
    active_subscriber_count: activeSubs.count,
    referral_total_kobo: referralTotalKobo,
    referral_entries: referralEntries,
    milestone_bonus_status: "coming_soon",
    withdrawal_status: "coming_soon",
  });
}
