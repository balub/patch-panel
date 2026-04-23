chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.runtime.openOptionsPage();
  }
});

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && typeof message === 'object' && message.type === 'OPEN_OPTIONS') {
    void chrome.runtime.openOptionsPage();
  }
});
