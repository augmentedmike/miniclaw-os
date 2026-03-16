/**
 * OpenClaw Browser Relay — background service worker
 *
 * Listens for tab events (navigation, load, close) and relays them to
 * the local OpenClaw gateway so the agent can react to browser state changes.
 *
 * The relay endpoint is configurable via storage but defaults to
 * http://127.0.0.1:9333/api/browser/events (the OpenClaw gateway).
 */

const DEFAULT_RELAY_URL = "http://127.0.0.1:9333/api/browser/events";

async function getRelayUrl() {
  try {
    const result = await chrome.storage.local.get("relayUrl");
    return result.relayUrl || DEFAULT_RELAY_URL;
  } catch {
    return DEFAULT_RELAY_URL;
  }
}

async function relay(event) {
  const url = await getRelayUrl();
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "openclaw-browser-relay",
        timestamp: Date.now(),
        ...event,
      }),
    });
  } catch {
    // Gateway not running — silently ignore
  }
}

// Tab navigation completed
chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId !== 0) return; // only main frame
  relay({
    type: "navigation.completed",
    tabId: details.tabId,
    url: details.url,
  });
});

// Tab created
chrome.tabs.onCreated.addListener((tab) => {
  relay({
    type: "tab.created",
    tabId: tab.id,
    url: tab.pendingUrl || tab.url || "",
  });
});

// Tab removed
chrome.tabs.onRemoved.addListener((tabId) => {
  relay({
    type: "tab.removed",
    tabId,
  });
});

// Tab updated (title, URL changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    relay({
      type: "tab.loaded",
      tabId,
      url: tab.url || "",
      title: tab.title || "",
    });
  }
});

console.log("[OpenClaw Browser Relay] Service worker started");
