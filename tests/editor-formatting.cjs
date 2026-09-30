const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

module.exports = async function checkFormatting({ page, reset, startPost, editBody, saved, cancel }) {
  const toolbar = page.locator("#post_1 .meditor-toolbar");
  const button = action => toolbar.locator(`[data-action="${action}"]`);
  const currentMarkdown = () => page.evaluate(() => $("#post_1 > .body").data("editor").editor.val());
  async function openBody(width = 1280, theme = "theme-light") {
    await reset(width);
    await page.evaluate(theme => document.body.classList.replace("theme-light", theme), theme);
    await startPost();
    await editBody("alpha beta gamma");
  }
  async function select(mode, text = "alpha beta gamma", start = 6, end = 10) {
    const markdownMode = await page.locator("#post_1 .meditor-editmode").evaluate(el => el.classList.contains("markdown"));
    if (!markdownMode) await page.locator("#post_1 .meditor-editmode").click();
    await page.evaluate(({ text, start, end }) => {
      const cm = document.querySelector("#post_1 .CodeMirror").CodeMirror;
      cm.setValue(text);
      cm.focus();
      cm.setSelection(cm.posFromIndex(start), cm.posFromIndex(end));
    }, { text, start, end });
    if (mode === "rich") {
      await page.locator("#post_1 .meditor-editmode").click();
      await page.waitForFunction(() => {
        const rich = $("#post_1 > .body").data("editor").editor.editor.editor.get("nativeEditor");
        return rich.status === "ready";
      });
      await page.evaluate(({ start, end }) => {
        const rich = $("#post_1 > .body").data("editor").editor.editor.editor.get("nativeEditor");
        rich.focus();
        const walker = document.createTreeWalker(rich.element.$, NodeFilter.SHOW_TEXT);
        let node, offset = 0, first, last;
        while ((node = walker.nextNode())) {
          const next = offset + node.textContent.length;
          if (!first && start <= next) first = [node, start - offset];
          if (end <= next) { last = [node, end - offset]; break; }
          offset = next;
        }
        const range = new CKEDITOR.dom.range(rich.document);
        range.setStart(new CKEDITOR.dom.node(first[0]), first[1]);
        range.setEnd(new CKEDITOR.dom.node(last[0]), last[1]);
        rich.getSelection().selectRanges([range]);
      }, { start, end });
    }
  }
  async function insertLink(url) {
    await button("link").click();
    const form = page.locator("#post_1 .meditor-url-form");
    await form.locator('[name="url"]').fill(url);
    await form.locator('[name="url"]').press("Enter");
  }
  async function screenshot(name) {
    if (!process.env.EPIX_BROWSER_TEST_OUTPUT) return;
    fs.mkdirSync(process.env.EPIX_BROWSER_TEST_OUTPUT, { recursive: true });
    await page.screenshot({ path: path.join(process.env.EPIX_BROWSER_TEST_OUTPUT, name), fullPage: true });
  }

  for (const mode of ["markdown", "rich"]) {
    await openBody();
    for (const [action, expected] of [
      ["bold", /alpha \*\*beta\*\* gamma/],
      ["italic", /alpha (?:\*beta\*|_beta_) gamma/],
      ["strikethrough", /alpha ~~beta~~ gamma/],
      ["code", /alpha `beta` gamma/]
    ]) {
      await select(mode);
      await button(action).click();
      assert.match(await currentMarkdown(), expected, `${mode} ${action} formats only the selected text`);
    }
    await select(mode);
    await insertLink("https://example.com/docs");
    assert.match(await currentMarkdown(), /alpha \[beta\]\(https:\/\/example\.com\/docs\) gamma/);
    await screenshot(`formatting-${mode}.png`);
    await saved();
    assert.match(await page.evaluate(() => testStore.post[0].body), /\[beta\]\(https:\/\/example\.com\/docs\)/);
    console.log(`PASS ${mode} selection formatting and link insertion save as Markdown`);
  }

  for (const mode of ["markdown", "rich"]) {
    await openBody();
    await select(mode);
    await button("code").click();
    await button("code").click();
    assert.equal(await currentMarkdown(), "alpha beta gamma", `${mode} removing code preserves the surrounding paragraph`);
    await select(mode);
    await button("bold").click();
    await button("italic").click();
    assert.equal(await page.evaluate(() => {
      const rendered = document.createElement("div");
      rendered.innerHTML = marked($("#post_1 > .body").data("editor").editor.val());
      const both = rendered.querySelector("strong em, em strong");
      return both && both.textContent;
    }), "beta", `${mode} combines bold and italic on the same selection`);
    for (const [action, pattern] of [
      ["heading", /^#{1,6} alpha beta gamma/],
      ["quote", /^> alpha beta gamma/],
      ["unordered-list", /^\s*[-*+]\s+alpha beta gamma/],
      ["ordered-list", /^\s*1\.\s+alpha beta gamma/],
      ["code-block", /```\nalpha beta gamma\n```/]
    ]) {
      await select(mode, "alpha beta gamma", 0, 16);
      await button(action).click();
      assert.match(await currentMarkdown(), pattern, `${mode} ${action} produces valid block Markdown`);
    }
    await select(mode, "alpha beta gamma", 16, 16);
    await button("horizontal-rule").click();
    assert.match(await currentMarkdown(), /(?:---|\* \* \*)/);
    await select(mode);
    await button("image").click();
    const imageForm = page.locator("#post_1 .meditor-url-form");
    await imageForm.locator('[name="url"]').fill("img/avatar.svg");
    await imageForm.getByRole("button", { name: "Insert image", exact: true }).click();
    assert.match(await currentMarkdown(), /!\[beta\]\(img\/avatar\.svg\)/);
    await cancel();
    console.log(`PASS ${mode} block formatting and code toggle preserve text`);
  }

  for (const mode of ["markdown", "rich"]) {
    await openBody();
    await select(mode);
    await button("bold").focus();
    await page.keyboard.press("Enter");
    assert.match(await currentMarkdown(), /alpha \*\*beta\*\* gamma/, `${mode} keyboard toolbar activation keeps the selection`);
    await select(mode);
    await button("link").click();
    await page.locator('#post_1 .meditor-url-form [name="url"]').fill("https://cancel.example");
    await page.keyboard.press("Escape");
    assert.equal(await currentMarkdown(), "alpha beta gamma", `${mode} link cancellation leaves text unchanged`);
    await button("link").click();
    await page.locator("#post_1 .meditor-url-form").getByRole("button", { name: "Cancel", exact: true }).focus();
    await page.keyboard.press("Enter");
    assert.equal(await currentMarkdown(), "alpha beta gamma", `${mode} keyboard Cancel keeps the text unchanged`);
    await button("code").click();
    assert.match(await currentMarkdown(), /alpha `beta` gamma/, `${mode} link cancellation restores the selection`);
    await cancel();
    console.log(`PASS ${mode} keyboard formatting and URL cancellation preserve selection`);
  }

  await openBody();
  await select("markdown", "", 0, 0);
  await button("bold").click();
  await page.keyboard.type("typed");
  assert.equal(await currentMarkdown(), "**typed**", "formatting without selected text places typing inside the markers");
  await select("markdown", "line one\nline two", 0, 17);
  await button("code-block").click();
  assert.match(await currentMarkdown(), /```\nline one\nline two\n```/);
  for (const [action, expected] of [
    ["bold", "alpha **beta** gamma"], ["italic", "alpha *beta* gamma"], ["strikethrough", "alpha ~~beta~~ gamma"]
  ]) {
    await select("markdown", "alpha beta gamma", 5, 11);
    await button(action).click();
    assert.equal(await currentMarkdown(), expected, `${action} keeps selection boundary spaces outside Markdown delimiters`);
  }
  await cancel();
  console.log("PASS empty-selection insertion and multiline code formatting");

  await openBody();
  await select("rich");
  await button("bold").click();
  await page.keyboard.press("Control+z");
  assert.equal(await currentMarkdown(), "alpha beta gamma", "rich formatting participates in native undo");
  await select("rich");
  await button("bold").click();
  await insertLink("https://example.com/first");
  assert.match(await currentMarkdown(), /\[\*\*beta\*\*\]\(https:\/\/example\.com\/first\)/,
    "linking rich text retains its existing formatting");
  await button("link").click();
  const linkForm = page.locator("#post_1 .meditor-url-form");
  assert.equal(await linkForm.locator('[name="url"]').inputValue(), "https://example.com/first");
  await linkForm.locator('[name="url"]').fill("https://example.com/updated");
  await linkForm.getByRole("button", { name: "Insert link", exact: true }).click();
  assert.match(await currentMarkdown(), /\[\*\*beta\*\*\]\(https:\/\/example\.com\/updated\)/);
  assert.equal(await page.locator("#post_1 .ae-editable a a").count(), 0, "updating links does not nest anchors");
  await select("markdown");
  await button("link").click();
  await page.locator('#post_1 .meditor-url-form [name="url"]').fill("javascript:alert(1)");
  await page.locator("#post_1 .meditor-url-form").getByRole("button", { name: "Insert link", exact: true }).click();
  assert.equal(await currentMarkdown(), "alpha beta gamma", "unsafe URL does not change content");
  await page.keyboard.press("Escape");
  await cancel();
  console.log("PASS rich formatting undo and URL validation");

  await openBody();
  await select("rich", "[![Photo](img/avatar.svg)](https://example.com)\n\n[`array[0]`](https://example.com/code)\n\nedit me", 0, 0);
  await page.evaluate(() => {
    const rich = $("#post_1 > .body").data("editor").editor.editor.editor.get("nativeEditor");
    const range = rich.createRange();
    range.selectNodeContents(new CKEDITOR.dom.element(rich.element.$.querySelector("p:last-child")));
    rich.getSelection().selectRanges([range]);
  });
  await button("bold").click();
  assert.deepEqual(await page.evaluate(() => {
    const rendered = document.createElement("div");
    rendered.innerHTML = marked($("#post_1 > .body").data("editor").editor.val());
    return [rendered.querySelector("a img")?.alt, rendered.querySelector("a code")?.textContent];
  }), ["Photo", "array[0]"], "formatting a paragraph preserves existing linked images and code elsewhere");
  await cancel();
  console.log("PASS rich formatting preserves existing linked images and code");

  await openBody(390, "theme-dark");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await screenshot("formatting-mobile-dark.png");
  await cancel();
  await page.locator(".left > .editable-edit").click();
  await page.locator('.left > .left-more > [data-editable="links"]').click();
  const links = page.locator(".left textarea.meditor-markdown");
  await links.fill("alpha beta gamma");
  await links.evaluate(el => { el.focus(); el.setSelectionRange(6, 10); });
  await page.locator('.left .meditor-toolbar [data-action="bold"]').click();
  assert.equal(await links.inputValue(), "alpha **beta** gamma");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await saved();
  assert.equal(await page.evaluate(() => testStore.links), "alpha **beta** gamma");
  console.log("PASS mobile toolbar and compact profile Markdown formatting");

  await reset();
  await page.route("**/alloy-editor/all.js", route => route.abort());
  await startPost();
  await page.locator('#post_1 > [data-editable="body"]').click();
  const fallback = page.locator("#post_1 textarea.meditor-markdown");
  await fallback.fill("alpha beta gamma");
  await fallback.evaluate(el => { el.focus(); el.setSelectionRange(6, 10); });
  await button("code").click();
  assert.equal(await fallback.inputValue(), "alpha `beta` gamma");
  await saved();
  assert.equal(await page.evaluate(() => testStore.post[0].body), "alpha `beta` gamma");
  await page.unroute("**/alloy-editor/all.js");
  console.log("PASS formatting remains available after rich editor library fails");
};
