(function() {

  class CustomAlloyEditor {
    constructor(tag) {
      this.tag = tag;
      var editor = AlloyEditor.editable(this.tag);

      // Add top padding to avoid toolbar movement
      var el = editor._editor.element.$;
      var height_before = el.getClientRects()[0].height;
      var style = getComputedStyle(el);
      el.style.position = "relative";
      el.style.paddingTop = (parseInt(style["padding-top"]) + 20) + "px";
      var height_added = el.getClientRects()[0].height - height_before;
      el.style.top = (parseInt(style["marginTop"]) - 20 - height_added) + "px";
      el.style.marginBottom = (parseInt(style["marginBottom"]) + parseInt(el.style.top)) + "px";

      // Bind handlers
      this.handleSelectionChange = this.handleSelectionChange.bind(this);
      this.handleChange = this.handleChange.bind(this);
      this.handleAction = this.handleAction.bind(this);
      this.handleCommand = this.handleCommand.bind(this);
      this.resizeImage = this.resizeImage.bind(this);
      this.handleImageAdd = this.handleImageAdd.bind(this);
      this.getExtension = this.getExtension.bind(this);
      this.handleImageSave = null;

      // Add listeners
      var self = this;
      editor.get('nativeEditor').on("selectionChange", this.handleSelectionChange);
      editor.get('nativeEditor').on("focus", function(e) {
        setTimeout(function() {
          self.handleSelectionChange(e);
        }, 100);
      });
      editor.get('nativeEditor').on("click", this.handleSelectionChange);
      editor.get('nativeEditor').on("change", this.handleChange);
      editor.get('nativeEditor').on('imageAdd', function(e) {
        if (e.data.el.$.width > 0) {
          self.handleImageAdd(e);
        } else {
          setTimeout(function() {
            self.handleImageAdd(e);
          }, 100);
        }
      });
      editor.get('nativeEditor').on("actionPerformed", this.handleAction);
      editor.get('nativeEditor').on('afterCommandExec', this.handleCommand);

      window.editor = editor;

      this.el_last_created = null;
      this.image_size_limit = 200 * 1024;
      this.image_resize_width = 1200;
      this.image_resize_height = 900;
      this.image_preverse_ratio = true;
      this.image_try_png = false;
    }

    calcSize(source_width, source_height, target_width, target_height) {
      if (source_width <= target_width && source_height <= target_height) {
        return [source_width, source_height];
      }
      var width = target_width;
      var height = width * (source_height / source_width);
      if (height > target_height) {
        height = target_height;
        width = height * (source_width / source_height);
      }
      return [Math.round(width), Math.round(height)];
    }

    scaleHalf(image) {
      var canvas = document.createElement("canvas");
      canvas.width = image.width / 1.5;
      canvas.height = image.height / 1.5;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas;
    }

    resizeImage(image, width, height) {
      var canvas = document.createElement("canvas");
      if (this.image_preverse_ratio) {
        var size = this.calcSize(image.width, image.height, width, height);
        canvas.width = size[0];
        canvas.height = size[1];
      } else {
        canvas.width = width;
        canvas.height = height;
      }

      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#FFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      var image_resized = image;
      while (image_resized.width > width * 1.5) {
        image_resized = this.scaleHalf(image_resized);
      }
      ctx.drawImage(image_resized, 0, 0, canvas.width, canvas.height);

      var image_base64uri;
      if (this.image_try_png && this.getExtension(image.src) === "png") {
        image_base64uri = canvas.toDataURL("image/png", 0.1);
        if (image_base64uri.length > this.image_size_limit) {
          this.log("PNG too large (" + image_base64uri.length + " bytes), convert to jpg instead");
          image_base64uri = canvas.toDataURL("image/jpeg", 0.7);
        } else {
          this.log("Converted to PNG");
        }
      } else {
        image_base64uri = canvas.toDataURL("image/jpeg", 0.7);
      }

      this.log("Resized " + image.width + "x" + image.height + " to " + canvas.width + "x" + canvas.height + " (" + image_base64uri.length + " bytes)");
      return [image_base64uri, canvas.width, canvas.height];
    }

    getExtension(data) {
      return data.match("/[a-z]+")[0].replace("/", "").replace("jpeg", "jpg");
    }

    handleImageAdd(e) {
      var name;
      if (e.data.file.name) {
        name = e.data.file.name.replace(/[^\w\.-]/gi, "_");
      } else {
        name = Time.timestamp() + "." + this.getExtension(e.data.file.type);
      }
      e.data.el.$.style.maxWidth = "2400px";

      var image_base64uri, width, height;
      if (e.data.file.size > this.image_size_limit) {
        this.log("File size " + e.data.file.size + " larger than allowed " + this.image_size_limit + ", resizing...");
        var result = this.resizeImage(e.data.el.$, this.image_resize_width, this.image_resize_height);
        image_base64uri = result[0];
        width = result[1];
        height = result[2];
        e.data.el.$.src = image_base64uri;
        name = name.replace(/(png|gif|jpg)/, this.getExtension(image_base64uri));
      } else {
        image_base64uri = e.data.el.$.src;
        width = e.data.el.$.width;
        height = e.data.el.$.height;
      }
      e.data.el.$.style.maxWidth = "";
      e.data.el.$.alt = name + " (" + width + "x" + height + ")";
      this.handleImageSave(name, image_base64uri, e.data.el.$);
    }

    handleAction(e) {
      var el = e.editor.getSelection().getStartElement();
      // Convert Pre to Pre > Code
      if (el.getName() === "pre") {
        this.log("Fix pre");
        var new_el = new CKEDITOR.dom.element("code");
        new_el.setHtml(el.getHtml().replace(/\u200B/g, ''));
        el.setHtml("");
        e.editor.insertElement(new_el);
        var ranges = e.editor.getSelection().getRanges();
        ranges[0].startContainer = new_el;
        e.editor.getSelection().selectRanges(ranges);
      }

      // Remove Pre > Code
      if (el.getName() === "pre" && e.data._style.hasOwnProperty("removeFromRange")) {
        this.log("Remove pre");
        var new_el2 = new CKEDITOR.dom.element("p");
        new_el2.insertAfter(el);
        new_el2.setHtml(el.getFirst().getHtml().replace(/\n/g, "<br>").replace(/\u200B/g, ''));
        el.remove();
        selectElement(e.editor, new_el2);
      }
      // Remove Pre > Code focused on code
      else if (el.getName() === "code" && e.data._style.hasOwnProperty("removeFromRange")) {
        this.log("Remove code");
        var new_el3 = new CKEDITOR.dom.element("p");
        new_el3.insertAfter(el.getParent());
        new_el3.setHtml(el.getHtml().replace(/\n/g, "<br>").replace(/\u200B/g, ''));
        el.getParent().remove();
        selectElement(e.editor, new_el3);
      }
      // Convert multi-line code to Pre > Code
      else if (el.getName() === "code" && el.getHtml().indexOf("<br>") > 0) {
        this.log("Fix multiline code");
        var new_el4 = new CKEDITOR.dom.element("pre");
        new_el4.insertAfter(el);
        el.appendTo(new_el4);
        selectElement(e.editor, new_el4);
      }

      if (el.getName() === "h2" || el.getName() === "h3") {
        selectElement(e.editor, el);
      }

      this.handleChange(e);
    }

    handleCommand(e) {
      if (e.data.name === 'enter') {
        var el = e.editor.getSelection().getStartElement();
        if (el.getText().replace(/\u200B/g, '') === "" && el.getName() !== "p" && el.getParent().getName() === "p") {
          el.remove();
        }
      } else if (e.data.name === 'shiftEnter') {
        var el2 = e.editor.getSelection().getStartElement();
        if (el2.getName() === "code" && el2.getNext() && el2.getNext().getName && el2.getNext().getName() === "br") {
          el2.getNext().remove();
        }
      }
    }

    handleChange(e) {
      this.handleSelectionChange(e);
    }

    handleSelectionChange(e) {
      if (this.el_last_created && this.el_last_created.getText().replace(/\u200B/g, '').trim() !== "") {
        this.el_last_created.removeClass("empty");
        this.el_last_created = null;
      }

      var el = e.editor.getSelection().getStartElement();
      if (el.getName() === "br") {
        el = el.getParent();
      }
      var toolbar_add = document.querySelector(".ae-toolbar-add");
      if (!toolbar_add || !el) {
        return false;
      }

      if (el.getText().replace(/\u200B/g, '').trim() === "") {
        if (el.getName() === "h2" || el.getName() === "h3") {
          el.addClass("empty");
          this.el_last_created = el;
        }
        toolbar_add.classList.remove("lineselected");
        toolbar_add.classList.add("emptyline");
      } else {
        toolbar_add.classList.add("lineselected");
        toolbar_add.classList.remove("emptyline");
      }
    }
  }

  Object.assign(CustomAlloyEditor.prototype, LogMixin);
  window.CustomAlloyEditor = CustomAlloyEditor;

})();
