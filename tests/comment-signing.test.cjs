const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const templatePath = "data-default/users/content-default.json";
const rulesPath = "data/users/content.json";
const template = fs.readFileSync(path.join(__dirname, "..", templatePath), "utf8");

function blog({ owner = true, rules = template, failCommand } = {}) {
  const calls = [], records = [];
  let draft = "A comment";
  const input = {
    val(value) { if (value === undefined) return draft; draft = value; },
    addClass() {}, removeClass() {}, text() { return this; }, html() { return ""; },
  };
  const $ = () => input;
  $.when = () => ({ done() {} });
  const context = vm.createContext({
    window: { EpixFrame: class { log() {} }, location: { search: "" }, crypto: webcrypto },
    $, LogMixin: { log() {} }, User: { requireXid: () => true, checkCert() {} },
    Text: { jsonEncode: JSON.stringify }, Time: { timestamp: () => 100 }, setTimeout() {},
  });
  for (const file of ["EpixBlog.js", "Comments.js"]) {
    const filename = path.join(__dirname, "../js", file);
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
  }
  const page = context.Page = context.window.Page;
  page.site_info = { address: "clone", privatekey: owner, content: { cloned_from: "source" },
    auth_address: "reader", xid_directory: "reader.epix" };
  page.cmd = async (cmd, params) => {
    calls.push([cmd, params]);
    if (cmd === failCommand) throw new Error("Unavailable");
    if (cmd === "fileGet") return params.inner_path === rulesPath ? rules : template;
    if (cmd === "recordSign") return { ...params[0], sign: "signed" };
    if (cmd === "fileWrite") records.push(JSON.parse(params[1]).post[0]);
    if (cmd === "sitePublish" && params.inner_path === rulesPath) rules = '{"signs":{"clone":"signed"}}';
    return "ok";
  };
  const comments = context.window.Comments;
  comments.post_id = 1;
  comments.loadComments = () => {};
  async function submit() {
    comments.submitComment();
    await new Promise(setImmediate);
    assert.equal(comments.submitting, false);
  }
  return { page, calls, records, submit, input, allowRetry() { failCommand = null; } };
}

test("an owner initializes legacy user rules before writing the first comment", async () => {
  const { calls, input, submit } = blog();
  await submit();
  assert.deepEqual(calls.filter(([cmd]) => cmd === "sitePublish").map(([, params]) => ({ ...params })), [
    { inner_path: rulesPath, privatekey: "stored" }, { inner_path: "data/users/reader.epix/content.json" },
  ]);
  assert.equal(input.val(), "");
});

test("signed clones allow readers to publish with their identity", async () => {
  const { calls, input, submit } = blog({ owner: false, rules: '{"signs":{"clone":"signed"}}' });
  await submit();
  assert.equal(calls.some(([, params]) => params.privatekey), false);
  assert.equal(input.val(), "");
});

test("a reader or customized unsigned rules require owner action and retain the draft", async () => {
  for (const options of [{ owner: false }, { rules: '{"user_contents":{"permissions":{}}}' }]) {
    const { calls, input, submit } = blog(options);
    await submit();
    assert.equal(input.val(), "A comment");
    assert.equal(calls.some(([cmd]) => cmd === "recordSign" || cmd === "sitePublish"), false);
    assert.equal(calls.at(-1)[0], "wrapperNotification");
  }
});

test("failed writes do not publish and a publish retry keeps the comment identity", async () => {
  const signed = '{"signs":{"clone":"signed"}}';
  const write = blog({ rules: signed, failCommand: "fileWrite" });
  await write.submit();
  assert.equal(write.calls.some(([cmd]) => cmd === "sitePublish"), false);
  assert.equal(write.input.val(), "A comment");

  const publish = blog({ rules: signed, failCommand: "sitePublish" });
  await publish.submit();
  assert.equal(publish.input.val(), "A comment");
  publish.input.val("Updated draft");
  publish.allowRetry();
  await publish.submit();
  const [first, second] = publish.records;
  assert.equal(first.nonce, second.nonce);
  assert.equal(first.date_added, second.date_added);
  assert.equal(second.supersedes, first.clock);
  assert.equal(second.body, "Updated draft");
  assert.equal(publish.input.val(), "");
});
