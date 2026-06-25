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
    WEB_APP_URL: "https://script.google.com/macros/s/AKfycbzFw_SBz_7XWshg1My4hX5l5lRghRvrcaBBdk9j1aNogmRu_-AzUBZEQCd_4vQaShPG/exec"
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
    videoBadge: "FILM",
    maxReached: "Maksymalnie 100 plików."
  };

  // Cap how many files can be queued at once (keeps the phone responsive).
  var MAX_FILES = 100;

  // ----- Element references -----
  var fileInput = document.getElementById("fileInput");
  var pickButton = document.getElementById("pickButton");
  var hero = document.getElementById("hero");
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
  var activeId = null; // which item is shown in the big preview

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

  // Show one item large in the hero area. Only ONE media element exists at
  // a time here, so the big preview never piles up memory/decoders.
  function renderHero(item) {
    hero.innerHTML = "";
    if (!item) { hero.hidden = true; return; }
    var isVideo = item.file.type.indexOf("video/") === 0;
    var media;
    if (isVideo) {
      media = document.createElement("video");
      media.src = item.url;
      media.controls = true;
      media.playsInline = true;
      media.preload = "metadata";
    } else {
      media = document.createElement("img");
      media.src = item.url;
      media.alt = "";
      media.decoding = "async";
    }
    hero.appendChild(media);
    hero.hidden = false;
  }

  function setActive(id) {
    activeId = id;
    var item = selected.find(function (it) { return it.id === id; });
    renderHero(item || null);
    // highlight the matching thumbnail
    var nodes = previews.querySelectorAll(".thumb");
    Array.prototype.forEach.call(nodes, function (node) {
      node.classList.toggle("is-active", node.dataset.id === String(id));
    });
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
    remove.addEventListener("click", function (e) {
      e.stopPropagation(); // don't also trigger the thumbnail's select
      removeItem(item.id);
    });
    wrap.appendChild(remove);

    // Tapping the thumbnail focuses it in the big preview above.
    wrap.addEventListener("click", function () { setActive(item.id); });

    return wrap;
  }

  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    var hitLimit = false;
    var lastAddedId = null;
    files.forEach(function (file) {
      // Only images and videos; the input already filters, but double-check.
      if (file.type.indexOf("image/") !== 0 && file.type.indexOf("video/") !== 0) {
        return;
      }
      if (selected.length >= MAX_FILES) { hitLimit = true; return; }
      var item = {
        id: nextId++,
        file: file,
        url: URL.createObjectURL(file)
      };
      selected.push(item);
      previews.appendChild(makeThumb(item));
      lastAddedId = item.id;
    });
    // Focus the most recently added file in the big preview.
    if (lastAddedId !== null) setActive(lastAddedId);
    updateUi();
    if (hitLimit) {
      selectionInfo.hidden = false;
      selectionInfo.textContent = STR.maxReached + " " + selectionText(selected.length);
    }
  }

  function removeItem(id) {
    var idx = selected.findIndex(function (it) { return it.id === id; });
    if (idx === -1) return;
    URL.revokeObjectURL(selected[idx].url);
    selected.splice(idx, 1);
    var node = previews.querySelector('.thumb[data-id="' + id + '"]');
    if (node) node.remove();
    // If we removed the focused item, focus a neighbour (or clear).
    if (activeId === id) {
      var fallback = selected[Math.min(idx, selected.length - 1)];
      if (fallback) {
        setActive(fallback.id);
      } else {
        activeId = null;
        renderHero(null);
      }
    }
    updateUi();
  }

  function resetSendButton() {
    sendButton.classList.remove("is-success", "is-error");
    sendLabel.textContent = STR.sendDefault;
  }

  function clearAll() {
    selected.forEach(function (it) { URL.revokeObjectURL(it.url); });
    selected = [];
    activeId = null;
    renderHero(null);
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
