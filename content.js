const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected-mixer.js');
(document.head || document.documentElement).appendChild(script);

window.addEventListener("message", (event) =>
{
    if (event.data.type === "STATUS_UPDATE")
    {
        chrome.runtime.sendMessage(event.data);
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) =>
{
    window.postMessage({ type: request.action, audioData: request.audioData, id: request.id }, "*");
    sendResponse({ success: true });
    return true;
});