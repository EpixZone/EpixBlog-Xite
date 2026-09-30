(function() {

  class Meditor {
    constructor(tag_original, body) {
      this.tag_original = tag_original;
      // Profile links use a compact toolbar and plain Markdown textarea.
      this.simple = tag_original.classList.contains("links");
      this.mde = null;
      this.removed = false;
      // The raw stored markdown: used verbatim for the automatic first switch
      // to markdown mode, so opening the editor does not normalize the
      // author's markdown through an html round-trip.
      this.initial_markdown = (typeof body == "string") ? body : null;
      this.log("Create", this);

      this.tag_original.insertAdjacentHTML('beforeBegin', "<div class='meditor'></div>");
      this.tag_container = this.tag_original.previousSibling;

      this.tag_container.insertAdjacentHTML('afterBegin', this.tag_original.outerHTML);
      this.tag_original.style.display = "none";
      this.tag = this.tag_container.firstChild;
      this.tag.removeAttribute("data-editable");
      this.tag.removeAttribute("tabindex");
      this.tag.removeAttribute("id");

      if (typeof body === "string") {
        this.tag.innerHTML = marked(body, {gfm: true, breaks: true});
      }

      this.handleEditorLoad = this.handleEditorLoad.bind(this);
      this.handleEditmodeChange = this.handleEditmodeChange.bind(this);
      this.handleImageSave = null;
    }

    load() {
      if (window.AlloyEditor) {
        this.handleEditorLoad();
        return;
      }
      if (!Meditor.loading) {
        Meditor.loading = new Promise(function(resolve, reject) {
          var style = document.createElement("link");
          style.href = "alloy-editor/all.css";
          style.rel = "stylesheet";
          document.head.appendChild(style);
          var script = document.createElement("script");
          script.src = "alloy-editor/all.js";
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      Meditor.loading.then(() => this.handleEditorLoad(), () => {
        Meditor.loading = null;
        this.handleEditorLoad();
      });
    }

    handleEditorLoad() {
      if (this.removed || this.tag_markdown) return;
      var self = this;
      // Create rich text<>markdown edit mode switch button
      this.tag.insertAdjacentHTML('beforeBegin', "<a href='#Markdown' class='meditor-editmode'></a>");
      this.tag_editmode = this.tag.previousSibling;
      this.tag_editmode.onclick = this.handleEditmodeChange;
      this.updateEditmodeLabel();
      this.createToolbar();

      // Create ckeditor
      if (window.AlloyEditor) {
        this.editor = new CustomAlloyEditor(this.tag);
        if (this.handleImageSave) this.editor.handleImageSave = this.handleImageSave;
      } else {
        this.tag_editmode.style.display = "none";
      }

      // Create markdown editor textfield
      this.tag.insertAdjacentHTML('beforeBegin', this.tag_original.outerHTML);
      this.tag_markdown = this.tag.previousSibling;
      this.tag_markdown.removeAttribute("data-editable");
      this.tag_markdown.removeAttribute("tabindex");
      this.tag_markdown.removeAttribute("id");
      this.tag_markdown.innerHTML = "<textarea class='meditor-markdown'></textarea>";
      var label = this.tag_original.getAttribute("data-editable") || "body";
      this.tag_markdown.firstChild.setAttribute("aria-label", label.charAt(0).toUpperCase() + label.slice(1));
      this.autoHeight(this.tag_markdown.firstChild);
      this.tag_markdown.firstChild.oninput = function() {
        if (self.mde) return; // EasyMDE/CodeMirror sizes itself
        self.autoHeight(self.tag_markdown.firstChild);
      };

      this.tag_markdown.style.display = "none";

      // Always begin with the stored source, including compact profile links.
      // This also gives a usable plain editor if the rich editor failed to load.
      this.handleEditmodeChange(null, this.initial_markdown);
      this.setReadOnly(!!this.readOnly);

      // Call onLoad for external scripts
      setTimeout(function() {
        if (!self.removed && self.onLoad) self.onLoad();
      }, 1);
    }

    updateEditmodeLabel() {
      var markdown = this.tag_editmode.classList.contains("markdown");
      if (markdown) {
        this.tag_editmode.innerHTML = "Aa&nbsp; Rich text";
        this.tag_editmode.title = "Switch to rich text editing";
      } else {
        this.tag_editmode.innerHTML = "&lt;/&gt;&nbsp; Markdown";
        this.tag_editmode.title = "Switch to markdown";
      }
    }

    createMde(textarea) {
      var mde = new EasyMDE({
        element: textarea,
        spellChecker: false,
        autofocus: false,
        status: false,
        forceSync: true, // keeps textarea.value fresh for getMarkdown()/val()
        tabSize: 2,
        autoDownloadFontAwesome: false,
        minHeight: "280px",
        toolbar: false
      });
      // grow with the content; the window stays the scroll container
      mde.codemirror.setOption("viewportMargin", Infinity);
      return mde;
    }

    createToolbar() {
      var actions = [
        ["bold", "Bold", "B"], ["italic", "Italic", "I"],
        ["strikethrough", "Strikethrough", "S"], ["code", "Inline code", "</>"],
        ["link", "Link", "Link"]
      ];
      if (!this.simple) actions.push(
        ["heading", "Heading", "H2"], ["quote", "Quote", "Quote"],
        ["code-block", "Code block", "Code"],
        ["unordered-list", "Bulleted list", "List"], ["ordered-list", "Numbered list", "1. List"],
        ["image", "Image", "Image"], ["horizontal-rule", "Horizontal rule / read-more fold", "Rule"]
      );
      var toolbar = document.createElement("div");
      toolbar.className = "meditor-toolbar";
      toolbar.setAttribute("role", "toolbar");
      toolbar.setAttribute("aria-label", "Text formatting");
      actions.forEach((action, index) => {
        var button = document.createElement("button");
        button.type = "button";
        button.className = action[0];
        button.dataset.action = action[0];
        button.title = action[1];
        button.setAttribute("aria-label", action[1]);
        button.textContent = action[2];
        button.tabIndex = index ? -1 : 0;
        button.onmousedown = (e) => {
          if (e.button !== 0) return;
          this.rememberSelection();
          e.preventDefault();
        };
        button.onclick = () => this.format(action[0]);
        toolbar.appendChild(button);
      });
      toolbar.onkeydown = (e) => {
        var buttons = Array.from(toolbar.querySelectorAll("button"));
        var index = buttons.indexOf(e.target);
        if (index < 0) return;
        // Finish keyboard activation here before focus returns to the editor.
        // Alloy's Enter keyup handler assumes Enter was typed in rich text.
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); return; }
        if (e.key === "ArrowRight") index = (index + 1) % buttons.length;
        else if (e.key === "ArrowLeft") index = (index + buttons.length - 1) % buttons.length;
        else if (e.key === "Home") index = 0;
        else if (e.key === "End") index = buttons.length - 1;
        else if (e.key === "Escape") { this.focus(); return; }
        else return;
        e.preventDefault();
        buttons.forEach((button, i) => button.tabIndex = i === index ? 0 : -1);
        buttons[index].focus();
      };
      toolbar.onkeyup = (e) => {
        if (e.target.tagName === "BUTTON" && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          e.target.click();
        }
      };
      this.tag_container.insertBefore(toolbar, this.tag);
      this.tag_toolbar = toolbar;

      var form = document.createElement("form");
      form.className = "meditor-url-form";
      form.hidden = true;
      var label = document.createElement("label");
      label.innerHTML = "<span>Link URL</span><input name='url' type='text' placeholder='https://example.com' required autocomplete='off'>";
      form.appendChild(label);
      form.insertAdjacentHTML("beforeEnd", "<button type='submit'>Insert link</button><button type='button'>Cancel</button><span class='meditor-url-error' role='alert'></span>");
      this.tag_container.insertBefore(form, this.tag);
      this.tag_url_form = form;
      form.onsubmit = (e) => {
        e.preventDefault();
        if (this.readOnly) return;
        var url = form.elements.url.value.trim();
        if (!this.validUrl(url, this.url_action === "image")) {
          form.querySelector(".meditor-url-error").textContent = "Use a web address, relative path, or " + (this.url_action === "image" ? "image path." : "mailto: link.");
          return;
        }
        // Encode characters that would close or break a Markdown destination.
        url = url.replace(/[\s()<>"\\]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
        form.hidden = true;
        this.format(this.url_action, url);
      };
      form.querySelector("button[type=button]").onclick = () => this.closeUrlForm();
      form.onkeydown = (e) => {
        if (e.key === "Enter") e.preventDefault();
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this.closeUrlForm(); }
      };
      form.onkeyup = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (e.target.name === "url") form.requestSubmit();
          else if (e.target.tagName === "BUTTON") e.target.click();
        }
      };
      this.handleSelection = () => this.rememberSelection();
      document.addEventListener("selectionchange", this.handleSelection);
      this.tag_container.addEventListener("focusout", this.handleSelection);
    }

    validUrl(url, image) {
      if (!url || /[\u0000-\u001f\u007f]/.test(url)) return false;
      var scheme = url.match(/^([a-z][a-z0-9+.-]*):/i);
      return !scheme || /^(https?|mailto)$/i.test(scheme[1]) && (!image || scheme[1].toLowerCase() !== "mailto");
    }

    rememberSelection() {
      if (!this.tag_markdown || this.removed) return;
      if (!this.tag_editmode.classList.contains("markdown") && this.editor) this.editor.rememberSelection();
    }

    closeUrlForm() {
      this.tag_url_form.hidden = true;
      if (this.editor && !this.tag_editmode.classList.contains("markdown")) this.editor.restoreSelection();
      else this.focus();
    }

    format(action, url) {
      if (this.readOnly || this.removed) return;
      var markdown = this.tag_editmode.classList.contains("markdown");
      if ((action === "link" || action === "image") && !url) {
        this.rememberSelection();
        this.url_action = action;
        var form = this.tag_url_form;
        form.querySelector("label span").textContent = action === "image" ? "Image URL" : "Link URL";
        form.querySelector("button[type=submit]").textContent = action === "image" ? "Insert image" : "Insert link";
        form.querySelector(".meditor-url-error").textContent = "";
        form.elements.url.value = !markdown && action === "link" ? this.editor.getLinkUrl() : "";
        form.hidden = false;
        form.elements.url.focus();
        return;
      }
      this.tag_url_form.hidden = true;
      if (markdown) this.formatMarkdown(action, url);
      else if (this.editor) this.editor.format(action, url);
    }

    formatMarkdown(action, url) {
      var textarea = this.tag_markdown.firstChild;
      var cm = this.mde && this.mde.codemirror;
      var value = cm ? cm.getValue() : textarea.value;
      var start = cm ? cm.indexFromPos(cm.getCursor("from")) : textarea.selectionStart;
      var end = cm ? cm.indexFromPos(cm.getCursor("to")) : textarea.selectionEnd;
      var selected = value.slice(start, end);
      var replacement, selectionStart, selectionEnd;
      var markers = {bold: "**", italic: "*", strikethrough: "~~", code: "`"};
      if (markers[action]) {
        var marker = markers[action];
        var character = marker[0];
        var leadingRun = text => { var length = 0; while (text[length] === character) length++; return length; };
        var trailingRun = text => leadingRun(text.split("").reverse().join(""));
        var removable = length => action === "italic" ? length % 2 === 1 : length >= marker.length;
        var inside = Math.min(leadingRun(selected), trailingRun(selected));
        var outside = Math.min(trailingRun(value.slice(0, start)), leadingRun(value.slice(end)));
        if (inside && removable(inside) && selected.length > inside * 2) {
          var count = action === "code" ? inside : marker.length;
          selected = selected.slice(count, -count);
          replacement = selected;
          selectionStart = start;
        } else if (outside && removable(outside)) {
          var count = action === "code" ? outside : marker.length;
          start -= count;
          end += count;
          replacement = selected;
          selectionStart = start;
        } else {
          if (action !== "code" && selected.trim()) {
            start += selected.match(/^\s*/)[0].length;
            end -= selected.match(/\s*$/)[0].length;
            selected = selected.trim();
          }
          selected = selected || (action === "code" ? "code" : "text");
          if (action === "code") marker = this.codeFence(selected, 1);
          var padding = action === "code" && /^`|`$/.test(selected) ? " " : "";
          replacement = marker + padding + selected + padding + marker;
          selectionStart = start + marker.length + padding.length;
        }
        selectionEnd = selectionStart + selected.length;
      } else if (action === "link" || action === "image") {
        var label = selected || (action === "image" ? "Image description" : url);
        label = label.replace(/([\\[\]])/g, "\\$1");
        var prefix = action === "image" ? "![" : "[";
        replacement = prefix + label + "](" + url + ")";
        selectionStart = start + prefix.length;
        selectionEnd = selectionStart + label.length;
      } else if (action === "horizontal-rule" || action === "code-block") {
        var before = start && value.slice(0, start).replace(/\n+$/, "") ? "\n\n".slice((value.slice(0, start).match(/\n*$/) || [""])[0].length) : "";
        var after = end < value.length ? "\n\n".slice((value.slice(end).match(/^\n*/) || [""])[0].length) : "";
        var fence = this.codeFence(selected, 3);
        var content = selected || "code";
        replacement = before + (action === "horizontal-rule" ? "---\n\n" : fence + "\n" + content + "\n" + fence) + after;
        selectionStart = start + (action === "horizontal-rule" ? replacement.length : before.length + fence.length + 1);
        selectionEnd = selectionStart + (action === "horizontal-rule" ? 0 : content.length);
      } else {
        // Block actions apply to complete lines, including multiline selections.
        start = value.lastIndexOf("\n", start - 1) + 1;
        if (end > start && value[end - 1] === "\n") end--;
        var lineEnd = value.indexOf("\n", end);
        end = lineEnd < 0 ? value.length : lineEnd;
        var lines = value.slice(start, end).split("\n");
        var patterns = {heading: /^#{1,6} /, quote: /^> /, "unordered-list": /^[-*+] /, "ordered-list": /^\d+\. /};
        var pattern = patterns[action];
        if (!pattern) return;
        var remove = lines.every(line => pattern.test(line));
        replacement = lines.map((line, index) => {
          if (remove) return line.replace(pattern, "");
          var prefix = action === "heading" ? "## " : action === "quote" ? "> " : action === "unordered-list" ? "- " : (index + 1) + ". ";
          return prefix + line.replace(pattern, "");
        }).join("\n");
        selectionStart = start;
        selectionEnd = start + replacement.length;
        if (lines.length === 1 && !lines[0]) selectionStart = selectionEnd;
      }
      if (cm) {
        cm.operation(() => {
          cm.replaceRange(replacement, cm.posFromIndex(start), cm.posFromIndex(end), "+input");
          cm.setSelection(cm.posFromIndex(selectionStart), cm.posFromIndex(selectionEnd));
        });
        cm.focus();
      } else {
        textarea.focus();
        textarea.setRangeText(replacement, start, end, "select");
        textarea.setSelectionRange(selectionStart, selectionEnd);
        textarea.dispatchEvent(new Event("input", {bubbles: true}));
        this.autoHeight(textarea);
      }
    }

    codeFence(text, minimum) {
      return "`".repeat(Math.max(minimum, ...(text.match(/`+/g) || []).map(run => run.length + 1)));
    }

    autoHeight(elem) {
      var height_before = elem.style.height;
      if (height_before) {
        elem.style.height = "0px";
      }
      var h = elem.offsetHeight;
      var scrollh = elem.scrollHeight;
      elem.style.height = height_before;
      if (scrollh > h) {
        elem.style.height = scrollh + "px";
        elem.style.scrollTop = "0px";
      } else {
        elem.style.height = height_before;
      }
    }

    getMarkdown() {
      if (!this.tag_editmode) return this.initial_markdown || "";
      if (this.tag_editmode.classList.contains("markdown")) {
        return this.mde ? this.mde.value() : this.tag_markdown.firstChild.value;
      } else {
        if (this.tag.innerHTML === this.rich_snapshot) return this.rich_markdown;
        return toMarkdown(this.tag.innerHTML, {gfm: true, converters: [
          {filter: "hr", replacement: () => "\n\n---\n\n"},
          {
            filter: node => node.nodeName === "CODE" && node.parentNode.nodeName !== "PRE",
            replacement: (content, node) => {
              var text = node.textContent;
              var fence = this.codeFence(text, 1);
              var padding = /^`|`$/.test(text) ? " " : "";
              return fence + padding + text + padding + fence;
            }

          }
        ]});
      }
    }

    getHtml() {
      if (this.tag_editmode.classList.contains("markdown")) {
        return marked(this.getMarkdown(), {gfm: true, breaks: true});
      } else {
        return marked(this.getMarkdown(), {gfm: true, breaks: true});
      }
    }

    handleEditmodeChange(e, preset_markdown) {
      if (e && this.readOnly) return false;
      if (this.tag_url_form) this.tag_url_form.hidden = true;
      if (this.tag_editmode.classList.contains("markdown")) {
        // Change to ckeditor
        this.tag_markdown.style.display = "none";
        this.tag.style.display = "";
        this.rich_markdown = this.getMarkdown();
        this.tag.innerHTML = this.getHtml();
        this.rich_snapshot = this.tag.innerHTML;
        if (this.editor) this.editor.clearSelection();
      } else {
        // Change to markdown. preset_markdown (the untouched stored source)
        // is only passed by the automatic switch right after load.
        var markdown = (typeof preset_markdown == "string") ? preset_markdown : this.getMarkdown();
        var textarea = this.tag_markdown.firstChild;
        this.tag_markdown.style.display = "";
        this.tag_markdown.style.width = this.tag.offsetWidth + "px";
        // the px snapshot goes stale on window resize; the clamp keeps the
        // editor from overflowing a column that shrank mid-edit
        this.tag_markdown.style.maxWidth = "100%";
        this.tag.style.display = "none";
        if (window.EasyMDE && !this.simple) {
          if (this.mde) {
            this.mde.value(markdown);
          } else {
            textarea.value = markdown;
            this.mde = this.createMde(textarea);
          }
          var mde = this.mde;
          setTimeout(() => { if (!this.removed) mde.codemirror.refresh(); }, 1);
        } else {
          textarea.value = markdown;
          this.autoHeight(textarea);
        }
      }
      this.tag_editmode.classList.toggle("markdown");
      this.updateEditmodeLabel();
      return false;
    }

    save() {
      this.tag_original.innerHTML = this.getHtml();
    }

    setReadOnly(readOnly) {
      this.readOnly = readOnly;
      if (this.mde) this.mde.codemirror.setOption("readOnly", readOnly);
      if (this.tag_markdown) this.tag_markdown.firstChild.readOnly = readOnly;
      if (this.editor) this.editor.setReadOnly(readOnly);
      if (this.tag_toolbar) this.tag_toolbar.querySelectorAll("button").forEach(button => button.disabled = readOnly);
      if (this.tag_url_form) this.tag_url_form.querySelectorAll("input, button").forEach(control => control.disabled = readOnly);
      if (this.tag_editmode) this.tag_editmode.setAttribute("aria-disabled", String(readOnly));
    }

    focus() {
      if (this.removed || !this.tag_markdown) return;
      if (this.tag_editmode.classList.contains("markdown")) {
        if (this.mde) this.mde.codemirror.focus();
        else this.tag_markdown.firstChild.focus();
      } else {
        this.tag.focus();
      }
    }

    remove() {
      this.removed = true;
      document.removeEventListener("selectionchange", this.handleSelection);
      if (this.mde) {
        this.mde.toTextArea();
        this.mde = null;
      }
      if (this.editor) this.editor.destroy();
      this.tag_original.style.display = "";
      this.tag_container.remove();
    }

    val() {
      return this.getMarkdown();
    }
  }

  Object.assign(Meditor.prototype, LogMixin);
  window.Meditor = Meditor;

})();
