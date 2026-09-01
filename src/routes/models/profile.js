import { jsonResponse, notFound } from "../../lib/http.js";
import { getSubscriberIdFromSession } from "../subscribers/login.js";
import { getGalleryPhotoUrls } from "./gallery.js";
import { getActiveStory } from "./stories.js";

// Public data for a model's landing page. Includes follower/like COUNTS
// (public, aggregate) and — only if the requester is logged in — whether
// THIS SPECIFIC subscriber is following/liking her, AND whether she
// likes him back (model_likes_you) — the mutual-like signal shown on
// room.html instead of raw popularity numbers. It never returns a
// list of who else is following or liking, to anyone, under any
// circumstance.
export async function handleModelProfile(username, request, env) {
  const model = await env.DB.prepare(
    `SELECT id, username, display_name, age, teaser_media_url, verification_status, subscription_price_kobo, discoverable, video_calls_enabled
     FROM models WHERE username = ?`
  )
    .bind(username)
    .first();

  if (!model || model.verification_status !== "verified") {
    return notFound();
  }

  const followerCountRow = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM model_follows WHERE model_id = ?"
  )
    .bind(model.id)
    .first();

  const likeCountRow = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM model_likes WHERE model_id = ?"
  )
    .bind(model.id)
    .first();

  const galleryPhotos = await getGalleryPhotoUrls(model.id, env);
  const activeStory = await getActiveStory(model.id, env);

  let viewer_is_following = false;
  let viewer_has_liked = false;
  let model_likes_you = false;

  const subscriberId = await getSubscriberIdFromSession(request, env);
  if (subscriberId) {
    const followRow = await env.DB.prepare(
      "SELECT id FROM model_follows WHERE subscriber_id = ? AND model_id = ?"
    )
      .bind(subscriberId, model.id)
      .first();
    viewer_is_following = !!followRow;

    const likeRow = await env.DB.prepare(
      "SELECT id FROM model_likes WHERE subscriber_id = ? AND model_id = ?"
    )
      .bind(subscriberId, model.id)
      .first();
    viewer_has_liked = !!likeRow;

    const modelLikesRow = await env.DB.prepare(
      "SELECT id FROM model_likes_subscriber WHERE model_id = ? AND subscriber_id = ?"
    )
      .bind(model.id, subscriberId)
      .first();
    model_likes_you = !!modelLikesRow;
  }

  return jsonResponse({
    id: model.id,
    username: model.username,
    display_name: model.display_name,
    teaser_media_url: model.teaser_media_url,
    gallery_photos: galleryPhotos,
    active_story: activeStory,
    subscription_price_kobo: model.subscription_price_kobo || 1000000,
    age: model.age,
    discoverable: !!model.discoverable,
    video_calls_enabled: !!model.video_calls_enabled,
    follower_count: followerCountRow.count,
    like_count: likeCountRow.count,
    viewer_is_following,
    viewer_has_liked,
    model_likes_you,
  });
}
