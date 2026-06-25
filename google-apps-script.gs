/**
 * PhotoTool - Google Drive upload backend (Google Apps Script)
 *
 * This little script is the "backend" the website needs. It runs as YOUR
 * Google account, so it is allowed to write into your Drive. The website
 * sends each photo/video here, and this script saves it into one folder.
 * No password or token is ever exposed in the public website.
 *
 * ---------------------------------------------------------------------
 * ONE-TIME SETUP (you do this in your Google account):
 *
 * 1. In Google Drive, create a folder for the photos (e.g. "Wesele").
 *    Open it. Copy the ID from the address bar:
 *      https://drive.google.com/drive/folders/THIS_LONG_PART_IS_THE_ID
 *
 * 2. Go to https://script.google.com  ->  New project.
 *    Delete the sample code, paste THIS whole file in.
 *
 * 3. Put the folder ID from step 1 into FOLDER_ID below (between quotes).
 *
 * 4. Click  Deploy  >  New deployment.
 *      - Click the gear, choose type:  Web app
 *      - Description: anything
 *      - Execute as:        Me  (your email)
 *      - Who has access:    Anyone
 *    Click Deploy. Approve the permissions when Google asks
 *    (it will warn it's an unverified app - that's expected, it's your
 *     own script; click Advanced -> Go to project -> Allow).
 *
 * 5. Copy the "Web app" URL it gives you. It ends with /exec , like:
 *      https://script.google.com/macros/s/AKfy....../exec
 *    Give that URL to Claude (or paste it into CONFIG.WEB_APP_URL in
 *    app.js). That's the only thing connecting the site to your Drive.
 * ---------------------------------------------------------------------
 */

// >>> PASTE YOUR DRIVE FOLDER ID HERE <<<
var FOLDER_ID = "PASTE_YOUR_DRIVE_FOLDER_ID_HERE";

/** Receives one uploaded file and saves it to the Drive folder. */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var folder = DriveApp.getFolderById(FOLDER_ID);
    var bytes = Utilities.base64Decode(body.data);
    var blob = Utilities.newBlob(bytes, body.mimeType, body.filename);
    var file = folder.createFile(blob);
    return jsonOut({ ok: true, id: file.getId(), name: file.getName() });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

/** Lets you open the URL in a browser to confirm it's deployed. */
function doGet() {
  return jsonOut({ ok: true, message: "PhotoTool upload endpoint is alive." });
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
