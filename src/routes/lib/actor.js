import { getModelIdFromSession } from "../models/login.js";
import { getSubscriberIdFromSession } from "../subscribers/login.js";

// Block and Report can be initiated by EITHER a model or a subscriber, so
// every request needs to figure out which kind of session is actually
// making it. Tries model first, then subscriber. Returns null if neither
// session is valid.
export async function getActorFromSession(request, env) {
  const modelId = await getModelIdFromSession(request, env);
  if (modelId) {
    return { type: "model", id: modelId };
  }

  const subscriberId = await getSubscriberIdFromSession(request, env);
  if (subscriberId) {
    return { type: "subscriber", id: subscriberId };
  }

  return null;
}
