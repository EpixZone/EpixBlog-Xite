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
      Page.cmd("dbQuery", [query], function(votes) {
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

    resolveMyXidName(cb) {
      var self = this;
      if (this.xid_loading) {
        if (cb) cb(this.xid_name);
        return;
      }
      this.xid_loading = true;
      this.resolveXidName(Page.site_info.auth_address, function(name, tld, avatar) {
        self.xid_name = name;
        self.xid_tld = tld;
        self.xid_avatar = avatar || "";
        self.xid_loading = false;
        if (cb) cb(name);
      });
    }

    checkCert(type) {
      var self = this;
      if (Page.site_info.auth_address) {
        if (!Page.site_info.cert_user_id) {
          $(".certselect.user_name").text("Connect xID").css("color", "#f39c12");
          $(".comment-new").addClass("comment-nocert");
          this.showXidFab();
          if (!this.xid_prompt_shown) {
            this.xid_prompt_shown = true;
            this.triggerCertXid();
          }
        } else {
          this.resolveMyXidName(function(name) {
            if (name) {
              var display = name + "." + self.xid_tld;
              $(".certselect.user_name").text(display).css("color", Text.toColor(display));
              $(".comment-new").removeClass("comment-nocert");
              self.showXidTag(display);
            } else {
              $(".certselect.user_name").text("Connect xID").css("color", "#f39c12");
              $(".comment-new").addClass("comment-nocert");
              self.showXidFab();
              if (!self.xid_prompt_shown) {
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
      } else {
        $(".comment-new").addClass("comment-nocert");
        $(".certselect.user_name").text("Connect xID");
      }
    }

    triggerCertXid() {
      var self = this;
      Page.cmd("certXid", [], function(result) {
        if (result === "ok") {
          self.xid_loading = false;
          self.resolveMyXidName(function(name) {
            if (name) {
              var display = name + "." + self.xid_tld;
              $(".certselect.user_name").text(display).css("color", Text.toColor(display));
              $(".comment-new").removeClass("comment-nocert");
              Page.cmd("wrapperNotification", ["done", "Connected as " + display]);
              self.showXidTag(display);
            }
          });
        }
      });
    }

    showXidFab() {
      var self = this;
      $(".xid-fab, .xid-tag").remove();
      var fab = $('<a href="#" class="xid-fab nolink" style="background: linear-gradient(135deg, #e67e22, #f39c12); display: inline-block; padding: 6px 12px; color: #fff; font-size: 14px; text-transform: uppercase; font-family: consolas, menlo, monospace; text-decoration: none; cursor: pointer; box-shadow: 0 2px 8px rgba(243,156,18,0.4); border-radius: 3px; margin-left: 10px;" title="Register xID">xID</a>');
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
      var bgColor2 = "hsl(" + hue + ", 40%, 18%)";
      var textColor = "hsl(" + hue + ", 80%, 80%)";
      var avatar = this.xid_avatar;
      var tag;
      if (avatar) {
        tag = $('<a href="#" class="xid-tag nolink" style="display: inline-block; padding: 4px 10px; background: linear-gradient(135deg, ' + bgColor + ', ' + bgColor2 + '); box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer; text-decoration: none; border-radius: 3px; margin-left: 10px; vertical-align: middle;">' +
          '<img src="' + avatar + '" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; border: 1px solid ' + textColor + '; vertical-align: middle; margin-right: 4px;" onerror="this.style.display=\'none\'">' +
          '<span style="color: ' + textColor + '; font-size: 12px; font-family: consolas, menlo, monospace;">' + display + '</span>' +
          '</a>');
      } else {
        tag = $('<a href="#" class="xid-tag nolink" style="display: inline-block; padding: 6px 12px; background: linear-gradient(135deg, ' + bgColor + ', ' + bgColor2 + '); box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer; text-decoration: none; border-radius: 3px; margin-left: 10px;">' +
          '<span style="color: ' + textColor + '; font-size: 12px; font-family: consolas, menlo, monospace;">' + display + '</span>' +
          '</a>');
      }
      $(".left h1").after(tag);
    }

    requireXid(cb) {
      var self = this;
      if (!(Page.site_info && Page.site_info.auth_address)) {
        Page.cmd("wrapperNotification", ["info", "Please connect to EpixNet first."]);
        return false;
      }
      if (this.xid_name) {
        return true;
      }
      this.xid_loading = false;
      this.resolveMyXidName(function(name) {
        if (name) {
          cb();
        } else {
          Page.cmd("certXid", [], function(result) {
            if (result === "ok") {
              self.xid_loading = false;
              self.resolveMyXidName(function(name2) {
                if (name2) {
                  cb();
                }
              });
            }
          });
        }
      });
      return false;
    }
  }

  Object.assign(User.prototype, LogMixin);
  window.User = new User();

})();
