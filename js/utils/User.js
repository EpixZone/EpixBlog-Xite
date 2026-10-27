(function() {

  class User {
    constructor() {
      this.my_post_votes = {};
      this.my_comment_votes = {};
      this.rules = {};
      this.xid_name = null;
      this.xid_tld = null;
      this.xid_avatar = null;
      this.xid_loading = false;
      this.xid_lookup = null;
      this.xid_address = null;
      this.xid_cert = null;
      this.xid_connecting = false;
      this.xid_connect_callbacks = [];
      this.xid_prompt_shown = false;
    }

    updateMyInfo(cb) {
      this.log("Updating user info...");
      this.updateMyVotes(cb);
    }

    updateMyVotes(cb) {
      var self = this;
      var user_dir = Page.site_info.xid_directory || Page.site_info.auth_address;
      if (!user_dir) {
        if (cb) cb();
        return;
      }
      var query = "SELECT 'post_vote' AS type, post_id AS uri FROM json LEFT JOIN post_vote USING (json_id) WHERE directory = 'users/" + user_dir + "' AND file_name = 'data.json'";
      Page.queryRows(query, function(votes) {
        if (votes) {
          for (var i = 0; i < votes.length; i++) {
            var vote = votes[i];
            if (vote.type === "post_vote" && vote.uri) {
              self.my_post_votes[vote.uri] = 1;
            }
          }
        }
        if (cb) cb();
      });
    }

    resolveXidName(authAddress, cb) {
      if (!authAddress) {
        if (cb) cb(null);
        return;
      }
      Page.cmd("xidResolve", [authAddress], function(result) {
        if (result && result.name) {
          if (cb) cb(result.name, result.tld, result.avatar || "");
        } else {
          if (cb) cb(null);
        }
      });
    }

    cancelXidLookup() {
      var lookup = this.xid_lookup;
      this.xid_lookup = null;
      this.xid_loading = false;
      if (lookup) for (var callback of lookup.callbacks) callback(null, true);
    }

    clearXidProfile() {
      this.xid_name = this.xid_tld = this.xid_address = this.xid_cert = this.xid_avatar = null;
      $(".certselect.user_name").text("Connect xID").css("color", "#f39c12");
      $(".comment-new").addClass("comment-nocert");
      this.showXidFab();
    }

    // Resolve and store my own xID name
    resolveMyXidName(cb) {
      var address = Page.site_info?.auth_address;
      var cert = Page.site_info?.cert_user_id;
      if (!address || !cert) {
        this.cancelXidLookup();
        this.clearXidProfile();
        if (cb) cb(null);
        return;
      }
      if (this.xid_lookup?.address === address && this.xid_lookup.cert === cert) {
        if (cb) this.xid_lookup.callbacks.push(cb);
        return;
      }
      this.cancelXidLookup();
      if (this.xid_address !== address || this.xid_cert !== cert) this.clearXidProfile();
      var lookup = { address, cert, callbacks: cb ? [cb] : [] };
      this.xid_lookup = lookup;
      this.xid_loading = true;
      this.resolveXidName(address, (name, tld, avatar) => {
        if (this.xid_lookup !== lookup) return;
        this.xid_lookup = null;
        this.xid_loading = false;
        if (Page.site_info?.auth_address !== address || Page.site_info?.cert_user_id !== cert) {
          for (var callback of lookup.callbacks) callback(null, true);
          return;
        }
        this.xid_address = address;
        this.xid_cert = cert;
        this.xid_name = name;
        this.xid_tld = tld;
        this.xid_avatar = avatar || "";
        for (var callback of lookup.callbacks) callback(name);
      });
    }

    checkCert(options) {
      var self = this;
      var prompt = options?.prompt !== false;
      if (!Page.site_info?.auth_address || !Page.site_info.cert_user_id) {
        this.cancelXidLookup();
        this.clearXidProfile();
        if (Page.site_info?.auth_address && prompt && !this.xid_prompt_shown) {
          this.xid_prompt_shown = true;
          this.triggerCertXid();
        }
        return;
      }
      this.resolveMyXidName(function(name, cancelled) {
        if (cancelled) return;
        if (name) {
          var display = name + "." + self.xid_tld;
          $(".certselect.user_name").text(display).css("color", Text.toColor(display));
          $(".comment-new").removeClass("comment-nocert");
          self.showXidTag(display);
        } else {
          self.clearXidProfile();
          if (prompt && !self.xid_prompt_shown) {
            self.xid_prompt_shown = true;
            self.triggerCertXid();
          }
        }
      });
      var user_dir = Page.site_info.xid_directory || Page.site_info.auth_address;
      Page.cmd("fileRules", "data/users/" + user_dir + "/content.json", function(rules) {
        self.rules = rules;
      });
    }

    triggerCertXid(cb) {
      if (cb) this.xid_connect_callbacks.push(cb);
      if (this.xid_connecting) return;
      this.xid_connecting = true;
      this.xid_prompt_shown = true;
      var finish = (name) => {
        var callbacks = this.xid_connect_callbacks;
        this.xid_connect_callbacks = [];
        this.xid_connecting = false;
        if (name) for (var callback of callbacks) callback();
      };
      // The node owns identity selection and can open the picker before this
      // page has received siteInfo. Refresh after selection instead of racing
      // the cert_changed event with a lookup of the previous auth address.
      Page.cmd("certXid", [], (result) => {
        if (result !== "ok") { finish(null); return; }
        Page.cmd("siteInfo", {}, (site_info) => {
          if (!site_info || site_info.error) { finish(null); return; }
          Page.setSiteinfo(site_info);
          if (!site_info.cert_user_id) { finish(null); return; }
          this.resolveMyXidName((name) => {
            if (name) {
              var display = name + "." + this.xid_tld;
              $(".certselect.user_name").text(display).css({"color": Text.toColor(display)});
              $(".comment-new").removeClass("comment-nocert");
              Page.cmd("wrapperNotification", ["done", "Connected as " + display]);
              this.showXidTag(display);
            }
            finish(name);
          });
        });
      });
    }
    showXidFab() {
      var self = this;
      $(".xid-fab, .xid-tag").remove();
      var fab = $('<a href="#" class="xid-fab nolink" style="background: #F0B622; display: inline-block; padding: 6px 12px; color: #09090A; font-size: 14px; text-transform: uppercase; font-family: consolas, menlo, monospace; text-decoration: none; cursor: pointer; border-radius: 8px; margin-left: 10px;" title="Register xID">xID</a>');
      fab.on("click", function(e) {
        e.preventDefault();
        self.triggerCertXid();
        return false;
      });
      $(".left h1").after(fab);
    }

    showXidTag(display) {
      $(".xid-fab, .xid-tag").remove();
      var hash = 0;
      for (var i = 0; i < display.length; i++) {
        hash += display.charCodeAt(i) * i;
      }
      var hue = hash % 360;
      var bgColor = "hsl(" + hue + ", 50%, 25%)";
      var textColor = "hsl(" + hue + ", 80%, 80%)";
      var avatar = this.xid_avatar;
      var tag = $('<a href="#" class="xid-tag nolink"></a>').css({
        "display": "inline-block", "padding": "6px 12px", "background": bgColor,
        "cursor": "pointer", "text-decoration": "none", "border-radius": "8px",
        "margin-left": "10px", "vertical-align": "middle"
      });
      if (typeof avatar === "string" && avatar) {
        tag.css("padding", "4px 10px");
        var image = $('<img class="xid-avatar" alt="">').css({
          "width": "20px", "height": "20px", "border-radius": "50%", "object-fit": "cover",
          "border": "1px solid " + textColor, "vertical-align": "middle", "margin-right": "4px"
        }).on("error", function() {
          $(this).remove();
          tag.css("padding", "6px 12px");
        });
        // Match the xID profile's image URL contract without parsing profile
        // values as markup or rewriting them through a third-party gateway.
        image.attr({ "src": avatar, "referrerpolicy": "no-referrer" });
        tag.append(image);
      }
      tag.append($("<span></span>").text(display).css({
        "color": textColor, "font-size": "12px", "font-family": "consolas, menlo, monospace"
      }));
      $(".left h1").after(tag);
    }

    requireXid(cb) {
      if (!Page.site_info?.auth_address || !Page.site_info.cert_user_id) {
        this.triggerCertXid(cb);
        return false;
      }
      if (this.xid_name && this.xid_address === Page.site_info.auth_address) {
        return true;
      }
      this.resolveMyXidName((name, cancelled) => {
        if (cancelled) return;
        if (name) cb();
        else this.triggerCertXid(cb);
      });
      return false;
    }
  }

  Object.assign(User.prototype, LogMixin);
  window.User = new User();

})();
