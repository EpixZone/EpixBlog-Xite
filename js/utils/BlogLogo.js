(function () {
  "use strict";

  const stockLogo = "img/avatar.svg";
  const stockHash = "0a53504be581d58cc7e918d0d60d43d77ecba5ec14ecd1885d43b3a9c2e9345f";
  const stockBlake3 = "40ed220dba37722d397b72f84066e299f47f07d2ad7817d8caa683d1cbf0e21c";
  const profileCacheAge = 5 * 60 * 1000;

  function cacheableAvatar(source) {
    if (typeof source !== "string" || !source || source.length > 2048) return false;
    try {
      const url = new URL(source);
      return /^https?:$/.test(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }

  function profileName(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
  }

  async function makeLogo(file) {
    const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const header = String.fromCharCode(...signature);
    if (file.size > 5 * 1024 * 1024 || !(header.startsWith("\x89PNG\r\n\x1a\n") ||
        header.startsWith("\xff\xd8\xff") || (header.startsWith("RIFF") && header.slice(8) === "WEBP"))) {
      throw new Error("Choose a PNG, JPEG or WebP image up to 5 MB.");
    }
    const image = await createImageBitmap(file).catch(() => { throw new Error("This image could not be opened."); });
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const size = Math.min(image.width, image.height);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, 128, 128);
      return canvas.toDataURL("image/png");
    } finally {
      image.close();
    }
  }

  class BlogLogo {
    constructor(page) {
      this.page = page;
      this.image = document.querySelector(".avatar-link img.avatar");
      this.fallback = this.image.getAttribute("src");
      this.controls = document.querySelector(".blog-logo-controls");
      this.file = this.controls.querySelector(".blog-logo-file");
      this.reset = this.controls.querySelector(".reset-blog-logo");
      this.controls.querySelector(".use-owner-xid").onclick = () => this.useProfile();
      this.file.onchange = () => {
        const file = this.file.files[0];
        this.file.value = "";
        if (file) this.save(async () => ({logo_image: await makeLogo(file)}));
      };
      this.reset.onclick = () => this.save(() => ({logo_image: null, owner_xid: null}));
    }

    canEdit() {
      const info = this.page.site_info;
      return !!(info?.settings?.own || info?.privatekey);
    }

    useProfile() {
      if (!this.canEdit()) return;
      const info = this.page.site_info;
      if (!info.cert_user_id) {
        User.triggerCertXid(() => this.useProfile());
        return;
      }
      const address = info.auth_address;
      this.save(async () => {
        const profile = await this.page.cmd("xidResolve", [address]);
        if (address !== this.page.site_info.auth_address || !profile?.name || !profile.tld) {
          throw new Error("Could not verify the selected xID.");
        }
        return {owner_xid: profile.name + "." + profile.tld, logo_image: null};
      });
    }

    async save(change) {
      if (!this.canEdit() || this.controls.disabled) return;
      this.controls.disabled = true;
      try {
        const values = await change();
        const raw = await this.page.cmd("fileGet", ["data/data.json"]);
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.post)) throw new Error("Unable to read the blog data.");
        if (!this.canEdit()) return;
        for (const [key, value] of Object.entries(values)) {
          if (value === null) delete data[key];
          else data[key] = value;
        }
        const saved = await new Promise(resolve => this.page.writeBlogData(data, resolve));
        if (saved) {
          Object.assign(this.page.data, values);
          this.pendingPublish = values;
          this.refresh();
          this.page.checkPublishbar();
        }
      } catch (error) {
        this.page.cmd("wrapperNotification", ["error", error.message || "Unable to save the blog logo."]);
      } finally {
        this.controls.disabled = false;
      }
    }

    display(source, profile = false) {
      // A request for the old image can finish after the owner changes the logo.
      const image = this.image.cloneNode(false);
      const showFallback = () => {
        image.onerror = null;
        // The gateway needs the referring blog page to serve its local artwork.
        image.referrerPolicy = "same-origin";
        image.src = this.fallback;
      };
      showFallback();
      this.image.replaceWith(image);
      this.image = image;
      if (!source) return;
      image.onerror = showFallback;
      if (profile) return EpixAvatar.bind(image, source, image.offsetWidth || 72);
      image.src = source;
    }

    async currentSource() {
      const ready = this.refresh();
      const request = this.request;
      if (!request) throw new Error("The blog logo has not loaded yet.");
      await ready;
      if (this.request !== request) return this.currentSource();
      const image = this.image;
      try {
        await Promise.race([image.decode(), request.replaced]);
      } catch {
        if (this.request === request && this.image === image) throw new Error("The blog logo could not be loaded.");
      }
      if (this.request !== request || image !== this.image) return this.currentSource();
      const source = image.getAttribute("src");
      if (request.owner && !request.upload && source === this.fallback) throw new Error("The selected xID avatar is unavailable.");
      return source;
    }

    async readStorage() {
      // The xite can run in an opaque iframe. Its wrapper owns site-scoped
      // storage. A legacy gateway with no storage reply must still load logos.
      let timer;
      try {
        const value = await Promise.race([
          this.page.cmd("wrapperGetLocalStorage", {}),
          new Promise(resolve => { timer = setTimeout(resolve, 250); })
        ]);
        const params = value === null ? {} : value;
        // EpixFrame.setLocalStorage wraps a preferences object in a one-item
        // array. Keep that shape for clones using the convenience method.
        const prefs = Array.isArray(params) && params.length === 1 ? params[0] : params;
        if (prefs && typeof prefs === "object" && !Array.isArray(prefs) && !prefs.error) return {params, prefs};
      } catch {
        // Storage is optional.
      } finally {
        clearTimeout(timer);
      }
      return null;
    }

    async cacheProfile(request, key, avatar) {
      // Re-read before writing so a slow profile lookup doesn't overwrite
      // preferences that changed in the meantime.
      const storage = await this.readStorage();
      if (!storage || this.request !== request || request.identity !== this.page.site_info.auth_address) return;
      if (cacheableAvatar(avatar)) {
        storage.prefs.blogLogoProfile = {key, avatar, verified: Date.now()};
      } else if (storage.prefs.blogLogoProfile?.key === key) {
        delete storage.prefs.blogLogoProfile;
      } else {
        return;
      }
      // The wrapper stores the params themselves. Only the verified URL
      // lives here; EpixAvatar continues to obtain pixels from the node.
      this.page.cmd("wrapperSetLocalStorage", storage.params).catch(() => {});
    }

    async refresh(force = false) {
      const {data, site_info: info} = this.page;
      this.controls.hidden = !this.canEdit() || !data;
      if (!data || !info?.address) return;
      this.reset.hidden = !data.owner_xid && !data.logo_image;
      const upload = typeof data.logo_image === "string" && data.logo_image.length < 100000 &&
        /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(data.logo_image) ? data.logo_image : "";
      const owner = profileName(data.owner_xid);
      const name = owner || profileName(info.content?.domain) || profileName(info.content?.xid_name);
      const last = this.request;
      const revision = info.content?.modified;
      if (!force && last && last.upload === upload && last.owner === owner && last.name === name &&
          last.address === info.address && last.revision === revision && last.identity === info.auth_address &&
          (!last.expires || Date.now() < last.expires)) return last.ready;
      const request = this.request = {upload, owner, name, address: info.address, revision, identity: info.auth_address};
      if (last) last.replace();
      request.replaced = new Promise(resolve => { request.replace = resolve; });
      request.ready = Promise.race([this.load(request, force), request.replaced]);
      return request.ready;
    }

    async load(request, force) {
      const {upload, owner, name, address, revision} = request;
      this.display(upload);
      if (upload || !name || (!owner && this.fallback !== stockLogo)) return;
      try {
        const key = JSON.stringify([address, owner, name, revision]);
        const storageRead = this.readStorage();
        if (!owner) {
          // Clones may already have replaced the template's SVG in place.
          const root = JSON.parse(await this.page.cmd("fileGet", ["content.json"]));
          const art = root?.files?.[stockLogo];
          if (this.request !== request || !art || (art.sha512 ? art.sha512 !== stockHash : art.b3 !== stockBlake3)) return;
        }
        const storage = await storageRead;
        const cached = storage?.prefs.blogLogoProfile;
        if (this.request !== request) return;
        const age = Date.now() - cached?.verified;
        if (!force && cached?.key === key && Number.isFinite(cached.verified) && age >= 0 && age < profileCacheAge && cacheableAvatar(cached.avatar)) {
          request.expires = cached.verified + profileCacheAge;
          return this.display(cached.avatar, true);
        }
        const profile = await this.page.cmd("xidResolveName", [name]);
        if (this.request !== request) return;
        request.expires = Date.now() + profileCacheAge;
        // An unrelated domain can point at a blog. Only use the domain the
        // blog itself claims, and verify that its xite record points back.
        const valid = typeof profile?.avatar === "string" && profile.avatar && profile.name + "." + profile.tld === name &&
          (owner || profile.dns_records?.find(r => r.record_type === 65280)?.value?.trim() === address);
        await Promise.all([
          valid ? this.display(profile.avatar, true) : null,
          storage && (valid || cached?.key === key) ? this.cacheProfile(request, key, valid ? profile.avatar : null) : null
        ]);
      } catch {
        // A blog without a reachable profile keeps its local artwork.
      }
    }
  }

  BlogLogo.makeLogo = makeLogo;
  window.BlogLogo = BlogLogo;
})();
