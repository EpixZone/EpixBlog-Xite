(function() {
  var EpixFrame = window.EpixFrame;

  class EpixBlog extends EpixFrame {
    init() {
      this.data = null;
      this.site_info = null;
      this.server_info = null;
      this.page = 1;
      this.my_post_votes = {};
      this.initial_load = true;

      this.event_page_load = $.Deferred();
      this.event_site_info = $.Deferred();

      this.publish = this.publish.bind(this);
      this.getObject = this.getObject.bind(this);
      this.getContent = this.getContent.bind(this);
      this.saveContent = this.saveContent.bind(this);
      this.submitPostVote = this.submitPostVote.bind(this);
      this.pageLoaded = this.pageLoaded.bind(this);
      this.actionSetSiteInfo = this.actionSetSiteInfo.bind(this);
      this.setSiteinfo = this.setSiteinfo.bind(this);

      var self = this;

      // Editable items on own site
      $.when(this.event_page_load, this.event_site_info).done(function() {
        if (self.site_info.settings.own || self.data.demo) {
          self.addInlineEditors();
          self.checkPublishbar();
          $(".publishbar").off("click").on("click", self.publish);
          $(".posts .button.new").css("display", "inline-block");
          $(".editbar .icon-help").off("click").on("click", function() {
            $(".editbar .markdown-help").css("display", "block");
            $(".editbar .markdown-help").toggleClassLater("visible", 10);
            $(".editbar .icon-help").toggleClass("active");
            return false;
          });
        }
      });

      $.when(this.event_site_info).done(function() {
        self.log("event site info");
        // Set avatar
        var imagedata = new Identicon(self.site_info.address, 70).toString();
        $("body").append("<style>.avatar { background-image: url(data:image/png;base64," + imagedata + ") }</style>");
        self.initFollowButton();
      });

      $(".left-more-link").on("click", function() {
        $(".left .left-more").slideToggle();
        $(".left").toggleClass("show-more");
        return false;
      });

      this.log("inited!");
    }

    initFollowButton() {
      this.follow = new Follow($(".feed-follow"));
      this.follow.addFeed("Posts", "SELECT post_id AS event_uri, 'post' AS type, date_published AS date_added, title AS title, body AS body, '?Post:' || post_id AS url FROM post", true);

      if (Page.site_info.cert_user_id) {
        var user_dir = Page.site_info.xid_directory || Page.site_info.auth_address;
        var username = User.xid_name || user_dir;
        this.follow.addFeed("Username mentions", "SELECT 'mention' AS type, date_added, post.title AS title, keyvalue.value || ': ' || comment.body AS body, '?Post:' || comment.post_id AS url FROM comment LEFT JOIN json USING (json_id) LEFT JOIN json AS json_content ON (json_content.directory = json.directory AND json_content.file_name='content.json') LEFT JOIN keyvalue ON (keyvalue.json_id = json_content.json_id AND key = 'cert_user_id') LEFT JOIN post ON (comment.post_id = post.post_id) WHERE comment.body LIKE '%[" + username + "%' OR comment.body LIKE '%@" + username + "%'", true);
      }

      this.follow.addFeed("Comments", "SELECT 'comment' AS type, date_added, post.title AS title, keyvalue.value || ': ' || comment.body AS body, '?Post:' || comment.post_id AS url FROM comment LEFT JOIN json USING (json_id) LEFT JOIN json AS json_content ON (json_content.directory = json.directory AND json_content.file_name='content.json') LEFT JOIN keyvalue ON (keyvalue.json_id = json_content.json_id AND key = 'cert_user_id') LEFT JOIN post ON (comment.post_id = post.post_id)");
      this.follow.init();
    }

    loadData(query) {
      var self = this;
      if (!query) query = "new";
      if (query === "old") {
        query = "SELECT key, value FROM json LEFT JOIN keyvalue USING (json_id) WHERE path = 'data.json'";
      } else {
        query = "SELECT key, value FROM json LEFT JOIN keyvalue USING (json_id) WHERE directory = '' AND file_name = 'data.json'";
      }
      this.cmd("dbQuery", [query], function(res) {
        self.data = {};
        if (res) {
          for (var i = 0; i < res.length; i++) {
            self.data[res[i].key] = res[i].value;
          }
          if (self.data.title) $(".left h1 a:not(.editable-edit)").html(self.data.title).data("content", self.data.title);
          if (self.data.description) $(".left h2").html(Text.renderMarked(self.data.description)).data("content", self.data.description);
          if (self.data.links) $(".left .links").html(Text.renderMarked(self.data.links)).data("content", self.data.links);
        }
      });
    }

    loadLastcomments(type, cb) {
      if (!type) type = "show";
      if (!cb) cb = false;
      var self = this;
      var query = "SELECT comment.*, json_content.json_id AS content_json_id, keyvalue.value AS cert_user_id, json.directory, post.title AS post_title " +
        "FROM comment " +
        "LEFT JOIN json USING (json_id) " +
        "LEFT JOIN json AS json_content ON (json_content.directory = json.directory AND json_content.file_name='content.json') " +
        "LEFT JOIN keyvalue ON (keyvalue.json_id = json_content.json_id AND key = 'cert_user_id') " +
        "LEFT JOIN post ON (comment.post_id = post.post_id) " +
        "WHERE post.title IS NOT NULL " +
        "ORDER BY date_added DESC LIMIT 3";

      this.cmd("dbQuery", [query], function(res) {
        if (res.length) {
          $(".lastcomments").css("display", "block");
          res.reverse();
        }
        for (var i = 0; i < res.length; i++) {
          var lastcomment = res[i];
          var elem = $("#lastcomment_" + lastcomment.json_id + "_" + lastcomment.comment_id);
          if (elem.length === 0) {
            elem = $(".lastcomment.template").clone().removeClass("template").attr("id", "lastcomment_" + lastcomment.json_id + "_" + lastcomment.comment_id);
            if (type !== "noanim") {
              elem.cssSlideDown();
            }
            elem.prependTo(".lastcomments ul");
          }
          self.applyLastcommentdata(elem, lastcomment);
        }
        if (cb) cb();
      });
    }

    applyLastcommentdata(elem, lastcomment) {
      var user_address = lastcomment.directory.replace("users/", "");
      var resolve_address = user_address;
      if (user_address === Page.site_info.xid_directory) {
        resolve_address = Page.site_info.auth_address;
      }
      User.resolveXidName(resolve_address, function(name, tld, avatar) {
        elem.find(".comment-avatar").remove();
        if (name) {
          var display = name + "." + tld;
          elem.find(".user_name").text(display + ":").css("color", Text.toColor(display));
          if (avatar) {
            elem.find(".user_name").before("<img class='comment-avatar' src='" + avatar + "' onerror=\"this.style.display='none'\">");
          }
        } else {
          elem.find(".user_name").text(Text.formatUsername(user_address) + ":").css("color", Text.toColor(user_address));
        }
      });

      var body = Text.renderMarked(lastcomment.body);
      body = body.replace(/[\r\n]/g, " ");
      body = body.replace(/<blockquote>.*?<\/blockquote>/g, " ");
      body = body.replace(/<.*?>/g, " ");
      if (body.length > 60) {
        body = body.substring(0, 61).replace(/(.*) .*?$/, "$1") + " ...";
      }
      elem.find(".body").html(body);

      var title_hash = lastcomment.post_title.replace(/[#?& ]/g, "+").replace(/[+]+/g, "+");
      var comment_address = lastcomment.comment_id + "_" + lastcomment.directory.replace('users/', '');
      elem.find(".postlink").text(lastcomment.post_title).attr("href", "?Post:" + lastcomment.post_id + ":" + title_hash);
      elem.find(".postlink").off("click").on("click", function() {
        sessionStorage.setItem("scroll_to_comment", "comment_" + comment_address);
      });
    }

    applyPagerdata(page, limit, has_next) {
      var pager = $(".pager");
      if (page > 1) {
        pager.find(".prev").css("display", "inline-block").attr("href", "?page=" + (page - 1));
      }
      if (has_next) {
        pager.find(".next").css("display", "inline-block").attr("href", "?page=" + (page + 1));
      }
    }

    routeUrl(url) {
      this.log("Routing url:", url);
      var match;
      if (match = url.match(/Post:([0-9]+)/)) {
        $("body").addClass("page-post");
        this.post_id = parseInt(match[1]);
        var comment_match = url.match(/:(comment_[^\s:]+)\s*$/);
        this.scroll_to_comment = comment_match ? comment_match[1] : null;
        if (!this.scroll_to_comment) {
          var pending = sessionStorage.getItem("scroll_to_comment");
          if (pending) {
            this.scroll_to_comment = pending;
            sessionStorage.removeItem("scroll_to_comment");
          }
        }
        this.pagePost();
      } else {
        $("body").addClass("page-main");
        if (match = url.match(/page=([0-9]+)/)) {
          this.page = parseInt(match[1]);
        }
        this.pageMain();
      }
    }

    // - Pages -

    pagePost() {
      var self = this;
      this.cmd("dbQuery", ["SELECT *, (SELECT COUNT(*) FROM post_vote WHERE post_vote.post_id = post.post_id) AS votes FROM post WHERE post_id = " + this.post_id + " LIMIT 1"], function(res) {
        var parse_res = function(res) {
          if (res.length) {
            var post = res[0];
            self.applyPostdata($(".post-full"), post, true);
            $(".post-full").css("display", "block");
            $(".post-full .like").attr("id", "post_like_" + post.post_id).off("click").on("click", self.submitPostVote);
            $(".notfound").css("display", "none");
            if (self.scroll_to_comment) {
              var target_id = self.scroll_to_comment;
              Comments.pagePost(self.post_id, function() {
                setTimeout(function() {
                  var target = document.getElementById(target_id);
                  if (target) {
                    target.scrollIntoView({behavior: "smooth", block: "center"});
                    $(target).addClass("comment-highlight");
                    setTimeout(function() { $(target).removeClass("comment-highlight"); }, 1500);
                  }
                }, 300);
              });
            } else {
              Comments.pagePost(self.post_id);
            }
          } else {
            $(".notfound").css("display", "block");
            $(".post-full").css("display", "none");
          }
          self.pageLoaded();
          User.checkCert();
        };

        if (res.error) {
          self.cmd("dbQuery", ["SELECT *, -1 AS votes FROM post WHERE post_id = " + self.post_id + " LIMIT 1"], parse_res);
        } else {
          parse_res(res);
        }
      });
    }

    pageMain() {
      var self = this;
      var limit = 15;
      var query = "SELECT post.*, COUNT(comment_id) AS comments, " +
        "(SELECT COUNT(*) FROM post_vote WHERE post_vote.post_id = post.post_id) AS votes " +
        "FROM post " +
        "LEFT JOIN comment USING (post_id) " +
        "GROUP BY post_id " +
        "ORDER BY date_published DESC " +
        "LIMIT " + ((this.page - 1) * limit) + ", " + (limit + 1);

      this.cmd("dbQuery", [query], function(res) {
        var parse_res = function(res) {
          var s = +(new Date);
          if (res.length > limit) {
            res.pop();
            self.applyPagerdata(self.page, limit, true);
          } else {
            self.applyPagerdata(self.page, limit, false);
          }

          res.reverse();
          for (var i = 0; i < res.length; i++) {
            var post = res[i];
            var elem = $("#post_" + post.post_id);
            if (elem.length === 0) {
              elem = $(".post.template").clone().removeClass("template").attr("id", "post_" + post.post_id);
              elem.prependTo(".posts");
              elem.find(".like").attr("id", "post_like_" + post.post_id).off("click").on("click", self.submitPostVote);
            }
            self.applyPostdata(elem, post);
          }
          self.pageLoaded();
          self.log("Posts loaded in", ((+(new Date)) - s), "ms");

          $(".posts .new").off("click").on("click", function() {
            self.cmd("fileGet", ["data/data.json"], function(res) {
              var data = JSON.parse(res);
              data.post.unshift({
                post_id: data.next_post_id,
                title: "New blog post",
                date_published: (+(new Date)) / 1000,
                body: "Blog post body"
              });
              data.next_post_id += 1;

              var elem = $(".post.template").clone().removeClass("template");
              self.applyPostdata(elem, data.post[0]);
              elem.hide();
              elem.prependTo(".posts").slideDown();
              self.addInlineEditors(elem);

              self.writeData(data);
            });
            return false;
          });
        };

        if (res.error) {
          var query2 = "SELECT post.*, COUNT(comment_id) AS comments, -1 AS votes " +
            "FROM post " +
            "LEFT JOIN comment USING (post_id) " +
            "GROUP BY post_id " +
            "ORDER BY date_published DESC " +
            "LIMIT " + ((self.page - 1) * limit) + ", " + (limit + 1);
          self.cmd("dbQuery", [query2], parse_res);
        } else {
          parse_res(res);
        }
      });
    }

    // - EOF Pages -

    // All page content loaded
    pageLoaded() {
      $("body").addClass("loaded");
      $('pre code').each(function(i, block) {
        hljs.highlightBlock(block);
      });
      this.event_page_load.resolve();
      this.cmd("innerLoaded", true);
      if (this.initial_load) {
        this.initial_load = false;
        this.setLoadingProgress(100, "Ready!");
        this.hideLoading();
      }
    }

    addInlineEditors(parent) {
      this.logStart("Adding inline editors");
      var elems = $("[data-editable]:visible", parent);
      for (var i = 0; i < elems.length; i++) {
        var elem = $(elems[i]);
        if (!elem.data("editor") && !elem.hasClass("editor")) {
          var editor = new InlineEditor(elem, this.getContent, this.saveContent, this.getObject);
          elem.data("editor", editor);
        }
      }
      this.logEnd("Adding inline editors");
    }

    addImageZoom(parent) {
      var self = this;
      $("img", parent).each(function(i, img_elem) {
        img_elem.onload = function() {
          var $img = $(img_elem);
          var alt = $img.attr("alt");
          var size = alt ? alt.match("([0-9]+)x([0-9]+)") : null;
          if (!size) return;
          if ($img.width() < parseInt(size[1]) || $img.height() < parseInt(size[2])) {
            $img.attr("data-action", "zoom");
          }
          img_elem.onload = null;
        };
        if (img_elem.complete) {
          img_elem.onload();
        }
      });
    }

    checkPublishbar() {
      if (this.data != null && (!this.data["modified"] || this.data["modified"] > this.site_info.content.modified)) {
        $(".publishbar").addClass("visible");
      } else {
        $(".publishbar").removeClass("visible");
      }
    }

    publish() {
      var self = this;
      if (this.site_info.privatekey) {
        this.cmd("sitePublish", ["stored"], function(res) {
          self.log("Publish result:", res);
        });
      } else {
        this.cmd("wrapperPrompt", ["Enter your private key:", "password"], function(privatekey) {
          $(".publishbar .button").addClass("loading");
          self.cmd("sitePublish", [privatekey], function(res) {
            $(".publishbar .button").removeClass("loading");
            self.log("Publish result:", res);
          });
        });
      }
      return false;
    }

    applyPostdata(elem, post, full) {
      if (!full) full = false;
      var title_hash = post.title.replace(/[#?& ]/g, "+").replace(/[+]+/g, "+");
      elem.data("object", "Post:" + post.post_id);
      $(".title .editable", elem).html(post.title).attr("href", "?Post:" + post.post_id + ":" + title_hash).data("content", post.title);
      var date_published = Time.since(post.date_published || (+(new Date)) / 1000);
      post.body = post.body.replace(/^\* \* \*/m, "---");
      if (post.body.match(/^---/m)) {
        date_published += " &middot; " + Time.readtime(post.body);
        $(".more", elem).css("display", "inline-block").attr("href", "?Post:" + post.post_id + ":" + title_hash);
      }
      $(".details .published", elem).html(date_published).data("content", post.date_published);
      if (post.comments > 0) {
        $(".details .comments-num", elem).css("display", "inline").attr("href", "?Post:" + post.post_id + ":" + title_hash);
        if (post.comments > 1) {
          $(".details .comments-num .num", elem).text(post.comments + " comments");
        } else {
          $(".details .comments-num .num", elem).text(post.comments + " comment");
        }
      } else {
        $(".details .comments-num", elem).css("display", "none");
      }

      if (post.votes > 0) {
        $(".like .num", elem).text(post.votes);
      } else if (post.votes === -1) {
        $(".like", elem).css("display", "none");
      } else {
        $(".like .num", elem).text("");
      }

      if (User.my_post_votes[post.post_id]) {
        $(".like", elem).addClass("active");
      }

      var body;
      if (full) {
        body = post.body;
      } else {
        body = post.body.replace(/^([\s\S]*?)\n---\n[\s\S]*$/, "$1");
      }

      if ($(".body", elem).data("content") !== post.body) {
        $(".body", elem).html(Text.renderMarked(body)).data("content", post.body);
        this.addImageZoom(elem);
      }
    }

    setLoadingProgress(percent, label) {
      var bar = document.getElementById("loading-bar-fill");
      var step = document.getElementById("loading-step");
      if (bar) bar.style.width = percent + "%";
      if (step) step.textContent = label;
    }

    hideLoading() {
      var overlay = document.getElementById("loading-overlay");
      if (overlay) {
        overlay.classList.add("fade-out");
        setTimeout(function() {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 500);
      }
    }

    startLoadingTimeout() {
      var self = this;
      setTimeout(function() {
        if (self.initial_load) {
          self.initial_load = false;
          self.hideLoading();
        }
      }, 15000);
    }

    onOpenWebsocket(e) {
      var self = this;
      this.startLoadingTimeout();
      this.setLoadingProgress(10, "Fetching server info...");
      this.cmd("serverInfo", {}, function(ret) {
        self.server_info = ret;
        var lang = ret.language || "en";
        self.setLoadingProgress(25, "Loading language...");
        loadLanguage(lang, function() {
          self.setLoadingProgress(45, "Loading data...");
          self.loadData();
          self.cmd("siteInfo", {}, function(site_info) {
            self.setLoadingProgress(65, "Loading site info...");
            self.setSiteinfo(site_info);
            User.updateMyInfo(function() {
              self.setLoadingProgress(90, "Rendering page...");
              self.routeUrl(window.location.search.substring(1));
            });
            translateDOM();
          });
          self.loadLastcomments("noanim");
        });
      });
    }

    getObject(elem) {
      return elem.parents("[data-object]:first");
    }

    getContent(elem, raw) {
      if (!raw) raw = false;
      var parts = this.getObject(elem).data("object").split(":");
      var type = parts[0];
      var id = parseInt(parts[1]);
      var content = elem.data("content");
      if (elem.data("editable-mode") === "timestamp") {
        content = Time.date(content, "full");
      }
      if (elem.data("editable-mode") === "simple" || raw) {
        return content;
      } else {
        return Text.renderMarked(content);
      }
    }

    saveContent(elem, content, cb) {
      if (!cb) cb = false;
      if (elem.data("deletable") && content === null) return this.deleteObject(elem, cb);
      if (elem.data('editableMode') === "timestamp") {
        elem.data("content", Time.timestamp(content));
      } else {
        elem.data("content", content);
      }
      var parts = this.getObject(elem).data("object").split(":");
      var type = parts[0];
      var id = parseInt(parts[1]);
      if (type === "Post" || type === "Site") {
        this.saveSite(elem, type, id, content, cb);
      } else if (type === "Comment") {
        this.saveComment(elem, type, id, content, cb);
      }
    }

    saveSite(elem, type, id, content, cb) {
      var self = this;
      this.cmd("fileGet", ["data/data.json"], function(res) {
        var data = JSON.parse(res);
        if (type === "Post") {
          var post = null;
          for (var i = 0; i < data.post.length; i++) {
            if (data.post[i].post_id === id) {
              post = data.post[i];
              break;
            }
          }

          if (elem.data("editable-mode") === "timestamp") {
            content = Time.timestamp(content);
          }

          post[elem.data("editable")] = content;
        } else if (type === "Site") {
          data[elem.data("editable")] = content;
        }

        self.writeData(data, function(res) {
          if (cb) {
            if (res === true) {
              self.cleanupImages();
              if (elem.data("editable-mode") === "simple") {
                cb(content);
              } else if (elem.data("editable-mode") === "timestamp") {
                cb(Time.since(content));
              } else {
                cb(Text.renderMarked(content));
              }
            } else {
              cb(false);
            }
          }
        });
      });
    }

    saveComment(elem, type, id, content, cb) {
      var self = this;
      this.log("Saving comment...", id);
      this.getObject(elem).css("height", "auto");
      var user_dir = Page.site_info.xid_directory || Page.site_info.auth_address;
      var inner_path = "data/users/" + user_dir + "/data.json";
      Page.cmd("fileGet", {"inner_path": inner_path, "required": false}, function(data) {
        data = JSON.parse(data);
        var comment = null;
        for (var i = 0; i < data.comment.length; i++) {
          if (data.comment[i].comment_id === id) {
            comment = data.comment[i];
            break;
          }
        }
        comment[elem.data("editable")] = content;
        var json_raw = unescape(encodeURIComponent(JSON.stringify(data, undefined, '\t')));
        self.writePublish(inner_path, btoa(json_raw), function(res) {
          if (res === true) {
            User.checkCert("updaterules");
            if (cb) cb(Text.renderMarked(content, {"sanitize": true}));
          } else {
            self.cmd("wrapperNotification", ["error", "File write error: " + res]);
            if (cb) cb(false);
          }
        });
      });
    }

    deleteObject(elem, cb) {
      var self = this;
      if (!cb) cb = false;
      var parts = elem.data("object").split(":");
      var type = parts[0];
      var id = parseInt(parts[1]);

      if (type === "Post") {
        this.cmd("fileGet", ["data/data.json"], function(res) {
          var data = JSON.parse(res);
          var post = null;
          for (var i = 0; i < data.post.length; i++) {
            if (data.post[i].post_id === id) {
              post = data.post[i];
              break;
            }
          }
          if (!post) return false;
          data.post.splice(data.post.indexOf(post), 1);

          self.writeData(data, function(res) {
            if (cb) cb();
            if (res === true) elem.slideUp();
          });
        });
      } else if (type === "Comment") {
        var user_dir = Page.site_info.xid_directory || Page.site_info.auth_address;
        var inner_path = "data/users/" + user_dir + "/data.json";
        this.cmd("fileGet", {"inner_path": inner_path, "required": false}, function(data) {
          data = JSON.parse(data);
          var comment = null;
          for (var i = 0; i < data.comment.length; i++) {
            if (data.comment[i].comment_id === id) {
              comment = data.comment[i];
              break;
            }
          }
          data.comment.splice(data.comment.indexOf(comment), 1);
          var json_raw = unescape(encodeURIComponent(JSON.stringify(data, undefined, '\t')));
          self.writePublish(inner_path, btoa(json_raw), function(res) {
            if (res === true) {
              elem.slideUp();
            }
            if (cb) cb();
          });
        });
      }
    }

    writeData(data, cb) {
      var self = this;
      if (!cb) cb = null;
      if (!data) {
        return this.log("Data missing");
      }
      this.data["modified"] = data.modified = Time.timestamp();
      var json_raw = unescape(encodeURIComponent(JSON.stringify(data, undefined, '\t')));
      this.cmd("fileWrite", ["data/data.json", btoa(json_raw)], function(res) {
        if (res === "ok") {
          if (cb) cb(true);
        } else {
          self.cmd("wrapperNotification", ["error", "File write error: " + res]);
          if (cb) cb(false);
        }
        self.checkPublishbar();
      });

      // Updating title in content.json
      this.cmd("fileGet", ["content.json"], function(content) {
        content = content.replace(/"title": ".*?"/, '"title": "' + data.title + '"');
        content = unescape(encodeURIComponent(content));
        self.cmd("fileWrite", ["content.json", btoa(content)], function(res) {
          if (res !== "ok") {
            self.cmd("wrapperNotification", ["error", "Content.json write error: " + res]);
          }
          if (self.site_info["privatekey"]) {
            self.cmd("siteSign", ["stored", "content.json"], function(res) {
              self.log("Sign result", res);
            });
          }
        });
      });
    }

    writePublish(inner_path, data, cb) {
      var self = this;
      this.cmd("fileWrite", [inner_path, data], function(res) {
        if (res !== "ok") {
          self.cmd("wrapperNotification", ["error", "File write error: " + res]);
          cb(false);
          return false;
        }
        self.cmd("sitePublish", {"inner_path": inner_path}, function(res) {
          if (res === "ok") {
            cb(true);
          } else {
            cb(res);
          }
        });
      });
    }

    submitPostVote(e) {
      var self = this;
      if (!User.requireXid(function() { self.submitPostVote(e); })) {
        return false;
      }

      var elem = $(e.currentTarget);
      elem.toggleClass("active").addClass("loading");
      var user_dir = Page.site_info.xid_directory || this.site_info.auth_address;
      var inner_path = "data/users/" + user_dir + "/data.json";
      Page.cmd("fileGet", {"inner_path": inner_path, "required": false}, function(data) {
        if (data) {
          data = JSON.parse(data);
        } else {
          data = {"next_comment_id": 1, "comment": [], "comment_vote": {}, "post_vote": {}};
        }

        if (!data.post_vote) {
          data.post_vote = {};
        }
        var post_id = elem.attr("id").match("_([0-9]+)$")[1];

        if (elem.hasClass("active")) {
          data.post_vote[post_id] = 1;
        } else {
          delete data.post_vote[post_id];
        }
        var json_raw = unescape(encodeURIComponent(JSON.stringify(data, undefined, '\t')));

        var current_num = parseInt(elem.find(".num").text());
        if (!current_num) current_num = 0;
        if (elem.hasClass("active")) {
          elem.find(".num").text(current_num + 1);
        } else {
          elem.find(".num").text(current_num - 1);
        }

        Page.writePublish(inner_path, btoa(json_raw), function(res) {
          elem.removeClass("loading");
          self.log("Writepublish result", res);
        });
      });
      return false;
    }

    cleanupImages() {
      var self = this;
      this.cmd("fileGet", ["data/data.json"], function(data) {
        Page.cmd("fileList", "data/img", function(files) {
          for (var i = 0; i < files.length; i++) {
            var file = files[i];
            if (file.indexOf("post_") !== 0) continue;
            if (data.indexOf(file) === -1) {
              self.log("Deleting image", file, "...");
              self.cmd("fileDelete", "data/img/" + file);
            }
          }
        });
      });
    }

    onRequest(cmd, message) {
      if (cmd === "setSiteInfo") {
        this.actionSetSiteInfo(message);
      } else {
        this.log("Unknown command", message);
      }
    }

    actionSetSiteInfo(message) {
      this.setSiteinfo(message.params);
      this.checkPublishbar();
    }

    setSiteinfo(site_info) {
      var self = this;
      this.site_info = site_info;
      this.event_site_info.resolve(site_info);
      if ($("body").hasClass("page-post")) User.checkCert();
      if (site_info.event && site_info.event[0] === "file_done" && site_info.event[1].match(/.*users.*data.json$/)) {
        if ($("body").hasClass("page-post")) {
          this.pagePost();
          Comments.loadComments();
          this.loadLastcomments();
        }
        if ($("body").hasClass("page-main")) {
          RateLimit(500, function() {
            self.pageMain();
            self.loadLastcomments();
          });
        }
      } else if (site_info.event && site_info.event[0] === "file_done" && site_info.event[1] === "data/data.json") {
        this.loadData();
        if ($("body").hasClass("page-main")) this.pageMain();
        if ($("body").hasClass("page-post")) this.pagePost();
      } else if (site_info.event && site_info.event[0] === "cert_changed" && site_info.cert_user_id) {
        this.initFollowButton();
        var mentions_menu_elem = this.follow.feeds["Username mentions"] ? this.follow.feeds["Username mentions"][1] : null;
        if (mentions_menu_elem) {
          setTimeout(function() {
            if (!mentions_menu_elem.hasClass("selected")) {
              mentions_menu_elem.trigger("click");
            }
          }, 100);
        }
      }
    }
  }

  window.Page = new EpixBlog();

})();
