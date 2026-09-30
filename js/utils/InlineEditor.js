(function() {

  // Fields share one edit session and one Save/Cancel bar per object.
  class InlineEditor {
    constructor(elem, getContent, saveContent, getObject) {
      this.elem = elem;
      this.getContent = getContent;
      this.saveContent = saveContent;
      this.getObject = getObject;
      this.object = getObject(elem);
      this.editor = null;
      this.handleImageSave = this.handleImageSave.bind(this);

      var owner = this.object.data("inline-editor");
      if (!owner) {
        owner = this;
        this.fields = [];
        this.object.data("inline-editor", this).addClass("editable-object");
        var type = this.object.data("object").split(":")[0];
        var label = "Edit " + (type === "Site" ? "profile" : type.toLowerCase());
        this.edit_button = $("<button type='button' class='editable-edit'><span class='icon-edit' aria-hidden='true'></span></button>")
          .attr({"aria-label": label, title: label}).prependTo(this.object);
        this.edit_button.on("click", () => this.startEdit());
      }
      this.owner = owner;
      owner.fields.push(this);
      this.elem.addClass("editable").on("click.inlineedit focus.inlineedit", (e) => {
        if (InlineEditor.active !== owner || owner.saving) return;
        e.preventDefault();
        this.activate();
      });
    }

    startEdit() {
      if (InlineEditor.active) return false;
      InlineEditor.active = this;
      this.saving = false;
      this.fields.forEach((field) => {
        field.content_before = field.elem.html();
        field.raw_before = field.getContent(field.elem, "raw") || "";
        field.data_before = field.elem.data("content");
        field.tabindex_before = field.elem.attr("tabindex");
        field.elem.attr("tabindex", "0").addClass("editing-field");
      });
      this.object.addClass("editing-object");
      $("body").addClass("editing");
      $(".editbg").css({display: "block", opacity: 0.9});
      $(".editable-edit").prop("disabled", true);
      $(".editbar").css("display", "inline-block").addClass("visible");
      $(".publishbar").css("opacity", 0);
      $(".editbar .object").text(this.object.data("object") === "Site" ? "Profile" : this.object.data("object"));
      $(".editbar .button").removeClass("loading");
      $(".editbar .save").off("click").on("click", () => this.saveEdit());
      $(".editbar .delete").off("click").on("click", () => this.deleteObject());
      $(".editbar .cancel").off("click").on("click", () => this.cancelEdit());
      $(".editbar .delete").toggle(!!this.object.data("deletable"))
        .text("Delete " + this.object.data("object").split(":")[0].toLowerCase());
      this.beforeunload = window.onbeforeunload;
      window.onbeforeunload = function() { return "Your unsaved blog changes will be lost!"; };

      // Capture before routing, rich editor link handlers, or browser navigation.
      this.blockLinks = (e) => {
        var link = $(e.target).closest("a[href]");
        if (!link.length || link.closest(".editbar").length || link.is(".meditor-editmode")) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.type === "click" && !this.saving) {
          var field = $(e.target).closest("[data-editable]").data("editor");
          if (field && field.owner === this) field.activate();
        }
      };
      ["click", "auxclick", "contextmenu", "dragstart"].forEach((name) => document.addEventListener(name, this.blockLinks, true));
      this.fields[0].activate();
      return false;
    }

    activate() {
      if (this.owner.saving) return;
      this.owner.focused = this;
      if (this.editor) return;
      if (this.elem.data("editable-mode") === "meditor") {
        this.editor = new Meditor(this.elem[0], this.raw_before);
        this.editor.handleImageSave = this.handleImageSave;
        this.editor.onLoad = () => {
          if (InlineEditor.active === this.owner && !this.owner.saving && this.owner.focused === this) this.editor.focus();
        };
        $(this.editor.tag_container).on("focusin", () => { this.owner.focused = this; });
        this.editor.load();
      } else {
        this.editor = $("<textarea class='editor'></textarea>");
        var label = this.elem.data("editable").replace(/_/g, " ");
        this.editor.attr("aria-label", label.charAt(0).toUpperCase() + label.slice(1));
        this.editor.val(this.raw_before);
        this.editor.on("focus", () => { this.owner.focused = this; });
        this.copyStyle(this.elem, this.editor);
        this.elem.after(this.editor).hide();
        this.autoExpand(this.editor);
        this.editor.focus();
      }
      this.owner.focused = this;
    }

    handleImageSave(name, image_base64uri, el) {
      el.style.opacity = 0.5;
      var object_name = this.object.data("object").replace(/[^A-Za-z0-9]/g, "_").toLowerCase();
      var file_path = "data/img/" + object_name + "_" + name;
      Page.cmd("fileWrite", [file_path, image_base64uri.replace(/.*,/, "")], function() {
        el.style.opacity = 1;
        el.src = file_path;
      });
    }

    stopEdit() {
      this.fields.forEach((field) => {
        if (field.editor) field.editor.remove();
        field.editor = null;
        field.elem.css("display", "").removeClass("editing-field");
        if (field.tabindex_before === undefined) field.elem.removeAttr("tabindex");
        else field.elem.attr("tabindex", field.tabindex_before);
      });
      this.object.removeClass("editing-object");
      $("body").removeClass("editing");
      $(".editbg").css({display: "none", opacity: 0});
      $(".editable-edit").prop("disabled", false);
      $(".editbar").css("display", "none").removeClass("visible");
      $(".publishbar").css("opacity", 1);
      ["click", "auxclick", "contextmenu", "dragstart"].forEach((name) => document.removeEventListener(name, this.blockLinks, true));
      window.onbeforeunload = this.beforeunload;
      InlineEditor.active = null;
      this.edit_button.focus();
    }

    saveEdit() {
      if (this.saving) return false;
      var changes = this.fields.filter((field) => field.editor && field.editor.val() !== field.raw_before)
        .map((field) => ({field: field, elem: field.elem, content: field.editor.val()}));
      if (!changes.length) {
        this.stopEdit();
        return false;
      }
      this.saving = true;
      this.setReadOnly(true);
      $(".editbar .save").addClass("loading");
      var complete = (results) => {
        this.saving = false;
        this.setReadOnly(false);
        $(".editbar .save").removeClass("loading");
        if (results === false) return;
        this.stopEdit();
        changes.forEach((change, i) => change.elem.html(results[i]));
        this.object.find("pre code").each(function(i, block) { hljs.highlightBlock(block); });
        Page.addImageZoom(this.object);
        Page.cleanupImages();
      };
      if (this.object.data("object").split(":")[0] === "Comment") {
        var change = changes[0];
        change.field.saveContent(change.elem, change.content, (html) => complete(html === false ? false : [html]));
      } else {
        Page.saveObjectFields(this.object, changes, complete);
      }
      return false;
    }

    setReadOnly(readOnly) {
      this.object.toggleClass("saving-object", readOnly);
      this.fields.forEach((field) => {
        if (!field.editor) return;
        if (field.editor instanceof Meditor) {
          field.editor.setReadOnly(readOnly);
        } else field.editor.prop("readOnly", readOnly);
      });
    }

    deleteObject() {
      if (this.saving) return false;
      var object_type = this.object.data("object").split(":")[0].toLowerCase();
      this.saving = true;
      Page.cmd("wrapperConfirm", ["Are you sure you want to delete this " + object_type + "?", "Delete"], (confirmed) => {
        if (!confirmed) { this.saving = false; return; }
        $(".editbar .delete").addClass("loading");
        Page.deleteObject(this.object, (saved) => {
          this.saving = false;
          $(".editbar .delete").removeClass("loading");
          if (saved !== false) this.stopEdit();
        });
      });
      return false;
    }

    cancelEdit() {
      if (this.saving) return false;
      this.stopEdit();
      this.fields.forEach((field) => field.elem.html(field.content_before).data("content", field.data_before));
      this.object.find("pre code").each(function(i, block) { hljs.highlightBlock(block); });
      Page.addImageZoom(this.object);
      Page.cleanupImages();
      return false;
    }

    copyStyle(elem_from, elem_to) {
      var from_style = getComputedStyle(elem_from[0]);
      ["fontFamily", "fontSize", "fontWeight", "marginTop", "marginRight", "marginBottom", "marginLeft",
        "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "lineHeight", "textAlign", "color", "letterSpacing"]
        .forEach((key) => elem_to.css(key, from_style[key]));
    }

    autoExpand(elem) {
      elem.on("input", function() {
        elem.height(1).height(this.scrollHeight);
      }).trigger("input");
    }
  }

  window.InlineEditor = InlineEditor;

})();
