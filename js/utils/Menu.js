(function() {

  class Menu {
    constructor(button) {
      this.button = button;
      this.elem = $(".menu.template").clone().removeClass("template");
      this.elem.appendTo("body");
      this.items = [];
    }

    show() {
      if (window.visible_menu && window.visible_menu.button[0] === this.button[0]) {
        window.visible_menu.hide();
        this.hide();
      } else {
        var button_pos = this.button.offset();
        this.elem.css({"top": button_pos.top + this.button.outerHeight(), "left": button_pos.left + this.button.outerWidth() - this.elem.outerWidth()});
        this.button.addClass("menu-active");
        this.elem.addClass("visible");
        if (window.visible_menu) window.visible_menu.hide();
        window.visible_menu = this;
      }
    }

    hide() {
      this.elem.removeClass("visible");
      this.button.removeClass("menu-active");
      window.visible_menu = null;
    }

    addItem(title, cb) {
      var self = this;
      var item = $(".menu-item.template", this.elem).clone().removeClass("template");
      item.html(title);
      item.on("click", function() {
        if (!cb(item)) {
          self.hide();
        }
        return false;
      });
      item.appendTo(this.elem);
      this.items.push(item);
      return item;
    }

    log() {
      var args = ["[Menu]"];
      for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
      console.log.apply(console, args);
    }
  }

  window.Menu = Menu;

  // Hide menu on outside click
  $("body").on("click", function(e) {
    if (window.visible_menu && e.target !== window.visible_menu.button[0] && $(e.target).parent()[0] !== window.visible_menu.elem[0]) {
      window.visible_menu.hide();
    }
  });

})();
