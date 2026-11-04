const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const {test} = require("node:test");
const vm = require("node:vm");
const {webcrypto} = require("node:crypto");

function fixture() {
  const files = new Map(), writes = [], errors = [];
  let failWrite;
  const original = {address: "blog", title: "Cloned blog", favicon: "img/custom.ico", modified: 17};
  files.set("content.json", JSON.stringify(original));
  let href = "";
  const controls = {disabled: false, querySelector() { return {}; }};
  const context = vm.createContext({
    window: {}, btoa, unescape, encodeURIComponent, crypto: webcrypto, URL, Blob, AbortSignal,
    document: {querySelector() { return {setAttribute(_, value) { href = value; }}; }}
  });
  vm.runInContext(readFileSync(path.join(__dirname, "../js/utils/BlogFavicon.js"), "utf8"), context);
  const page = {
    site_info: {address: "blog", settings: {own: true}, content: {...original}},
    checkPublishbar() {},
    async cmd(command, [name, value]) {
      if (command === "fileGet") return files.get(name);
      if (command === "fileDelete") { files.delete(name); return "ok"; }
      if (command === "wrapperNotification") { errors.push(value); return; }
      assert.equal(command, "fileWrite");
      writes.push(name);
      if (name === failWrite || (failWrite === "image" && name.endsWith(".png"))) return {error: "denied"};
      files.set(name, name === "content.json" ? Buffer.from(value, "base64").toString() : value);
      return "ok";
    }
  };
  const icon = new context.window.BlogFavicon(page, controls);
  return {icon, page, files, errors, writes, controls, context, get href() { return href; },
    manifest() { return JSON.parse(files.get("content.json")); }, fail(name) { failWrite = name; }};
}

test("uploaded icons preserve the clone's original icon and alternate signed image paths", async () => {
  const f = fixture();
  const upload = () => ({png: "data:image/png;base64,Zmlyc3Q="});
  await f.icon.save(upload);
  const first = f.manifest();
  assert.equal(first.blog_favicon_original, "img/custom.ico");
  assert.equal(first.title, "Cloned blog");
  assert.equal(first.favicon, f.href);
  assert.equal(f.files.get(first.favicon), "Zmlyc3Q=");
  await f.icon.save(() => ({png: "data:image/png;base64,c2Vjb25k"}));
  assert.notEqual(f.manifest().favicon, first.favicon);
  assert.equal(f.files.get(first.favicon), "Zmlyc3Q=");
  await f.icon.save(() => ({reset: true}));
  assert.equal(f.manifest().favicon, "img/custom.ico");
  assert.equal(f.manifest().blog_favicon_original, undefined);
  assert.equal(f.href, "img/custom.ico");
});

test("an unsigned favicon change still offers publication after reload, then clears when signed", async () => {
  const f = fixture();
  await f.icon.save(() => ({path: "img/avatar.svg"}));
  f.page.site_info.content = f.manifest();
  delete f.icon.pendingPublish;
  f.icon.refresh();
  assert.equal(f.href, "img/avatar.svg");
  assert.equal(f.icon.needsPublish(), true);
  f.page.site_info.content.modified++;
  assert.equal(f.icon.needsPublish(), false);
});

test("a failed image or manifest write leaves the active icon alone", async () => {
  for (const failure of ["image", "content.json"]) {
    const f = fixture();
    f.fail(failure);
    await f.icon.save(() => ({png: "data:image/png;base64,c2Vjb25k"}));
    assert.equal(f.manifest().favicon, "img/custom.ico");
    assert.equal(f.icon.pendingPublish, undefined);
    assert.equal(f.files.size, 1);
    assert.equal(f.errors.length, 1);
    assert.equal(f.controls.disabled, false);
  }
});

test("repeat drafts preserve both the published bytes and the clone's original custom artwork", async () => {
  const f = fixture();
  const original = {...f.manifest(), favicon: "img/blog-favicon-1.png"};
  f.files.set("content.json", JSON.stringify(original));
  f.files.set(original.favicon, "original bytes");
  const upload = value => f.icon.save(() => ({png: "data:image/png;base64," + value}));
  await upload("YQ==");
  const published = f.manifest();
  published.modified++;
  f.files.set("content.json", JSON.stringify(published));
  for (const bytes of ["Yg==", "Yw==", "ZA==", "ZQ=="]) {
    await upload(bytes);
    assert.equal(f.files.get(published.favicon), "YQ==");
    assert.equal(f.files.get(original.favicon), "original bytes");
  }
  assert.ok(f.manifest().blog_favicon_slots.length <= 3);
  await f.icon.save(() => ({reset: true}));
  assert.equal(f.manifest().favicon, original.favicon);
});

test("using the blog logo waits for it to settle and respects remote image read permissions", async () => {
  const f = fixture();
  let finish;
  const source = new Promise(resolve => { finish = resolve; });
  f.page.blogLogo = {currentSource: () => source};
  f.context.EpixAvatar = {get: async () => null};
  let fetchOptions;
  f.context.fetch = async (url, options) => {
    fetchOptions = options;
    return new Response("image");
  };
  f.context.BlogLogo = {makeLogo: async blob => {
    assert.equal(await blob.text(), "image");
    return "data:image/png;base64,YQ==";
  }};
  const save = f.icon.save(() => f.icon.currentLogo());
  assert.deepEqual(f.writes, []);
  finish("https://example.test/avatar.png");
  await save;
  assert.equal(fetchOptions.mode, "cors");
  assert.equal(fetchOptions.credentials, "omit");
  assert.equal(fetchOptions.referrerPolicy, "no-referrer");
  const before = f.manifest().favicon;
  assert.equal(f.files.get(before), "YQ==");
  f.context.fetch = async () => { throw new TypeError("CORS blocked"); };
  await f.icon.save(() => f.icon.currentLogo());
  assert.equal(f.manifest().favicon, before);
  assert.match(f.errors[0], /Upload the image/);
});

test("readers cannot write, and the inner document accepts only local image paths", async () => {
  const f = fixture();
  f.page.site_info.settings.own = false;
  f.page.site_info.content.favicon = "//other.example/icon.png";
  f.icon.refresh();
  assert.equal(f.controls.hidden, true);
  assert.equal(f.href, "img/favicon.ico");
  await f.icon.save(() => { assert.fail("reader reached owner action"); });
  assert.deepEqual(f.writes, []);
});
