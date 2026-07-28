// Xerelle — main Worker entry point
//
// This is a deliberately minimal starting router, matching the MVP
// sequence from the build roadmap:
//   1. Model registration + verification
//   2. Model landing page (teaser photo, subscribe CTA)
//   3. Subscriber registration + checkout
//   4. Basic chat
//
// PPV, Stories, tipping, badges, referrals, bonuses, and video calls
// are intentionally NOT wired up yet — build the core loop first,
// confirm it works end to end, then layer those in one at a time.

import { handleModelRegister } from "./routes/models/register.js";
import { handleModelVerify } from "./routes/models/verify.js";
import { handleModelProfile } from "./routes/models/profile.js";
import { handleSubscriberRegister } from "./routes/subscribers/register.js";
import { handleCheckoutStart } from "./routes/payments/checkout.js";
import { handlePaystackWebhook } from "./routes/payments/webhook.js";
import { handleSendMessage, handleGetMessages } from "./routes/chat/messages.js";
import { jsonResponse, notFound } from "./lib/http.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      // ---- Models ----
      if (pathname === "/api/models/register" && method === "POST") {
        return await handleModelRegister(request, env);
      }
      if (pathname === "/api/models/verify" && method === "POST") {
        return await handleModelVerify(request, env);
      }
      if (pathname.match(/^\/api\/models\/[\w.-]+$/) && method === "GET") {
        const username = pathname.split("/").pop();
        return await handleModelProfile(username, env);
      }

      // ---- Subscribers ----
      if (pathname === "/api/subscribers/register" && method === "POST") {
        return await handleSubscriberRegister(request, env);
      }

      // ---- Payments ----
      if (pathname === "/api/checkout/start" && method === "POST") {
        return await handleCheckoutStart(request, env);
      }
      if (pathname === "/api/payments/webhook/paystack" && method === "POST") {
        return await handlePaystackWebhook(request, env);
      }

      // ---- Chat ----
      if (pathname === "/api/messages/send" && method === "POST") {
        return await handleSendMessage(request, env);
      }
      if (pathname.match(/^\/api\/messages\/[\w-]+\/[\w-]+$/) && method === "GET") {
        const [, , , subscriberId, modelId] = pathname.split("/");
        return await handleGetMessages(subscriberId, modelId, env);
      }

      // ---- Static assets (public site) ----
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      return jsonResponse({ error: "Internal error" }, 500);
    }
  },
};
