// Detect page navigation and notify sidepanel
(function() {
  var lastUrl = '';

  function notifyNavigation() {
    var url = location.href;
    if (url === lastUrl) return;
    lastUrl = url;
    try {
      browser.runtime.sendMessage({ type: 'navigation', url: url });
    } catch (e) {}
  }

  // Fire on load
  notifyNavigation();

  // Watch for SPA-style navigation
  var observer = new MutationObserver(function() {
    if (location.href !== lastUrl) notifyNavigation();
  });
  observer.observe(document.body || document, { subtree: true, childList: true });

  // Catch pushState/replaceState
  var origPush = history.pushState;
  var origReplace = history.replaceState;
  history.pushState = function() { origPush.apply(this, arguments); notifyNavigation(); };
  history.replaceState = function() { origReplace.apply(this, arguments); notifyNavigation(); };
  window.addEventListener('popstate', notifyNavigation);

  // Handle navigate requests from sidepanel
  browser.runtime.onMessage.addListener(function(msg) {
    if (msg.type === 'navigate' && msg.url) {
      window.location.href = msg.url;
    }
  });
})();
