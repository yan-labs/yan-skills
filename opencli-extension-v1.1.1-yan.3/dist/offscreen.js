function isReadClipboardRequest(msg) {
  return typeof msg === "object" && msg !== null && msg.type === "opencli-read-clipboard";
}
function readClipboardViaExecCommand() {
  const textarea = document.getElementById("paste-target");
  if (!textarea) throw new Error("offscreen document missing #paste-target");
  textarea.value = "";
  textarea.focus();
  const ok = document.execCommand("paste");
  if (!ok) throw new Error("document.execCommand('paste') returned false");
  const text = textarea.value;
  textarea.value = "";
  return text;
}
async function readClipboardViaAsyncApi() {
  if (!navigator.clipboard?.readText) throw new Error("navigator.clipboard.readText unavailable in this context");
  return navigator.clipboard.readText();
}
async function readClipboardText() {
  try {
    return await readClipboardViaAsyncApi();
  } catch (asyncErr) {
    try {
      return `[DEBUG_ASYNC_FAILED: ${asyncErr instanceof Error ? asyncErr.message : String(asyncErr)}]
` + readClipboardViaExecCommand();
    } catch (execErr) {
      throw new Error(
        `both clipboard read paths failed — async: ${asyncErr instanceof Error ? asyncErr.message : String(asyncErr)}; execCommand: ${execErr instanceof Error ? execErr.message : String(execErr)}`
      );
    }
  }
}
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!isReadClipboardRequest(msg)) return void 0;
  readClipboardText().then((text) => sendResponse({ text })).catch((err) => sendResponse({ error: err instanceof Error ? err.message : String(err) }));
  return true;
});
