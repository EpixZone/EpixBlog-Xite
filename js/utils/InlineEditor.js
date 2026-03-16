(function() {

  class InlineEditor {
    constructor(elem, getContent, saveContent, getObject) {
      this.elem = elem;
      this.getContent = getContent;
      this.saveContent = saveContent;
      this.getObject = getObject;

      this.startEdit = this.startEdit.bind(this);
      this.saveEdit = this.saveEdit.bind(this);
      this.deleteObject = this.deleteObject.bind(this);
      this.cancelEdit = this.cancelEdit.bind(this);
      this.handleImageSave = this.handleImageSave.bind(this);
      this.stopEdit = this.stopEdit.bind(this);

      this.edit_button = $("<a href='#Edit' class='editable-edit icon-edit'></a>");
      this.edit_button.on("click", this.startEdit);
      this.elem.addClass("editable").before(this.edit_button);
      this.editor = null;

      var self = this;
      this.elem.on("mouseenter click", function(e) {
        self.edit_button.css("opacity", "0.4");
        var scrolltop = $(window).scrollTop();
        var top = self.edit_button.offset().top - parseInt(self.edit_button.css("margin-top"));
        if (scrolltop > top) {
          self.edit_button.css("margin-top", scrolltop - top + e.clientY - 20);
        } else {
          self.edit_button.css("margin-top", "");
        }
      });
      this.elem.on("mouseleave", function() {
        self.edit_button.css("opacity", "");
      });

      if (this.elem.is(":hover")) this.elem.trigger("mouseenter");
    }

    startEdit() {
      this.content_before = this.elem.html();

      if (this.elem.data("editable-mode") === "meditor") {
        this.editor = new Meditor(this.elem[0], this.getContent(this.elem, "raw"));
        this.editor.handleImageSave = this.handleImageSave;
        this.editor.load();
      } else {
        this.editor = $("<textarea class='editor'></textarea>");
        this.editor.val(this.getContent(this.elem, "raw"));
        this.elem.after(this.editor);

        this.elem.html([].concat(Array.from({length: 50}, (_, i) => i + 1)).join("fill the width"));
        this.copyStyle(this.elem, this.editor);
        this.elem.html(this.content_before);

        this.autoExpand(this.editor);
        this.elem.css("display", "none");

        if ($(window).scrollTop() === 0) {
          this.editor[0].selectionEnd = 0;
          this.editor.focus();
        }
      }

      $(".editbg").css("display", "block").cssLater("opacity", 0.9, 10);
      $(".editable-edit").css("display", "none");

      $(".editbar").css("display", "inline-block").addClassLater("visible", 10);
      $(".publishbar").css("opacity", 0);
      $(".editbar .object").text(this.getObject(this.elem).data("object") + "." + this.elem.data("editable"));
      $(".editbar .button").removeClass("loading");

      $(".editbar .save").off("click").on("click", this.saveEdit);
      $(".editbar .delete").off("click").on("click", this.deleteObject);
      $(".editbar .cancel").off("click").on("click", this.cancelEdit);

      if (this.getObject(this.elem).data("deletable")) {
        $(".editbar .delete").css("display", "").html("Delete " + this.getObject(this.elem).data("object").split(":")[0]);
      } else {
        $(".editbar .delete").css("display", "none");
      }

      window.onbeforeunload = function() {
        return 'Your unsaved blog changes will be lost!';
      };

      return false;
    }

    handleImageSave(name, image_base64uri, el) {
      el.style.opacity = 0.5;
      var object_name = this.getObject(this.elem).data("object").replace(/[^A-Za-z0-9]/g, "_").toLowerCase();
      var file_path = "data/img/" + object_name + "_" + name;
      Page.cmd("fileWrite", [file_path, image_base64uri.replace(/.*,/, "")], function() {
        el.style.opacity = 1;
        el.src = file_path;
      });
    }

    stopEdit() {
      this.editor.remove();
      this.editor = null;
      this.elem.css("display", "").css("z-index", 999).css("position", "relative").cssLater("z-index", "").cssLater("position", "");
      $(".editbg").css("opacity", 0).cssLater("display", "none");

      $(".editable-edit").css("display", "");

      $(".editbar").cssLater("display", "none", 1000).removeClass("visible");
      $(".publishbar").css("opacity", 1);

      window.onbeforeunload = null;
    }

    saveEdit() {
      var self = this;
      var content = this.editor.val();
      $(".editbar .save").addClass("loading");
      this.saveContent(this.elem, content, function(content_html) {
        if (content_html) {
          $(".editbar .save").removeClass("loading");
          self.stopEdit();
          if (typeof content_html === "string") {
            self.elem.html(content_html);
          }
          $('pre code').each(function(i, block) {
            hljs.highlightBlock(block);
          });
          Page.addImageZoom(self.elem);
        } else {
          $(".editbar .save").removeClass("loading");
        }
      });
      return false;
    }

    deleteObject() {
      var self = this;
      var object_type = this.getObject(this.elem).data("object").split(":")[0];
      Page.cmd("wrapperConfirm", ["Are you sure you sure to delete this " + object_type + "?", "Delete"], function(confirmed) {
        $(".editbar .delete").addClass("loading");
        Page.saveContent(self.getObject(self.elem), null, function() {
          self.stopEdit();
        });
      });
      return false;
    }

    cancelEdit() {
      this.stopEdit();
      this.elem.html(this.content_before);

      $('pre code').each(function(i, block) {
        hljs.highlightBlock(block);
      });

      Page.cleanupImages();
      return false;
    }

    copyStyle(elem_from, elem_to) {
      elem_to.addClass(elem_from[0].className);
      var from_style = getComputedStyle(elem_from[0]);

      elem_to.css({
        fontFamily: from_style.fontFamily,
        fontSize: from_style.fontSize,
        fontWeight: from_style.fontWeight,
        marginTop: from_style.marginTop,
        marginRight: from_style.marginRight,
        marginBottom: from_style.marginBottom,
        marginLeft: from_style.marginLeft,
        paddingTop: from_style.paddingTop,
        paddingRight: from_style.paddingRight,
        paddingBottom: from_style.paddingBottom,
        paddingLeft: from_style.paddingLeft,
        lineHeight: from_style.lineHeight,
        textAlign: from_style.textAlign,
        color: from_style.color,
        letterSpacing: from_style.letterSpacing
      });

      if (elem_from.innerWidth() < 1000) {
        elem_to.css("minWidth", elem_from.innerWidth());
      }
    }

    autoExpand(elem) {
      var editor = elem[0];
      elem.height(1);
      elem.on("input", function() {
        if (editor.scrollHeight > elem.height()) {
          elem.height(1).height(editor.scrollHeight + parseFloat(elem.css("borderTopWidth")) + parseFloat(elem.css("borderBottomWidth")));
        }
      });
      elem.trigger("input");

      // Tab key support
      elem.on('keydown', function(e) {
        if (e.which === 9) {
          e.preventDefault();
          var s = this.selectionStart;
          var val = elem.val();
          elem.val(val.substring(0, this.selectionStart) + "\t" + val.substring(this.selectionEnd));
          this.selectionEnd = s + 1;
        }
      });
    }
  }

  window.InlineEditor = InlineEditor;

})();
