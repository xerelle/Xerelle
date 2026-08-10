import { handleModelRegister } from "./routes/models/register.js";
import { handleModelVerify } from "./routes/models/verify.js";
import { handleModelLogin } from "./routes/models/login.js";
import { handleModelProfile } from "./routes/models/profile.js";
import { handleToggleFollow, handleToggleLike } from "./routes/models/follow.js";
import { handleUploadGalleryPhoto } from "./routes/models/gallery.js";
import { handlePostStory } from "./routes/models/stories.js";
import { handleGetModelInbox } from "./routes/models/inbox.js";
import { handleUpdateSubscriptionPrice } from "./routes/models/update-price.js";
import { handleUpdateRoomSettings } from "./routes/models/room-toggles.js";
import { handleModelChangePassword } from "./routes/models/change-password.js";
import { handleGetModelNotifications, handleMarkModelNotificationRead } from "./routes/models/notifications.js";
import { handlePostFeedItem } from "./routes/models/feed-post.js";
import { handleGetActivities } from "./routes/models/activities.js";
import { handleSubscriberRegister } from "./routes/subscribers/register.js";
import { handleSubscriberLogin } from "./routes/subscribers/login.js";
import { handleUploadSubscriberAvatar } from "./routes/subscribers/avatar.js";
import { handleGetSubscriberInbox } from "./routes/subscribers/inbox.js";
import { handleGetFollowedStories } from "./routes/subscribers/followed-stories.js";
import { handleGetDiscoverModels } from "./routes/subscribers/discover.js";
import { handleSubscriberChangePassword } from "./routes/subscribers/change-password.js";
import { handleGetNotifications, handleMarkNotificationRead } from "./routes/subscribers/notifications.js";
import { handleGetFeed } from "./routes/subscribers/feed-get.js";
import { handleToggleFeedLike } from "./routes/subscribers/feed-like.js";
import { handlePostFeedComment, handleGetFeedComments } from "./routes/subscribers/feed-comments.js";
import { handleCreateBlock, handleListBlocks, handleRemoveBlock } from "./routes/blocks.js";
import { handleCreateReport } from "./routes/reports.js";
import { handleCheckoutStart } from "./routes/payments/checkout.js";
import { handlePaystackWebhook } from "./routes/payments/webhook.js";
import { handleSendMessage, handleGetMessages } from "./routes/chat/messages.js";
import { handleServeMedia } from "./routes/media.js";
import { jsonResponse } from "./lib/http.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      if (pathname === "/api/models/register" && method === "POST") {
        return await handleModelRegister(request, env);
      }
      if (pathname === "/api/models/verify" && method === "POST") {
        return await handleModelVerify(request, env);
      }
      if (pathname === "/api/models/login" && method === "POST") {
        return await handleModelLogin(request, env);
      }
      if (pathname === "/api/models/gallery/upload" && method === "POST") {
        return await handleUploadGalleryPhoto(request, env);
      }
      if (pathname === "/api/models/stories/post" && method === "POST") {
        return await handlePostStory(request, env);
      }
      if (pathname === "/api/models/inbox" && method === "GET") {
        return await handleGetModelInbox(request, env);
      }
      if (pathname === "/api/models/price" && method === "POST") {
        return await handleUpdateSubscriptionPrice(request, env);
      }
      if (pathname === "/api/models/room-settings" && method === "POST") {
        return await handleUpdateRoomSettings(request, env);
      }
      if (pathname === "/api/models/change-password" && method === "POST") {
        return await handleModelChangePassword(request, env);
      }
      if (pathname === "/api/models/notifications" && method === "GET") {
        return await handleGetModelNotifications(request, env);
      }
      if (pathname.match(/^\/api\/models\/notifications\/[\w-]+\/read$/) && method === "POST") {
        const notificationId = pathname.split("/")[4];
        return await handleMarkModelNotificationRead(request, env, notificationId);
      }
      if (pathname === "/api/models/feed/post" && method === "POST") {
        return await handlePostFeedItem(request, env);
      }
      if (pathname === "/api/models/activities" && method === "GET") {
        return await handleGetActivities(request, env);
      }
      if (pathname.match(/^\/api\/models\/[\w.-]+\/follow$/) && method === "POST") {
        const username = pathname.split("/")[3];
        return await handleToggleFollow(request, env, username);
      }
      if (pathname.match(/^\/api\/models\/[\w.-]+\/like$/) && method === "POST") {
        const username = pathname.split("/")[3];
        return await handleToggleLike(request, env, username);
      }
      if (pathname.match(/^\/api\/models\/[\w.-]+$/) && method === "GET") {
        const username = pathname.split("/").pop();
        return await handleModelProfile(username, request, env);
      }
      if (pathname === "/api/subscribers/register" && method === "POST") {
        return await handleSubscriberRegister(request, env);
      }
      if (pathname === "/api/subscribers/login" && method === "POST") {
        return await handleSubscriberLogin(request, env);
      }
      if (pathname === "/api/subscribers/avatar/upload" && method === "POST") {
        return await handleUploadSubscriberAvatar(request, env);
      }
      if (pathname === "/api/subscribers/inbox" && method === "GET") {
        return await handleGetSubscriberInbox(request, env);
      }
      if (pathname === "/api/subscribers/stories-feed" && method === "GET") {
        return await handleGetFollowedStories(request, env);
      }
      if (pathname === "/api/subscribers/discover" && method === "GET") {
        return await handleGetDiscoverModels(request, env);
      }
      if (pathname === "/api/subscribers/change-password" && method === "POST") {
        return await handleSubscriberChangePassword(request, env);
      }
      if (pathname === "/api/subscribers/notifications" && method === "GET") {
        return await handleGetNotifications(request, env);
      }
      if (pathname.match(/^\/api\/subscribers\/notifications\/[\w-]+\/read$/) && method === "POST") {
        const notificationId = pathname.split("/")[4];
        return await handleMarkNotificationRead(request, env, notificationId);
      }
      if (pathname.match(/^\/api\/subscribers\/feed\/[\w.-]+$/) && method === "GET") {
        const username = pathname.split("/").pop();
        return await handleGetFeed(request, env, username);
      }
      if (pathname.match(/^\/api\/subscribers\/feed\/post\/[\w-]+\/like$/) && method === "POST") {
        const postId = pathname.split("/")[5];
        return await handleToggleFeedLike(request, env, postId);
      }
      if (pathname.match(/^\/api\/subscribers\/feed\/post\/[\w-]+\/comments$/) && method === "POST") {
        const postId = pathname.split("/")[5];
        return await handlePostFeedComment(request, env, postId);
      }
      if (pathname.match(/^\/api\/subscribers\/feed\/post\/[\w-]+\/comments$/) && method === "GET") {
        const postId = pathname.split("/")[5];
        return await handleGetFeedComments(request, env, postId);
      }
      if (pathname === "/api/block" && method === "POST") {
        return await handleCreateBlock(request, env);
      }
      if (pathname === "/api/block" && method === "GET") {
        return await handleListBlocks(request, env);
      }
      if (pathname.match(/^\/api\/block\/[\w-]+$/) && method === "DELETE") {
        const blockId = pathname.split("/").pop();
        return await handleRemoveBlock(request, env, blockId);
      }
      if (pathname === "/api/report" && method === "POST") {
        return await handleCreateReport(request, env);
      }
      if (pathname === "/api/checkout/start" && method === "POST") {
        return await handleCheckoutStart(request, env);
      }
      if (pathname === "/api/payments/webhook/paystack" && method === "POST") {
        return await handlePaystackWebhook(request, env);
      }
      if (pathname === "/api/messages/send" && method === "POST") {
        return await handleSendMessage(request, env);
      }
      if (pathname.match(/^\/api\/messages\/[\w-]+\/[\w-]+$/) && method === "GET") {
        const [, , , subscriberId, modelId] = pathname.split("/");
        return await handleGetMessages(subscriberId, modelId, env);
      }
      if (pathname.startsWith("/media/") && method === "GET") {
        const key = pathname.replace("/media/", "");
        return await handleServeMedia(key, env);
      }

      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      return jsonResponse({ error: "Internal error" }, 500);
    }
  },
};
