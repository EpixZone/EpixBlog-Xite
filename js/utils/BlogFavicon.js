(function () {
  "use strict";

  const defaultIcon = "img/favicon.ico";
  const originalKey = "blog_favicon_original";

  function localImage(path) {
    return typeof path === "string" && !/[:\\%?#\x00-\x1f]/.test(path) &&
      path.split("/").every(part => part && part !== "." && part !== "..") &&
      /\.(ico|png|svg|jpe?g|webp|gif)$/i.test(path);
  }

  async function copyRemoteLogo(url) {
    const limit = 5 * 1024 * 1024;
    const response = await fetch(url, {credentials: "omit", referrerPolicy: "no-referrer",
      mode: "cors", signal: AbortSignal.timeout(10000)});
    if (!response.ok || !response.body) throw new Error();
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(value);
    }
    return BlogLogo.makeLogo(new Blob(chunks));
  }

  class BlogFavicon {
    constructor(page, controls) {
      this.page = page;
      this.controls = controls;
      this.link = document.querySelector('link[rel="icon"]');
      const file = controls.querySelector(".blog-favicon-file");
      file.onchange = () => {
        const selection = file.files[0];
        file.value = "";
        if (selection) this.save(async () => ({png: await BlogLogo.makeLogo(selection)}));
      };
      controls.querySelector(".use-blog-logo").onclick = () => this.save(() => this.currentLogo());
      controls.querySelector(".reset-blog-favicon").onclick = () => this.save(() => ({reset: true}));
    }

    canEdit() {
      const info = this.page.site_info;
      return !!(info?.settings?.own || info?.privatekey);
    }

    needsPublish() {
      const content = this.page.site_info?.content;
      return !!this.pendingPublish || (content?.blog_favicon_edited_from != null &&
        content.blog_favicon_edited_from === content.modified);
    }

    refresh() {
      this.controls.hidden = !this.canEdit();
      const path = this.pendingPublish?.path || this.page.site_info?.content?.favicon;
      this.link.setAttribute("href", localImage(path) ? path : defaultIcon);
    }

    async currentLogo() {
      const source = await this.page.blogLogo.currentSource();
      if (localImage(source)) return {path: source};
      let png = source;
      if (/^https?:\/\//i.test(source)) {
        const url = new URL(source);
        if (!url.username && !url.password) {
          png = await EpixAvatar.get(source, 64, this.page);
          if (!png) png = await copyRemoteLogo(source).catch(() => null);
        }
      }
      if (!png || png.length > 100000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(png)) {
        throw new Error("This logo cannot be copied. Upload the image from your device instead.");
      }
      return {png};
    }

    async readManifest() {
      const raw = await this.page.cmd("fileGet", ["content.json"]);
      const manifest = typeof raw === "string" && JSON.parse(raw);
      if (!manifest || manifest.address !== this.page.site_info?.address) {
        throw new Error("Could not read the blog manifest.");
      }
      return manifest;
    }

    async write(path, base64) {
      if (!this.canEdit()) throw new Error("Only the blog owner can change its tab icon.");
      const result = await this.page.cmd("fileWrite", [path, base64]);
      if (result !== "ok") throw new Error("Could not save " + path + ".");
    }

    async imagePath(manifest, published) {
      const protectedPaths = [published, manifest.favicon, manifest[originalKey]];
      const slots = (manifest.blog_favicon_slots || []).filter(path =>
        /^img\/blog-favicon-[0-9a-f]{32}\.png$/.test(path));
      const spare = slots.find(path => !protectedPaths.includes(path));
      if (spare) return spare;
      // Reserve a small pool owned by this control. Never adopt an existing
      // clone file just because its name resembles one of our images.
      const suffix = Array.from(crypto.getRandomValues(new Uint8Array(16)),
        byte => byte.toString(16).padStart(2, "0")).join("");
      const path = "img/blog-favicon-" + suffix + ".png";
      if (protectedPaths.includes(path) || manifest.files?.[path] ||
          await this.page.cmd("fileGet", [path, false, "base64"]) != null) {
        throw new Error("The image path is already in use. Try again.");
      }
      return path;
    }

    async save(choose) {
      if (!this.canEdit() || this.controls.disabled) return;
      this.controls.disabled = true;
      let newImage;
      try {
        const icon = await choose();
        let manifest = await this.readManifest();
        const draft = manifest.blog_favicon_edited_from != null &&
          manifest.blog_favicon_edited_from === manifest.modified;
        const published = draft ? manifest.blog_favicon_published : manifest.favicon;
        let path = icon.path;
        if (icon.png) {
          path = await this.imagePath(manifest, published);
          await this.write(path, icon.png.split(",")[1]);
          if (!manifest.blog_favicon_slots?.includes(path)) newImage = path;
          const latest = await this.readManifest();
          if (latest.favicon !== manifest.favicon || latest.modified !== manifest.modified) {
            throw new Error("The tab icon changed. Try again.");
          }
          manifest = latest;
          const slots = manifest.blog_favicon_slots || [];
          if (!slots.includes(path)) manifest.blog_favicon_slots = [...slots, path];
        }
        if (icon.reset) {
          if (!Object.hasOwn(manifest, originalKey)) return;
          path = manifest[originalKey];
          if (typeof path === "string") manifest.favicon = path;
          else delete manifest.favicon;
          delete manifest[originalKey];
        } else {
          if (manifest.favicon === path) return;
          if (!Object.hasOwn(manifest, originalKey)) manifest[originalKey] = manifest.favicon ?? null;
          manifest.favicon = path;
        }
        // Signing advances modified. Keep the publish button available if
        // the owner reloads an unsigned draft before publishing it.
        manifest.blog_favicon_edited_from = manifest.modified;
        manifest.blog_favicon_published = published ?? null;
        const json = JSON.stringify(manifest, null, 1) + "\n";
        await this.write("content.json", btoa(unescape(encodeURIComponent(json))));
        newImage = null;
        this.pendingPublish = {path: path || defaultIcon};
        this.refresh();
        this.page.checkPublishbar();
      } catch (error) {
        if (newImage && this.canEdit()) {
          try {
            const current = await this.readManifest();
            if (!current.files?.[newImage] && !current.blog_favicon_slots?.includes(newImage) && current.favicon !== newImage) {
              await this.page.cmd("fileDelete", [newImage]);
            }
          } catch { /* Keep the image if the current manifest cannot be checked. */ }
        }
        this.page.cmd("wrapperNotification", ["error", error.message || "Unable to change the tab icon."]);
      } finally {
        this.controls.disabled = false;
      }
    }
  }

  window.BlogFavicon = BlogFavicon;
})();
