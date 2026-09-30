// Browser regressions using the real page, jQuery, and both editor libraries.
// Only the EpixFrame transport is replaced with an in-memory file store.
// Run: EPIX_BROWSER_TEST_TOOLS=/path/to/node_modules node tests/editing-browser.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require(process.env.EPIX_BROWSER_TEST_TOOLS
  ? path.join(process.env.EPIX_BROWSER_TEST_TOOLS, "playwright") : "playwright");
const root = path.resolve(__dirname, "..");
const fixture = `
window.testStore = {
  title: "Test blog", description: "A short description", links: "[Example](https://example.com)",
  modified: 0, next_post_id: 3,
  post: [
    { post_id: 1, title: "First post", date_published: 1759201207,
      body: "A [link](https://example.com) and **bold** text.\\n\\n---\\n\\nThe complete post.", votes: 0, comments: 2 },
    { post_id: 2, title: "Second post", date_published: 1759201208,
      body: "Second body", votes: 0, comments: 0 }
  ]
};
window.testWrites = [];
window.testFailWrite = false;
window.testConfirm = false;
Page.site_info = { settings: { own: true }, content: { modified: 0 }, address: "epix1blog" };
Page.data = structuredClone(testStore);
Page.server_info = {};
Page.cmd = function(command, params, cb) {
  setTimeout(function() {
    if (command === "fileGet") {
      if (params[0] === "content.json") cb('{"title": "Test blog"}');
      else cb(JSON.stringify(testStore));
    } else if (command === "fileWrite") {
      if (testFailWrite) { cb("write failed"); return; }
      if (params[0] === "data/data.json") {
        testStore = JSON.parse(decodeURIComponent(escape(atob(params[1]))));
        testWrites.push(structuredClone(testStore));
      }
      if (cb) cb("ok");
    } else if (command === "fileList") cb([]);
    else if (command === "wrapperConfirm") cb(testConfirm);
    else if (command === "dbQuery") cb(Object.entries(testStore).filter(([key]) => key !== "post").map(([key, value]) => ({key, value})));
    else if (cb) cb("ok");
  }, window.testDelay || 0);
};
document.body.className = "theme-light page-main loaded";
document.querySelector("#loading-overlay").remove();
for (const key of ["title", "description", "links"]) {
  const el = $('.left [data-editable="' + key + '"]');
  el.data("content", testStore[key]).html(key === "title" ? testStore[key] : Text.renderMarked(testStore[key]));
}
testStore.post.forEach(post => {
  const el = $(".post.template").clone().removeClass("template").attr("id", "post_" + post.post_id).appendTo(".posts");
  Page.applyPostdata(el, structuredClone(post));
});
Page.addInlineEditors();
window.testReady = true;
`;

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const name = pathname === "/" ? "index.html" : pathname.slice(1);
  if (name.includes("..")) { res.writeHead(400).end(); return; }
  try {
    let content;
    if (name === "alloy-editor/all.js") {
      content = fs.readdirSync(path.join(root, "alloy-editor")).filter(f => f.endsWith(".js") && f !== "all.js")
        .sort().map(f => fs.readFileSync(path.join(root, "alloy-editor", f), "utf8")).join("\n;\n");
    } else {
      content = fs.readFileSync(path.join(root, name));
    }
    if (name === "index.html") content = content.toString().replace("</body>", `<script>${fixture}</script></body>`);
    if (name === "js/lib/epixframe.js") content = content.toString() + "\nEpixFrame.prototype._connect = function() {};";
    const type = name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css"
      : name.endsWith(".svg") ? "image/svg+xml" : "text/html";
    res.writeHead(200, { "Content-Type": type }).end(content);
  } catch { res.writeHead(404).end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => {
    errors.push(error.stack || error.message);
    console.error("Browser error:", error.stack || error.message);
  });
  page.on("dialog", dialog => dialog.dismiss());
  const origin = `http://127.0.0.1:${server.address().port}/`;
  const titleEditor = '#post_1 textarea.editor[aria-label="Title"]';
  async function reset(width = 1280) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin);
    await page.waitForFunction(() => window.testReady);
  }
  async function startPost() {
    await page.locator("#post_1 > .editable-edit").click();
  }
  async function editBody(body) {
    await page.locator('#post_1 > [data-editable="body"]').click();
    await page.waitForSelector("#post_1 .CodeMirror");
    await page.evaluate(text => document.querySelector("#post_1 .CodeMirror").CodeMirror.setValue(text), body);
  }
  async function cancel() {
    await page.locator(".editbar .cancel").click();
    await page.waitForFunction(() => !document.querySelector("textarea.editor, .meditor"));
  }
  async function saved() {
    await page.locator(".editbar .save").click();
    await page.waitForFunction(() => !document.querySelector("textarea.editor, .meditor"));
  }
  try {
    await reset();
    assert.equal(await page.locator(".editable-edit:visible").count(), 3, "one pencil per post and profile");
    assert.equal(await page.locator("#post_1 > .editable-edit").evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.width >= 44 && rect.height >= 44;
    }), true, "pencil has a full-size click target");
    await page.evaluate(() => Page.addInlineEditors());
    assert.equal(await page.locator(".editable-edit:visible").count(), 3, "refresh does not duplicate pencils");
    await startPost();
    await page.locator(titleEditor).fill("Changed title");
    await editBody("Changed **body** with [link](https://example.com)");
    await page.locator(titleEditor).click();
    assert.equal(await page.locator(titleEditor).inputValue(), "Changed title");
    assert.equal(await page.evaluate(() => document.querySelector("#post_1 .CodeMirror").CodeMirror.getValue()), "Changed **body** with [link](https://example.com)");
    if (process.env.EPIX_BROWSER_TEST_OUTPUT) {
      fs.mkdirSync(process.env.EPIX_BROWSER_TEST_OUTPUT, { recursive: true });
      await page.screenshot({ path: path.join(process.env.EPIX_BROWSER_TEST_OUTPUT, "post-desktop.png"), fullPage: true });
    }
    await saved();
    const stored = await page.evaluate(() => ({ post: testStore.post[0], writes: testWrites.length }));
    assert.equal(stored.post.title, "Changed title");
    assert.equal(stored.post.body, "Changed **body** with [link](https://example.com)");
    assert.equal(stored.post.date_published, 1759201207, "untouched timestamp remains exact");
    assert.equal(stored.writes, 1, "all fields saved in one write");
    console.log("PASS grouped editing, field switching, and atomic save");

    await reset();
    const original = await page.locator("#post_1").innerText();
    await startPost();
    await page.locator(titleEditor).fill("Discard me");
    await editBody("Discard body");
    await cancel();
    assert.equal(await page.locator("#post_1").innerText(), original);
    assert.equal(await page.evaluate(() => testWrites.length), 0);
    assert.equal(await page.locator(".meditor").count(), 0);
    console.log("PASS cancel restores all fields and removes editor containers");

    await reset();
    await startPost();
    await page.locator('#post_1 .published[data-editable]').focus();
    await page.locator('#post_1 textarea[aria-label="Date published"]').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Date published");
    await saved();
    assert.equal(await page.evaluate(() => testWrites.length), 0, "focusing fields does not rewrite stored values");
    console.log("PASS keyboard focus activates fields without changing untouched values");

    await reset();
    await startPost();
    const blocked = await page.evaluate(() => {
      const anchor = document.querySelector("#post_1 .more");
      return [new MouseEvent("click", { bubbles: true, cancelable: true }),
        new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }),
        new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }),
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true })]
        .map(event => !anchor.dispatchEvent(event));
    });
    assert.deepEqual(blocked, [true, true, true, true]);
    await editBody("A [link](https://example.com)");
    await page.locator("#post_1 .meditor-editmode").click();
    assert.equal(await page.evaluate(() => {
      const link = document.querySelector("#post_1 .ae-editable a");
      return !link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }), true, "rich text links cannot navigate");
    await cancel();
    await page.locator("#post_1 .title a").click();
    await page.waitForURL(/Post:1/);
    console.log("PASS normal, modified, middle, and rich text links are blocked only during editing");

    await reset(390);
    await page.locator(".left > .editable-edit").click();
    await page.locator('.left textarea[aria-label="Title"]').fill("Mobile profile");
    await page.locator('.left [data-editable="description"]').click();
    await page.locator('.left textarea[aria-label="Description"]').fill("");
    await page.locator('.left > .left-more > [data-editable="links"]').click();
    await page.waitForSelector(".left .meditor-editmode");
    await page.locator(".left textarea.meditor-markdown").fill("[Updated](https://example.org)");
    if (process.env.EPIX_BROWSER_TEST_OUTPUT) {
      fs.mkdirSync(process.env.EPIX_BROWSER_TEST_OUTPUT, { recursive: true });
      await page.screenshot({ path: path.join(process.env.EPIX_BROWSER_TEST_OUTPUT, "profile-mobile.png"), fullPage: true });
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "mobile editing fits the viewport");
    await saved();
    assert.deepEqual(await page.evaluate(() => [testStore.title, testStore.description, testStore.links, testWrites.length]),
      ["Mobile profile", "", "[Updated](https://example.org)", 1]);
    await page.locator(".left > .editable-edit").click();
    await page.locator('.left > [data-editable="description"]').click();
    await page.locator('.left textarea[aria-label="Description"]').fill("Restored description");
    await saved();
    assert.equal(await page.evaluate(() => testStore.description), "Restored description", "blank fields remain editable");
    console.log("PASS mobile profile editing, hidden links, and empty field saves");

    await reset();
    let releaseLibrary;
    const libraryWait = new Promise(resolve => { releaseLibrary = resolve; });
    await page.route("**/alloy-editor/all.js", async route => {
      await libraryWait;
      await route.continue();
    });
    await startPost();
    await page.locator('#post_1 > [data-editable="body"]').click();
    await cancel();
    releaseLibrary();
    await page.waitForFunction(() => !!window.AlloyEditor);
    assert.equal(await page.locator(".meditor").count(), 0, "late library load cannot resurrect cancelled editor");
    await page.unroute("**/alloy-editor/all.js");
    await startPost();
    await editBody("Reopened after cancellation");
    await saved();
    assert.equal(await page.evaluate(() => testStore.post[0].body), "Reopened after cancellation");
    console.log("PASS cancelling during lazy loading and reopening the editor");

    await reset();
    await page.route("**/alloy-editor/all.js", route => route.abort());
    await startPost();
    await page.locator('#post_1 > [data-editable="body"]').click();
    await page.locator("#post_1 textarea.meditor-markdown").fill("Fallback source");
    await saved();
    assert.equal(await page.evaluate(() => testStore.post[0].body), "Fallback source");
    await page.unroute("**/alloy-editor/all.js");
    console.log("PASS markdown fallback after editor library fails to load");

    await reset();
    let releaseDuringSave;
    const saveLibraryWait = new Promise(resolve => { releaseDuringSave = resolve; });
    await page.route("**/alloy-editor/all.js", async route => {
      await saveLibraryWait;
      await route.continue();
    });
    await startPost();
    await page.locator(titleEditor).fill("Saved while loading");
    await page.locator('#post_1 > [data-editable="body"]').click();
    await page.evaluate(() => { testDelay = 1500; });
    await page.locator(".editbar .save").click();
    releaseDuringSave();
    await page.waitForSelector("#post_1 .CodeMirror");
    assert.equal(await page.evaluate(() => document.querySelector("#post_1 .CodeMirror").CodeMirror.getOption("readOnly")), true,
      "an editor loaded during save cannot accept edits that would be dropped");
    assert.equal(await page.locator("#post_1 .meditor-toolbar button").evaluateAll(buttons => buttons.length > 0 && buttons.every(button => button.disabled)), true,
      "formatting controls are disabled during pending saves");
    await page.waitForFunction(() => !document.querySelector("textarea.editor, .meditor"));
    await page.unroute("**/alloy-editor/all.js");
    assert.equal(await page.evaluate(() => testStore.post[0].title), "Saved while loading");
    console.log("PASS editors loaded during a pending save remain read-only");

    await reset();
    await startPost();
    await page.locator('#post_1 > [data-editable="body"]').click();
    await page.waitForSelector("#post_1 .CodeMirror");
    await page.locator("#post_1 .meditor-editmode").click();
    await page.locator("#post_1 .meditor-editmode").click();
    await saved();
    assert.equal(await page.evaluate(() => testWrites.length), 0, "switching editor modes preserves original markdown");
    console.log("PASS switching modes preserves untouched markdown");

    await reset();
    await startPost();
    await page.locator(titleEditor).fill("Retry title");
    await page.evaluate(() => { testFailWrite = true; });
    await page.locator(".editbar .save").click();
    await page.waitForFunction(() => !document.querySelector(".editbar .save").classList.contains("loading"));
    assert.equal(await page.locator(titleEditor).inputValue(), "Retry title");
    assert.equal(await page.evaluate(() => testStore.post[0].title), "First post");
    await page.evaluate(() => { testFailWrite = false; });
    await saved();
    assert.equal(await page.evaluate(() => testStore.post[0].title), "Retry title");
    console.log("PASS failed saves retain drafts for retry");

    await reset();
    await startPost();
    await page.locator(".editbar .delete").click();
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => testStore.post.length), 2, "declining confirmation keeps post");
    assert.equal(await page.locator(titleEditor).count(), 1, "declining confirmation keeps draft open");
    await cancel();
    console.log("PASS declined deletion is respected");

    await reset();
    await page.evaluate(() => {
      document.body.classList.replace("page-main", "page-post");
      const comment = $(".comment.template").clone().removeClass("template").attr({
        id: "test-comment", "data-object": "Comment:42", "data-deletable": "yes"
      }).appendTo(".comments");
      comment.find(".comment-body").attr("data-editable", "body").data("content", "Original comment").html("Original comment");
      Page.addInlineEditors(".comments");
      Page.editRecord = (collection, id, changes, cb) => {
        window.testComment = { collection, id, changes };
        cb(true);
      };
    });
    await page.locator("#test-comment > .editable-edit").click();
    await page.locator('#test-comment textarea[aria-label="Body"]').fill("Updated **comment**");
    await saved();
    assert.deepEqual(await page.evaluate(() => testComment), {
      collection: "comments.json", id: 42, changes: { body: "Updated **comment**" }
    });
    assert.equal(await page.locator("#test-comment .comment-body strong").innerText(), "comment");
    console.log("PASS comment editing retains the signed record save path");

    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const touchPage = await touchContext.newPage();
    touchPage.on("pageerror", error => errors.push(error.message));
    await touchPage.goto(origin);
    await touchPage.waitForFunction(() => window.testReady);
    await touchPage.evaluate(() => { document.querySelector(".feed-follow").style.display = "inline-block"; });
    assert.equal(await touchPage.locator(".feed-follow").evaluate(el => el.getBoundingClientRect().height), 44,
      "Follow keeps a 44px touch target with the smoother border");
    assert.equal(await touchPage.locator(".left .avatar").evaluate(el => getComputedStyle(el).width), "44px",
      "mobile avatar size remains responsive");
    assert.equal(await touchPage.locator(".left .avatar").evaluate(el => getComputedStyle(el).imageRendering), "auto");
    assert.equal(await touchPage.locator(".left").evaluate(el => {
      const parent = el.getBoundingClientRect(), button = el.querySelector(".editable-edit").getBoundingClientRect();
      return button.left >= parent.left && button.right <= parent.right && button.top >= parent.top;
    }), true, "profile pencil stays attached to the mobile profile");
    await touchContext.close();
    console.log("PASS mobile touch targets, profile button placement, and smooth avatar scaling");

    await require("./editor-formatting.cjs")({ page, reset, startPost, editBody, saved, cancel });

    assert.deepEqual(errors, [], "no browser runtime errors");
  } catch (error) {
    if (process.env.EPIX_BROWSER_TEST_OUTPUT) {
      fs.mkdirSync(process.env.EPIX_BROWSER_TEST_OUTPUT, { recursive: true });
      await page.screenshot({ path: path.join(process.env.EPIX_BROWSER_TEST_OUTPUT, "failure.png"), fullPage: true });
    }
    if (errors.length) console.error("Browser errors:", errors);
    throw error;
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
