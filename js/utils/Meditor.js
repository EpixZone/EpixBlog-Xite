(function() {

  class Meditor {
    constructor(tag_original, body) {
      this.tag_original = tag_original;
      // The rail links field is too small for the full markdown toolbar;
      // it uses a compact plain textarea for markdown.
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
        autoDownloadFontAwesome: false, // icons come from meditor.css masks
        minHeight: "280px",
        // exactly three dashes: the read-more fold cut in EpixBlog.js
        // requires a literal \n---\n (the EasyMDE default is -----)
        insertTexts: { horizontalRule: ["", "\n\n---\n\n"] },
        toolbar: [
          "bold", "italic", "strikethrough", "|",
          "heading", "quote", "code", "|",
          "unordered-list", "ordered-list", "|",
          "link", "image", "|",
          {
            name: "horizontal-rule",
            action: EasyMDE.drawHorizontalRule,
            className: "fa fa-minus",
            title: "Horizontal rule / read-more fold"
          }
        ],
        toolbarTips: true
      });
      // grow with the content; the window stays the scroll container
      mde.codemirror.setOption("viewportMargin", Infinity);
      return mde;
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
        return toMarkdown(this.tag.innerHTML, {gfm: true});
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
      if (this.tag_editmode.classList.contains("markdown")) {
        // Change to ckeditor
        this.tag_markdown.style.display = "none";
        this.tag.style.display = "";
        this.rich_markdown = this.getMarkdown();
        this.tag.innerHTML = this.getHtml();
        this.rich_snapshot = this.tag.innerHTML;
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
