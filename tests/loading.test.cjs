const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function setup() {
  const calls = [], timers = [], posts = [];
  const element = new Proxy({ length: 0, hasClass: () => false }, {
    get: (target, key) => key in target ? target[key] : () => element,
  });
  const $ = () => element;
  $.when = () => ({ done() {} });
  const context = vm.createContext({
    window: { EpixFrame: class { log() {} }, location: { search: "" } },
    $, setTimeout: cb => timers.push(cb),
    document: { getElementById: () => null },
    User: { checkCert() {}, updateMyInfo(cb) { cb(); } },
    translateDOM() {}, loadLanguage(lang, cb) { cb(); },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/EpixBlog.js"), "utf8"), context);
  const page = context.window.Page;
  context.Page = page;
  Object.assign(page, {
    data: null, page: 1, site_info: null, event_site_info: { resolve() {} },
    cmd(command, params, cb) { calls.push({ command, params, cb }); },
    applyPagerdata() {}, applyPostdata(elem, post) { posts.push(post); },
    pageLoaded() { this.loaded = true; }, checkPublishbar() {}, migrateRecords() {},
    startLoadingTimeout() {}, routeUrl() { this.routed = true; },
  });
  const take = (command) => {
    const index = calls.findIndex(call => call.command === command);
    assert.notEqual(index, -1, `expected ${command}`);
    return calls.splice(index, 1)[0];
  };
  return { page, timers, posts, take };
}

test("the post list retries an unavailable database instead of throwing", () => {
  const { page, timers, posts, take } = setup();
  page.pageMain();
  take("dbQuery").cb({ error: "database is rebuilding" });
  assert.doesNotThrow(() => take("dbQuery").cb({ error: "database is rebuilding" }));
  assert.equal(posts.length, 0);
  assert.equal(page.loaded, undefined);
  assert.equal(timers.length, 1);
  timers.shift()();
  take("dbQuery").cb([{ post_id: 1, title: "Recovered post" }]);
  assert.equal(posts.length, 1);
  assert.equal(page.loaded, true);
});

test("a failed metadata query preserves data and retries", () => {
  const { page, timers, take } = setup();
  page.data = { title: "Existing title" };
  page.loadData();
  take("dbQuery").cb({ error: "database is rebuilding" });
  assert.equal(page.data.title, "Existing title");
  assert.equal(timers.length, 1);
  timers.shift()();
  take("dbQuery").cb([{ key: "title", value: "Recovered title" }]);
  assert.equal(page.data.title, "Recovered title");
});

test("initial rendering waits for blog metadata", () => {
  const { page, take } = setup();
  page.onOpenWebsocket();
  take("serverInfo").cb({ language: "en" });
  take("siteInfo").cb({ address: "epix1blog", settings: { own: false } });
  assert.equal(page.routed, undefined);
  take("dbQuery").cb([]);
  assert.equal(page.routed, true);
});

test("progress events preserve identity and ownership settings", () => {
  const { page } = setup();
  page.setSiteinfo({ auth_address: "epix1me", cert_user_id: "me@xid.epix",
    settings: { own: true, size: 10 }, content: { title: "Blog" } });
  page.setSiteinfo({ peers: 3, settings: { size: 20 } });
  assert.equal(page.site_info.auth_address, "epix1me");
  assert.equal(page.site_info.settings.own, true);
  assert.equal(page.site_info.settings.size, 20);
  page.setSiteinfo({ auth_address: null, cert_user_id: null, settings: { own: false } });
  assert.equal(page.site_info.auth_address, null);
  assert.equal(page.site_info.settings.own, false);
});


test("database retries are bounded and keep the loading state visible", () => {
  const { page, timers, take } = setup();
  page.initial_load = true;
  let warning;
  page.setLoadingProgress = (progress, message) => { warning = message; };
  page.queryRows("SELECT * FROM post", () => { throw Error("must not render an error as rows"); });
  for (let attempt = 0; attempt <= 20; attempt++) {
    take("dbQuery").cb({ error: "database unavailable" });
    if (attempt < 20) timers.shift()();
  }
  assert.equal(timers.length, 0);
  assert.match(warning, /Retry loading/);
  assert.equal(page.initial_load, true);
});
