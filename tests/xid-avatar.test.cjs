const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const wrapperOrigin = "https://blog.epix";

function setup(pageClass = "page-main", embedded = false) {
  const nodes = [], calls = [];
  function node(tag, attrs = {}, parent = null) {
    const item = { tag, attrs, parent, children: [], handlers: {}, style: {}, value: "", removed: false };
    item.setAttribute = (key, value) => {
      attrs[key] = value;
      if (key === "src" && item.painted) item.painted(value);
    };
    item.removeAttribute = key => { delete attrs[key]; };
    nodes.push(item);
    if (parent) parent.children.push(item);
    return item;
  }
  const body = node("body", { class: pageClass });
  const actions = node("div", { class: "identity-actions" }, body);
  node("a", { class: "feed-follow" }, actions);
  const username = node("a", { class: "certselect user_name" }, body);
  const comment = node("div", { class: "comment-new" }, body);
  const live = item => !item.removed && (!item.parent || live(item.parent));
  const classes = item => (item.attrs.class || "").split(/\s+/);
  const matches = (item, selector) => selector.split(",").some(part => {
    const value = part.trim();
    return value.startsWith(".") ? value.slice(1).split(".").every(c => classes(item).includes(c)) : item.tag === value;
  });
  const text = item => item.value + item.children.filter(live).map(text).join("");
  // The production code uses only these small HTML fragments. Parsing their
  // attributes also exposes accidental interpolation into an event attribute.
  function fragment(html) {
    const holder = node("fragment"), stack = [holder];
    for (const token of html.match(/<[^>]*>|[^<]+/g) || []) {
      if (token.startsWith("</")) { stack.pop(); continue; }
      const open = token.match(/^<([\w-]+)([\s\S]*?)\/?\s*>$/);
      if (!open) { stack.at(-1).value += token; continue; }
      const attrs = {};
      for (const match of open[2].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
        attrs[match[1]] = match[2] ?? match[3] ?? match[4];
      }
      const item = node(open[1], attrs, stack.at(-1));
      if (!["img", "br", "input"].includes(item.tag)) stack.push(item);
    }
    return holder.children;
  }
  function wrap(items) {
    const result = { items, length: items.length, 0: items[0] };
    result.attr = (key, value) => {
      if (typeof key === "string" && value === undefined) return items[0]?.attrs[key];
      for (const item of items) Object.assign(item.attrs, typeof key === "object" ? key : { [key]: value });
      return result;
    };
    result.css = (key, value) => {
      for (const item of items) Object.assign(item.style, typeof key === "object" ? key : { [key]: value });
      return result;
    };
    result.text = value => {
      if (value === undefined) return items.map(text).join("");
      for (const item of items) { item.value = String(value); item.children.forEach(c => { c.removed = true; }); }
      return result;
    };
    result.on = (event, handler) => { items.forEach(item => { item.handlers[event] = handler; }); return result; };
    result.remove = () => { items.forEach(item => { item.removed = true; }); return result; };
    result.hasClass = value => items.length > 0 && classes(items[0]).includes(value);
    for (const method of ["addClass", "removeClass"]) result[method] = value => {
      for (const item of items) {
        const values = new Set(classes(item));
        if (method === "addClass") values.add(value); else values.delete(value);
        item.attrs.class = [...values].join(" ");
      }
      return result;
    };
    for (const method of ["append", "before"]) result[method] = value => {
      for (const item of value.items || fragment(value)) {
        item.parent = method === "append" ? items[0] : items[0].parent;
        if (method === "append") item.parent.children.push(item);
        else item.parent.children.splice(item.parent.children.indexOf(items[0]), 0, item);
      }
      return result;
    };
    return result;
  }
  function $(selector) {
    if (typeof selector === "object") return wrap([selector]);
    if (selector.startsWith("<")) return wrap(fragment(selector));
    return wrap(nodes.filter(item => live(item) && matches(item, selector)));
  }
  $.when = () => ({ done() {} });
  const context = vm.createContext({
    window: { EpixFrame: class { log() {} }, location: { search: "" } },
    $, LogMixin: { log() {} }, Text: { toColor: () => "purple" }, setTimeout() {},
  });
  context.window.parent = embedded ? { postMessage(message, target, [port]) {
    calls.push({ command: message.cmd, params: message.params, target, cb(value) { port.postMessage(value); port.close(); } });
  } } : context.window;
  context.MessageChannel = MessageChannel;
  context.URL = URL;
  context.clearTimeout = () => {};
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/lib/epix-avatar.js"), "utf8"), context);
  context.EpixAvatar = context.window.EpixAvatar;
  for (const file of ["js/utils/User.js", "js/EpixBlog.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  }
  const user = context.User = context.window.User;
  const page = context.Page = context.window.Page;
  Object.assign(page, {
    site_info: null, event_site_info: { resolve() {} },
    cmd(command, params, cb) {
      if (command === "fileRules") return cb({});
      if (command === "wrapperAvatarThumbnailVersion") return cb({ version: 1, origin: wrapperOrigin });
      calls.push({ command, params, cb });
    },
    initFollowButton() { this.follow = { feeds: {} }; }, migrateRecords() {},
  });
  const take = command => {
    const index = calls.findIndex(call => call.command === command);
    assert.notEqual(index, -1, `expected ${command}; got ${calls.map(call => call.command)}`);
    return calls.splice(index, 1)[0];
  };
  const find = selector => nodes.filter(item => live(item) && matches(item, selector));
  return { user, page, calls, take, find, text, username, comment };
}

const identity = name => ({
  address: "epix1sandboxblog", auth_address: `epix1sandbox${name}`,
  cert_user_id: `${name}@xid.epix`, xid_directory: `${name}.epix`, settings: { own: false },
});
const profile = (name, avatar = `https://images.example.test/${name}.png`) => ({ name, tld: "epix", avatar });

test("homepage resolves the selected reader's avatar without opening the picker", async () => {
  const { page, take, find, calls, text } = setup();
  page.setSiteinfo(identity("alice"));
  const lookup = take("xidResolve");
  assert.equal(lookup.params[0], "epix1sandboxalice");
  lookup.cb(profile("alice"));
  assert.equal(find(".xid-tag").length, 1);
  assert.equal(text(find(".xid-tag")[0]), "alice.epix");
  await new Promise(setImmediate);
  assert.equal(find("img")[0].attrs.src, profile("alice").avatar);
  assert.equal(calls.some(call => call.command === "certXid"), false);
});

test("anonymous homepage and an unavailable profile do not prompt while reading", () => {
  const anonymous = setup();
  anonymous.page.setSiteinfo({ address: "epix1sandboxblog", auth_address: null, cert_user_id: null });
  assert.equal(anonymous.find(".xid-fab").length, 1);
  assert.equal(anonymous.calls.some(call => call.command === "certXid"), false);
  const missing = setup();
  missing.page.setSiteinfo(identity("alice"));
  missing.take("xidResolve").cb(null);
  assert.equal(missing.find(".xid-fab").length, 1);
  assert.equal(missing.calls.some(call => call.command === "certXid"), false);
});

test("post pages retain their existing automatic xID prompt", () => {
  const { page, take } = setup("page-post");
  page.setSiteinfo({ address: "epix1sandboxblog", auth_address: "epix1anonymous", cert_user_id: null });
  take("certXid");
});

test("homepage identity changes clear the old photo before the new lookup completes", async () => {
  const { page, user, take, find, text } = setup();
  page.setSiteinfo(identity("alice")); take("xidResolve").cb(profile("alice"));
  page.setSiteinfo({ ...identity("bob"), event: ["cert_changed"] });
  assert.equal(find(".xid-tag").length, 0);
  assert.equal(user.xid_avatar, null);
  take("xidResolve").cb(profile("bob"));
  assert.equal(text(find(".xid-tag")[0]), "bob.epix");
  await new Promise(setImmediate);
  assert.equal(find("img")[0].attrs.src, profile("bob").avatar);
});

test("late old-identity replies cannot replace the current badge", async () => {
  const { page, take, find, text } = setup();
  page.setSiteinfo(identity("alice")); const old = take("xidResolve");
  page.setSiteinfo(identity("bob")); take("xidResolve").cb(profile("bob"));
  old.cb(profile("alice"));
  assert.equal(text(find(".xid-tag")[0]), "bob.epix");
  await new Promise(setImmediate);
  assert.equal(find("img")[0].attrs.src, profile("bob").avatar);
});

test("logout clears both a displayed avatar and any pending lookup", () => {
  const { page, user, take, find } = setup();
  page.setSiteinfo(identity("alice")); take("xidResolve").cb(profile("alice"));
  user.resolveMyXidName(); const pending = take("xidResolve");
  page.setSiteinfo({ auth_address: null, cert_user_id: null, xid_directory: null, event: ["cert_changed"] });
  pending.cb(profile("alice"));
  assert.equal(user.xid_avatar, null);
  assert.equal(user.xid_name, null);
  assert.equal(find(".xid-tag").length, 0);
  assert.equal(find("img").length, 0);
  assert.equal(find(".xid-fab").length, 1);
});

test("ordinary homepage progress updates do not restart profile lookups", () => {
  const { page, take, calls } = setup();
  page.setSiteinfo({ ...identity("alice"), event: ["cert_changed"] });
  take("xidResolve").cb(profile("alice"));
  page.setSiteinfo({ peers: 3 });
  assert.equal(calls.some(call => call.command === "xidResolve"), false);
});

test("avatar values stay opaque image attributes and names stay text", async () => {
  const { user, find, text } = setup();
  const avatar = 'https://images.example.test/a.png" onload="unexpected()';
  const display = 'reader<img src="unexpected">.epix';
  user.xid_avatar = avatar;
  user.showXidTag(display);
  const images = find("img");
  assert.equal(images.length, 1);
  await new Promise(setImmediate);
  assert.equal(images[0].attrs.src, avatar);
  assert.equal(images[0].attrs.onload, undefined);
  assert.equal(images[0].attrs.onerror, undefined);
  assert.equal(images[0].attrs.referrerpolicy, "no-referrer");
  assert.equal(text(find(".xid-tag")[0]), display);
});

test("profile URL formats are preserved like the xID profile editor", async () => {
  for (const avatar of ["https://images.example.test/a.png", "http://photos.epix/a.png",
    "images/reader.png", "data:image/png;base64,iVBORw0KGgo=", "ipfs://example/avatar.png", "epix://photos.epix/avatar.png"]) {
    const { user, find } = setup();
    user.xid_avatar = avatar; user.showXidTag("reader.epix");
    await new Promise(setImmediate);
    assert.equal(find("img")[0].attrs.src, avatar);
  }
});

test("missing and broken avatars retain a readable named badge", () => {
  const { user, find, text } = setup();
  user.xid_avatar = ""; user.showXidTag("reader.epix");
  assert.equal(find("img").length, 0);
  assert.equal(text(find(".xid-tag")[0]), "reader.epix");
  user.xid_avatar = "https://images.example.test/missing.png"; user.showXidTag("reader.epix");
  const image = find("img")[0];
  assert.equal(typeof image.handlers.error, "function");
  image.handlers.error.call(image);
  assert.equal(find("img").length, 0);
  assert.equal(text(find(".xid-tag")[0]), "reader.epix");
});

test("a late broken image event from the previous badge cannot remove the new avatar", async () => {
  const { user, find, text } = setup();
  user.xid_avatar = "https://images.example.test/old.png"; user.showXidTag("old.epix");
  const old = find("img")[0];
  user.xid_avatar = "https://images.example.test/new.png"; user.showXidTag("new.epix");
  old.handlers.error.call(old);
  await new Promise(setImmediate);
  assert.equal(find("img")[0].attrs.src, "https://images.example.test/new.png");
  assert.equal(text(find(".xid-tag")[0]), "new.epix");
});


test("an embedded reader badge displays the node thumbnail for its 20px slot", { timeout: 3000 }, async () => {
  const { page, take, find } = setup("page-main", true);
  page.setSiteinfo(identity("alice"));
  take("xidResolve").cb(profile("alice"));
  await new Promise(setImmediate);
  const request = take("wrapperGetAvatarThumbnail");
  assert.equal(request.target, wrapperOrigin);
  assert.equal(request.params.url, profile("alice").avatar);
  assert.equal(request.params.size, 20);
  const image = find("img")[0];
  assert.equal(image.attrs.src, undefined);
  const thumbnail = "data:image/png;base64,QQ==";
  const painted = new Promise(resolve => { image.painted = resolve; });
  request.cb({ thumbnail });
  await painted;
  assert.equal(image.attrs.src, thumbnail);
});
