(function() {

  class Meditor {
    constructor(tag_original, body) {
      this.tag_original = tag_original;
      // The rail links field is too small for the full markdown toolbar;
      // it keeps the classic rich-first flow with the plain textarea.
      this.simple = tag_original.classList.contains("links");
      this.mde = null;
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

      if (body) {
        this.tag.innerHTML = marked(body, {gfm: true, breaks: true});
      }

      this.handleEditorLoad = this.handleEditorLoad.bind(this);
      this.handleEditmodeChange = this.handleEditmodeChange.bind(this);
      this.handleImageSave = null;
    }

    load() {
      if (!window.AlloyEditor) {
        var style = document.createElement("link");
        style.href = "alloy-editor/all.css";
        style.rel = "stylesheet";
        document.head.appendChild(style);

        var script = document.createElement("script");
        script.src = "alloy-editor/all.js";
        document.head.appendChild(script);

        script.onload = this.handleEditorLoad;
      } else {
        this.handleEditorLoad();
      }
    }

    handleEditorLoad() {
      var self = this;
      // Create rich text<>markdown edit mode switch button
      this.tag.insertAdjacentHTML('beforeBegin', "<a href='#Markdown' class='meditor-editmode'></a>");
      this.tag_editmode = this.tag.previousSibling;
      this.tag_editmode.onclick = this.handleEditmodeChange;
      this.updateEditmodeLabel();

      // Create ckeditor
      this.editor = new CustomAlloyEditor(this.tag);
      if (this.handleImageSave) this.editor.handleImageSave = this.handleImageSave;

      // Create markdown editor textfield
      this.tag.insertAdjacentHTML('beforeBegin', this.tag_original.outerHTML);
      this.tag_markdown = this.tag.previousSibling;
      this.tag_markdown.innerHTML = "<textarea class='meditor-markdown'>MARKDOWN</textarea>";
      this.autoHeight(this.tag_markdown.firstChild);
      this.tag_markdown.firstChild.oninput = function() {
        if (self.mde) return; // EasyMDE/CodeMirror sizes itself
        self.autoHeight(self.tag_markdown.firstChild);
      };

      this.tag_markdown.style.display = "none";

      // Markdown is the storage format, so the markdown editor (with its
      // formatting toolbar) is the default mode; the toggle switches to the
      // rich text view. The rail links field keeps the classic rich default.
      if (window.EasyMDE && !this.simple) this.handleEditmodeChange(null, this.initial_markdown);

      // Call onLoad for external scripts
      setTimeout(function() {
        if (self.onLoad) self.onLoad();
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
        autofocus: true,
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
      if (this.tag_editmode.classList.contains("markdown")) {
        return this.tag_markdown.firstChild.value;
      } else {
        return toMarkdown(this.tag.innerHTML, {gfm: true});
      }
    }

    getHtml() {
      if (this.tag_editmode.classList.contains("markdown")) {
        return marked(this.tag_markdown.firstChild.value, {gfm: true, breaks: true});
      } else {
        return marked(this.getMarkdown(), {gfm: true, breaks: true});
      }
    }

    handleEditmodeChange(e, preset_markdown) {
      if (this.tag_editmode.classList.contains("markdown")) {
        // Change to ckeditor
        this.tag_markdown.style.display = "none";
        this.tag.style.display = "";
        this.tag.innerHTML = this.getHtml();
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
          setTimeout(function() { mde.codemirror.refresh() }, 1);
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

    remove() {
      if (this.mde) {
        // releases CodeMirror's document-level listeners before the DOM goes
        this.mde.toTextArea();
        this.mde = null;
      }
      this.tag_editmode.remove();
      this.tag_markdown.remove();
      this.tag_original.style.display = "";
      this.tag.remove();
    }

    val() {
      return this.getMarkdown();
    }
  }

  Object.assign(Meditor.prototype, LogMixin);
  window.Meditor = Meditor;

})();
