(function() {

  class Follow {
    constructor(elem) {
      this.elem = elem;
      this.menu = new Menu(this.elem);
      this.feeds = {};
      this.follows = {};

      this.init = this.init.bind(this);
      this.handleMenuClick = this.handleMenuClick.bind(this);

      var self = this;
      this.elem.off("click");
      this.elem.on("click", function() {
        if (self.elem.hasClass("following")) {
          self.showFeeds();
        } else {
          self.followDefaultFeeds();
          for (var title in self.feeds) {
            var feed = self.feeds[title];
            var menu_item = feed[1];
            if (!menu_item.hasClass("selected")) {
              self.showFeeds();
              break;
            }
          }
        }
        return false;
      });
    }

    init() {
      var self = this;
      if (!this.feeds) return;
      Page.cmd("feedListFollow", [], function(follows) {
        self.follows = follows;
        for (var title in self.feeds) {
          var feed = self.feeds[title];
          var query = feed[0];
          var menu_item = feed[1];
          var is_default_feed = feed[2];
          var param = feed[3];
          if (self.follows[title] && self.follows[title][1].indexOf(param) !== -1) {
            menu_item.addClass("selected");
          } else {
            menu_item.removeClass("selected");
          }
        }
        self.updateListitems();
        self.elem.css("display", "inline-block");

        setTimeout(function() {
          if (typeof Page.site_info.feed_follow_num !== "undefined" && Page.site_info.feed_follow_num === null) {
            self.followDefaultFeeds();
          }
        }, 100);
      });
    }

    addFeed(title, query, is_default_feed, param) {
      if (is_default_feed == null) is_default_feed = false;
      if (param == null) param = "";
      var menu_item = this.menu.addItem(title, this.handleMenuClick);
      this.feeds[title] = [query, menu_item, is_default_feed, param];
    }

    handleMenuClick(item) {
      item.toggleClass("selected");
      this.updateListitems();
      this.saveFeeds();
      return true;
    }

    showFeeds() {
      this.menu.show();
    }

    followDefaultFeeds() {
      for (var title in this.feeds) {
        var feed = this.feeds[title];
        var menu_item = feed[1];
        var is_default_feed = feed[2];
        if (is_default_feed) {
          menu_item.addClass("selected");
          this.log("Following", title, menu_item);
        }
      }
      this.updateListitems();
      this.saveFeeds();
    }

    updateListitems() {
      if (this.menu.elem.find(".selected").length > 0) {
        this.elem.addClass("following");
      } else {
        this.elem.removeClass("following");
      }
    }

    saveFeeds() {
      var self = this;
      Page.cmd("feedListFollow", [], function(follows) {
        self.follows = follows;
        for (var title in self.feeds) {
          var feed = self.feeds[title];
          var query = feed[0];
          var menu_item = feed[1];
          var is_default_feed = feed[2];
          var param = feed[3];

          var params;
          if (follows[title]) {
            params = follows[title][1].filter(function(item) { return item !== param; });
          } else {
            params = [];
          }

          if (menu_item.hasClass("selected")) {
            params.push(param);
          }

          if (params.length === 0) {
            delete follows[title];
          } else {
            follows[title] = [query, params];
          }
        }
        Page.cmd("feedFollow", [follows]);
      });
    }
  }

  Object.assign(Follow.prototype, LogMixin);
  window.Follow = Follow;

})();
