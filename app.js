/* PhotoTool - frontend logic
 *
 * Lets a guest pick photos/videos from their phone, preview them, and
 * "send" them. Sending is currently a SIMULATED PLACEHOLDER (see
 * uploadFiles()) - it does NOT transmit anywhere yet. When the on-prem
 * server exists, only uploadFiles() needs to change.
 */

(function () {
  "use strict";

  // ----- CONFIG --------------------------------------------------------
  // Paste your deployed Google Apps Script Web App URL here (ends /exec).
  // See google-apps-script.gs for how to get it. Until this is filled in,
  // the SEND button will show a clear "not configured" error.
  var CONFIG = {
    WEB_APP_URL: ""
  };

  // ----- Polish UI strings (kept in one place for easy editing) -----
  var STR = {
    sendDefault: "WYŚLIJ",
    sending: "WYSYŁANIE…",
    success: "WYSŁANO – DZIĘKUJEMY!",
    error: "BŁĄD – SPRÓBUJ PONOWNIE",
    selectedOne: "Wybrano 1 plik",
    selectedFew: "Wybrano {n} pliki",
    selectedMany: "Wybrano {n} plików",
    videoBadge: "FILM"
  };

  // ----- Element references -----
  var fileInput = document.getElementById("fileInput");
  var pickButton = document.getElementById("pickButton");
  var previews = document.getElementById("previews");
  var selectionInfo = document.getElementById("selectionInfo");
  var sendButton = document.getElementById("sendButton");
  var sendLabel = document.getElementById("sendLabel");
  var progressWrap = document.getElementById("progressWrap");
  var progressBar = document.getElementById("progressBar");

  // Selected files, each as { id, file, url }. We keep our own list so a
  // guest can add more or remove individual items (the native input does
  // not support incremental selection on its own).
  var selected = [];
  var nextId = 1;
  var isSending = false;

  // ----- Helpers -----

  // Polish plural rule for "plik" (file): 1 / few(2-4) / many.
  function selectionText(n) {
    if (n === 1) return STR.selectedOne;
    var mod10 = n % 10;
    var mod100 = n % 100;
    var few = mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14);
    var template = few ? STR.selectedFew : STR.selectedMany;
    return template.replace("{n}", String(n));
  }

  function updateUi() {
    var n = selected.length;
    if (n > 0) {
      selectionInfo.hidden = false;
      selectionInfo.textContent = selectionText(n);
    } else {
      selectionInfo.hidden = true;
    }
    sendButton.disabled = n === 0 || isSending;
  }

  function makeThumb(item) {
    var wrap = document.createElement("div");
    wrap.className = "thumb";
    wrap.dataset.id = String(item.id);

    var isVideo = item.file.type.indexOf("video/") === 0;
    var media;
    if (isVideo) {
      media = document.createElement("video");
      media.src = item.url;
      media.muted = true;
      media.playsInline = true;
      media.preload = "metadata";

      var badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = STR.videoBadge;
      wrap.appendChild(media);
      wrap.appendChild(badge);
    } else {
      media = document.createElement("img");
      media.src = item.url;
      media.alt = "";
      media.loading = "lazy";
      wrap.appendChild(media);
    }

    var remove = document.createElement("button");
    remove.className = "remove";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Usuń");
    remove.addEventListener("click", function () {
      removeItem(item.id);
    });
    wrap.appendChild(remove);

    return wrap;
  }

  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    files.forEach(function (file) {
      // Only images and videos; the input already filters, but double-check.
      if (file.type.indexOf("image/") !== 0 && file.type.indexOf("video/") !== 0) {
        return;
      }
      var item = {
        id: nextId++,
        file: file,
        url: URL.createObjectURL(file)
      };
      selected.push(item);
      previews.appendChild(makeThumb(item));
    });
    updateUi();
  }

  function removeItem(id) {
    var idx = selected.findIndex(function (it) { return it.id === id; });
    if (idx === -1) return;
    URL.revokeObjectURL(selected[idx].url);
    selected.splice(idx, 1);
    var node = previews.querySelector('.thumb[data-id="' + id + '"]');
    if (node) node.remove();
    updateUi();
  }

  function resetSendButton() {
    sendButton.classList.remove("is-success", "is-error");
    sendLabel.textContent = STR.sendDefault;
  }

  function clearAll() {
    selected.forEach(function (it) { URL.revokeObjectURL(it.url); });
    selected = [];
    previews.innerHTML = "";
    fileInput.value = "";
    updateUi();
  }

  // ----- Upload: Google Drive via Apps Script --------------------------
  // Each file is read as base64 and POSTed to the Apps Script web app,
  // which saves it into your Drive folder. We send a plain-string body so
  // the browser treats it as a "simple" request and skips the CORS
  // preflight that Apps Script cannot answer.

  function readAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        // result looks like "data:<mime>;base64,XXXX" - keep only XXXX.
        var s = String(reader.result);
        resolve(s.substring(s.indexOf(",") + 1));
      };
      reader.onerror = function () { reject(new Error("read failed")); };
      reader.readAsDataURL(file);
    });
  }

  function uploadOne(item) {
    return readAsBase64(item.file).then(function (b64) {
      var payload = JSON.stringify({
        filename: item.file.name || ("upload-" + Date.now()),
        mimeType: item.file.type || "application/octet-stream",
        data: b64
      });
      return fetch(CONFIG.WEB_APP_URL, { method: "POST", body: payload })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.text();
        })
        .then(function (text) {
          var ok = false;
          try { ok = JSON.parse(text).ok === true; } catch (e) { ok = false; }
          if (!ok) throw new Error("server rejected upload");
        });
    });
  }

  function uploadFiles(items, onProgress) {
    if (!CONFIG.WEB_APP_URL) {
      return Promise.reject(new Error("WEB_APP_URL not configured"));
    }
    var total = items.length;
    var done = 0;
    // Upload one file at a time: gentler on phones, and progress is
    // meaningful (advances once per finished file).
    return items.reduce(function (chain, item) {
      return chain.then(function () {
        return uploadOne(item).then(function () {
          done += 1;
          onProgress(done / total);
        });
      });
    }, Promise.resolve());
  }
  // ---------------------------------------------------------------------

  function setProgress(fraction) {
    progressBar.style.width = Math.round(fraction * 100) + "%";
  }

  function handleSend() {
    if (isSending || selected.length === 0) return;
    isSending = true;
    resetSendButton();
    sendButton.disabled = true;
    sendLabel.textContent = STR.sending;
    progressWrap.hidden = false;
    setProgress(0);

    uploadFiles(selected.slice(), setProgress)
      .then(function () {
        sendButton.classList.add("is-success");
        sendLabel.textContent = STR.success;
        clearAll();
        setTimeout(function () {
          progressWrap.hidden = true;
          setProgress(0);
          resetSendButton();
          isSending = false;
          updateUi();
        }, 1800);
      })
      .catch(function () {
        sendButton.classList.add("is-error");
        sendLabel.textContent = STR.error;
        isSending = false;
        sendButton.disabled = false;
        setTimeout(function () {
          progressWrap.hidden = true;
          setProgress(0);
          resetSendButton();
          updateUi();
        }, 2500);
      });
  }

  // ----- Events -----
  pickButton.addEventListener("click", function () { fileInput.click(); });
  fileInput.addEventListener("change", function (e) {
    addFiles(e.target.files);
    // Reset so picking the same file again still fires "change".
    fileInput.value = "";
  });
  sendButton.addEventListener("click", handleSend);

  updateUi();
})();
