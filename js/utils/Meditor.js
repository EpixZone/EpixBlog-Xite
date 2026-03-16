(function() {

  class Meditor {
    constructor(tag_original, body) {
      this.tag_original = tag_original;
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
      // Create ckeditor<>markdown edit mode switch button
      this.tag.insertAdjacentHTML('beforeBegin', "<a href='#Markdown' class='meditor-editmode' title='Switch to markdown'>&lt;/&gt;</a>");
      this.tag_editmode = this.tag.previousSibling;
      this.tag_editmode.onclick = this.handleEditmodeChange;

      // Create ckeditor
      this.editor = new CustomAlloyEditor(this.tag);
      if (this.handleImageSave) this.editor.handleImageSave = this.handleImageSave;

      // Create markdown editor textfield
      this.tag.insertAdjacentHTML('beforeBegin', this.tag_original.outerHTML);
      this.tag_markdown = this.tag.previousSibling;
      this.tag_markdown.innerHTML = "<textarea class='meditor-markdown'>MARKDOWN</textarea>";
      this.autoHeight(this.tag_markdown.firstChild);
      this.tag_markdown.firstChild.oninput = function() {
        self.autoHeight(self.tag_markdown.firstChild);
      };

      this.tag_markdown.style.display = "none";

      // Call onLoad for external scripts
      setTimeout(function() {
        if (self.onLoad) self.onLoad();
      }, 1);
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

    handleEditmodeChange() {
      if (this.tag_editmode.classList.contains("markdown")) {
        // Change to ckeditor
        this.tag_markdown.style.display = "none";
        this.tag.style.display = "";
        this.tag.innerHTML = this.getHtml();
      } else {
        // Change to markdown
        this.tag_markdown.style.display = "";
        this.tag_markdown.style.width = this.tag.offsetWidth + "px";
        this.tag.style.display = "none";
        this.tag_markdown.firstChild.value = this.getMarkdown();
        this.autoHeight(this.tag_markdown.firstChild);
      }
      this.tag_editmode.classList.toggle("markdown");
      return false;
    }

    save() {
      this.tag_original.innerHTML = this.getHtml();
    }

    remove() {
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
