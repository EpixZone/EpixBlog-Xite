const assert = require("node:assert/strict");
const {createHash} = require("node:crypto");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const {test} = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({window: {}, URL, setTimeout, clearTimeout});
vm.runInContext(readFileSync(path.join(root, "js/utils/BlogLogo.js"), "utf8"), context);
const sha512 = createHash("sha512").update(readFileSync(path.join(root, "img/avatar.svg"))).digest("hex").slice(0, 64);
const address = "blog-address";
const profile = (name, target) => ({
  name, tld: "epix", avatar: "https://example.test/" + name + ".png",
  dns_records: [{record_type: 65280, value: target}]
});

test("logo settings use the standalone blog's existing data index", () => {
  const schema = JSON.parse(readFileSync(path.join(root, "dbschema.json"), "utf8"));
  // EpixNet reserves schema version 3 for merger xites.
  assert.equal(schema.version, 2);
  const fields = schema.maps["data.json"].to_keyvalue;
  for (const key of ["title", "description", "owner_xid", "logo_image"]) assert.ok(fields.includes(key));
  assert.deepEqual(schema.maps["data.json"].to_table, ["post"]);
});

function setup(prefs = {}) {
  const manifest = {domain: "styro.epix", files: {"img/avatar.svg": {sha512}}};
  const calls = [];
  const page = {
    site_info: {address, settings: {own: false}, content: manifest, auth_address: "reader", cert_user_id: "reader@xid.epix"},
    data: {},
    async cmd(command, params) {
      if (command === "wrapperGetLocalStorage") return structuredClone(prefs);
      if (command === "wrapperSetLocalStorage") {
        for (const key of Object.keys(prefs)) delete prefs[key];
        Object.assign(prefs, params);
        return null;
      }
      const [arg] = params;
      calls.push([command, arg]);
      if (command === "fileGet" && arg === "content.json") return JSON.stringify(manifest);
      assert.equal(command, "xidResolveName");
      return profile(arg.split(".")[0], address);
    }
  };
  const logo = Object.create(context.window.BlogLogo.prototype);
  const images = [];
  Object.assign(logo, {page, fallback: "img/avatar.svg", controls: {}, reset: {}, display(src) { images.push(src); }});
  return {logo, page, manifest, calls, images};
}

test("readers share the avatar of the signed domain that points back to this blog", async () => {
  const prefs = {};
  const {logo, page, calls, images} = setup(prefs);
  await logo.refresh();
  assert.equal(images.at(-1), profile("styro", address).avatar);
  assert.equal(logo.controls.hidden, true);
  Object.assign(page.site_info, {auth_address: null, cert_user_id: null});
  delete prefs.blogLogoProfile; // Anonymous visitors have a separate wrapper slot.
  await logo.refresh();
  const visit = [["fileGet", "content.json"], ["xidResolveName", "styro.epix"]];
  assert.deepEqual(calls, [...visit, ...visit]);
});

test("an alias, an unrelated DNS target, and an existing custom logo retain local artwork", async () => {
  const {logo, page, manifest, calls, images} = setup();
  delete manifest.domain;
  page.site_info.canonical_domain = "alias.epix";
  await logo.refresh();
  assert.deepEqual(calls, []);
  manifest.xid_name = "styro.epix";
  manifest.files["img/avatar.svg"].sha512 = "custom";
  await logo.refresh();
  assert.equal(calls.length, 1);
  page.cmd = async command => command === "fileGet"
    ? JSON.stringify({files: {"img/avatar.svg": {sha512}}})
    : profile("styro", "another-blog");
  await logo.refresh(true);
  assert.ok(images.every(url => !url));
});

test("an uploaded logo wins over an in-flight domain lookup and resets to the owner selection", async () => {
  const {logo, page, manifest, images} = setup();
  let reply;
  const cmd = page.cmd;
  page.cmd = async (command, params) => command === "xidResolveName"
    ? new Promise(resolve => { reply = resolve; }) : cmd(command, params);
  const lookup = logo.refresh();
  await new Promise(setImmediate);
  const png = "data:image/png;base64,iVBORw0KGgo=";
  page.data = {logo_image: png, owner_xid: "writer.epix"};
  await logo.refresh();
  reply(profile("styro", address));
  await lookup;
  assert.equal(images.at(-1), png);
  delete page.data.logo_image;
  page.cmd = async (command, params) => {
    if (command !== "xidResolveName") return cmd(command, params);
    const [arg] = params;
    assert.equal(arg, "writer.epix");
    return profile("writer", "another-blog");
  };
  await logo.refresh();
  assert.equal(images.at(-1), profile("writer").avatar);
});

test("a warm logo skips name resolution, scoped to the signed blog, logo mode and revision", async () => {
  const prefs = {theme: "dark"};
  const first = setup(prefs);
  await first.logo.refresh();
  assert.equal(prefs.theme, "dark");
  assert.equal(prefs.blogLogoProfile.avatar, profile("styro", address).avatar);
  const next = setup(prefs);
  await next.logo.refresh();
  assert.deepEqual(next.calls, [["fileGet", "content.json"]]);
  assert.equal(next.images.at(-1), prefs.blogLogoProfile.avatar);
  next.page.data.owner_xid = "styro.epix";
  await next.logo.refresh();
  assert.equal(next.calls.at(-1)[0], "xidResolveName");
  const owner = setup(prefs);
  owner.page.data.owner_xid = "styro.epix";
  await owner.logo.refresh();
  assert.deepEqual(owner.calls, []);
  assert.equal(owner.images.at(-1), prefs.blogLogoProfile.avatar);
  owner.manifest.modified = 12;
  await owner.logo.refresh();
  assert.equal(owner.calls.at(-1)[0], "xidResolveName");
  owner.page.site_info.address = "another-blog";
  await owner.logo.refresh();
  assert.equal(owner.calls.length, 2);
});

test("cached domain avatars cannot override custom art or survive a revoked DNS link", async () => {
  const prefs = {};
  const first = setup(prefs);
  await first.logo.refresh();
  const next = setup(prefs);
  next.manifest.files["img/avatar.svg"].sha512 = "custom";
  await next.logo.refresh();
  assert.equal(next.images.at(-1), "");
  next.manifest.files["img/avatar.svg"].sha512 = sha512;
  const cmd = next.page.cmd;
  next.page.cmd = async (name, params) => name === "xidResolveName" ? profile("styro", "unrelated") : cmd(name, params);
  await next.logo.refresh(true);
  assert.equal(next.images.at(-1), "");
  assert.equal(prefs.blogLogoProfile, undefined);
});

test("the SDK's wrapped storage keeps its shape and unrelated preferences on a warm visit", async () => {
  const prefs = [{theme: "dark"}];
  await setup(prefs).logo.refresh();
  assert.equal(prefs.length, 1);
  assert.equal(prefs[0].theme, "dark");
  assert.equal(prefs[0].blogLogoProfile.avatar, profile("styro", address).avatar);
  const next = setup(prefs);
  await next.logo.refresh();
  assert.deepEqual(next.calls, [["fileGet", "content.json"]]);
  assert.equal(next.images.at(-1), prefs[0].blogLogoProfile.avatar);
});

test("an expired mapping or an unsafe cached URL cannot bypass profile verification", async () => {
  const prefs = {};
  await setup(prefs).logo.refresh();
  prefs.blogLogoProfile.verified -= 6 * 60 * 1000;
  const expired = setup(prefs);
  await expired.logo.refresh();
  assert.equal(expired.calls.at(-1)[0], "xidResolveName");
  prefs.blogLogoProfile.avatar = "https://secret@example.test/photo";
  const unsafe = setup(prefs);
  await unsafe.logo.refresh();
  assert.equal(unsafe.calls.at(-1)[0], "xidResolveName");
  assert.equal(unsafe.images.at(-1), profile("styro", address).avatar);
});

test("refreshing an open blog rechecks the profile when its cached mapping expires", async () => {
  let now = Date.now();
  context.Date = class extends Date { static now() { return now; } };
  try {
    const {logo, calls} = setup();
    await logo.refresh();
    await logo.refresh();
    now += 6 * 60 * 1000;
    await logo.refresh();
    assert.equal(calls.filter(([name]) => name === "xidResolveName").length, 2);
  } finally {
    delete context.Date;
  }
});

test("a gateway without wrapper storage still resolves and displays the logo", async () => {
  const {logo, page, calls, images} = setup();
  const cmd = page.cmd;
  page.cmd = (name, params) => name === "wrapperGetLocalStorage" ? new Promise(() => {}) : cmd(name, params);
  await logo.refresh();
  assert.equal(images.at(-1), profile("styro", address).avatar);
  assert.equal(calls.at(-1)[0], "xidResolveName");
});

test("an account switch during verification does not copy cache entries into another reader's storage", async () => {
  const prefs = {theme: "dark"};
  const {logo, page, images} = setup(prefs);
  const cmd = page.cmd;
  page.cmd = (name, params) => {
    if (name === "xidResolveName") page.site_info.auth_address = "different-reader";
    return cmd(name, params);
  };
  await logo.refresh();
  assert.equal(images.at(-1), profile("styro", address).avatar);
  assert.deepEqual(prefs, {theme: "dark"});
});

test("the current source waits for both a pending xID lookup and its thumbnail", async () => {
  const {logo, page} = setup();
  const cmd = page.cmd;
  let lookup, paint, source;
  page.data.owner_xid = "writer.epix";
  page.cmd = (name, args) => name === "xidResolveName" ? new Promise(resolve => { lookup = resolve; }) : cmd(name, args);
  logo.image = {decode: async () => {}, getAttribute: () => source};
  logo.display = avatar => {
    source = logo.fallback;
    if (avatar) return new Promise(resolve => { paint = () => { source = avatar; resolve(); }; });
  };
  const active = logo.refresh();
  let selected = false;
  const selection = logo.currentSource().then(value => { selected = true; return value; });
  await new Promise(setImmediate);
  assert.equal(selected, false);
  lookup(profile("writer", address));
  await new Promise(setImmediate);
  assert.equal(selected, false);
  paint();
  await active;
  assert.equal(await selection, profile("writer", address).avatar);
});

test("a pending source selection follows a superseding upload and rejects an unavailable explicit xID", async () => {
  const {logo, page} = setup();
  const cmd = page.cmd;
  let source;
  page.data.owner_xid = "writer.epix";
  page.cmd = (name, args) => name === "xidResolveName" ? new Promise(() => {}) : cmd(name, args);
  logo.image = {decode: async () => {}, getAttribute: () => source};
  logo.display = value => { source = value || logo.fallback; };
  const selection = logo.currentSource();
  await new Promise(setImmediate);
  page.data.logo_image = "data:image/png;base64,iVBORw0KGgo=";
  await logo.refresh();
  assert.equal(await selection, page.data.logo_image);
  delete page.data.logo_image;
  page.cmd = (name, args) => name === "xidResolveName" ? Promise.resolve(null) : cmd(name, args);
  await assert.rejects(logo.currentSource(), /selected xID avatar is unavailable/);
});

test("a visitor cannot save branding even if the edit handler is called directly", async () => {
  const {logo, calls} = setup();
  await logo.save(() => { throw new Error("visitor reached the editor"); });
  assert.deepEqual(calls, []);
});
