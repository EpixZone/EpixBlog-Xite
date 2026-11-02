const assert = require("node:assert/strict");
const {createHash} = require("node:crypto");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const {test} = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({window: {}});
vm.runInContext(readFileSync(path.join(root, "js/utils/BlogLogo.js"), "utf8"), context);
const sha512 = createHash("sha512").update(readFileSync(path.join(root, "img/avatar.svg"))).digest("hex").slice(0, 64);
const address = "blog-address";
const profile = (name, target) => ({
  name, tld: "epix", avatar: "https://example.test/" + name + ".png",
  dns_records: [{record_type: 65280, value: target}]
});

function setup() {
  const manifest = {domain: "styro.epix", files: {"img/avatar.svg": {sha512}}};
  const calls = [];
  const page = {
    site_info: {address, settings: {own: false}, content: manifest, auth_address: "reader", cert_user_id: "reader@xid.epix"},
    data: {},
    async cmd(command, [arg]) {
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
  const {logo, page, calls, images} = setup();
  await logo.refresh();
  assert.equal(images.at(-1), profile("styro", address).avatar);
  assert.equal(logo.controls.hidden, true);
  Object.assign(page.site_info, {auth_address: null, cert_user_id: null});
  await logo.refresh();
  assert.deepEqual(calls, [["fileGet", "content.json"], ["xidResolveName", "styro.epix"]]);
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
  page.cmd = async command => command === "fileGet"
    ? JSON.stringify(manifest) : new Promise(resolve => { reply = resolve; });
  const lookup = logo.refresh();
  await new Promise(setImmediate);
  const png = "data:image/png;base64,iVBORw0KGgo=";
  page.data = {logo_image: png, owner_xid: "writer.epix"};
  await logo.refresh();
  reply(profile("styro", address));
  await lookup;
  assert.equal(images.at(-1), png);
  delete page.data.logo_image;
  page.cmd = async (command, [arg]) => {
    assert.equal(command, "xidResolveName");
    assert.equal(arg, "writer.epix");
    return profile("writer", "another-blog");
  };
  await logo.refresh();
  assert.equal(images.at(-1), profile("writer").avatar);
});

test("a visitor cannot save branding even if the edit handler is called directly", async () => {
  const {logo, calls} = setup();
  await logo.save(() => { throw new Error("visitor reached the editor"); });
  assert.deepEqual(calls, []);
});
