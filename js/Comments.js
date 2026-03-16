(function() {

  class Comments {
    pagePost(post_id, cb) {
      var self = this;
      this.post_id = post_id;
      this.rules = {};
      $(".button-submit-comment").off("click").on("click", function() {
        self.submitComment();
        return false;
      });
      this.loadComments("noanim", cb);
      this.autoExpand($(".comment-textarea"));

      $(".certselect").off("click").on("click", function() {
        User.triggerCertXid();
        return false;
      });

      // Delegated handler for comment reference links (reply quotes)
      $(".comments").off("click", "a[href^='#comment_']").on("click", "a[href^='#comment_']", function(e) {
        e.preventDefault();
        e.stopPropagation();
        var target_id = $(this).attr("href").substring(1);
        var target = document.getElementById(target_id);
        if (target) {
          target.scrollIntoView({behavior: "smooth", block: "center"});
          $(target).addClass("comment-highlight");
          setTimeout(function() { $(target).removeClass("comment-highlight"); }, 1500);
        }
        return false;
      });
    }

    loadComments(type, cb) {
      if (!type) type = "show";
      if (!cb) cb = false;
      var self = this;
      var query = "SELECT comment.*, json_content.json_id AS content_json_id, keyvalue.value AS cert_user_id, json.directory, " +
        "(SELECT COUNT(*) FROM comment_vote WHERE comment_vote.comment_uri = comment.comment_id || '@' || json.directory)+1 AS votes " +
        "FROM comment " +
        "LEFT JOIN json USING (json_id) " +
        "LEFT JOIN json AS json_content ON (json_content.directory = json.directory AND json_content.file_name='content.json') " +
        "LEFT JOIN keyvalue ON (keyvalue.json_id = json_content.json_id AND key = 'cert_user_id') " +
        "WHERE post_id = " + this.post_id + " ORDER BY date_added DESC";

      Page.cmd("dbQuery", query, function(comments) {
        $("#Comments_header").text(comments.length + (comments.length > 1 ? " Comments:" : " Comment:"));
        for (var i = 0; i < comments.length; i++) {
          var comment = comments[i];
          var user_address = comment.directory.replace("users/", "");
          var comment_address = comment.comment_id + "_" + user_address;
          var elem = $("#comment_" + comment_address);
          if (elem.length === 0) {
            elem = $(".comment.template").clone().removeClass("template").attr("id", "comment_" + comment_address).data("post_id", self.post_id);
            if (type !== "noanim") {
              elem.cssSlideDown();
            }
            $(".reply", elem).off("click").on("click", function(e) {
              return self.buttonReply($(e.target).parents(".comment"));
            });
          }
          self.applyCommentData(elem, comment);
          elem.appendTo(".comments");
        }
        setTimeout(function() {
          Page.addInlineEditors(".comments");
        }, 1000);
        if (cb) cb();
      });
    }

    applyCommentData(elem, comment) {
      var user_address = comment.directory.replace("users/", "");
      $(".comment-body", elem).html(Text.renderMarked(comment.body, {"sanitize": true}));

      // Resolve xID name for commenter
      var resolve_address = user_address;
      if (user_address === Page.site_info.xid_directory) {
        resolve_address = Page.site_info.auth_address;
      }
      User.resolveXidName(resolve_address, function(name, tld, avatar) {
        $(".comment-avatar", elem).remove();
        if (name) {
          var display = name + "." + tld;
          $(".user_name", elem).text(display).css("color", Text.toColor(display)).attr("title", display + ": " + user_address);
          if (avatar) {
            $(".user_name", elem).before("<img class='comment-avatar' src='" + avatar + "' onerror=\"this.style.display='none'\">");
          }
        } else {
          $(".user_name", elem).text(Text.formatUsername(user_address)).css("color", Text.toColor(user_address)).attr("title", user_address);
        }
      });

      $(".added", elem).text(Time.since(comment.date_added)).attr("title", Time.date(comment.date_added, "long"));
      // Add inline editor
      if (user_address === (Page.site_info.xid_directory || Page.site_info.auth_address)) {
        $(elem).attr("data-object", "Comment:" + comment.comment_id).attr("data-deletable", "yes");
        $(".comment-body", elem).attr("data-editable", "body").data("content", comment.body);
      }
    }

    buttonReply(elem) {
      this.log("Reply to", elem);
      var user_name = $(".user_name", elem).text();
      var post_id = elem.attr("id");
      var body_add = "> [" + user_name + "](#" + post_id + "): ";
      var elem_quote = $(".comment-body", elem).clone();
      $("blockquote", elem_quote).remove();
      body_add += elem_quote.text().trim().replace(/\n/g, "\n> ");
      body_add += "\n\n";
      $(".comment-new .comment-textarea").val($(".comment-new .comment-textarea").val() + body_add);
      $(".comment-new .comment-textarea").trigger("input").focus();
      return false;
    }

    submitComment() {
      var self = this;
      if (!User.requireXid(function() { self.submitComment(); })) {
        return false;
      }

      var body = $(".comment-new .comment-textarea").val();
      if (!body) {
        $(".comment-new .comment-textarea").focus();
        return false;
      }

      $(".comment-new .button-submit").addClass("loading");
      var user_dir = Page.site_info.xid_directory || Page.site_info.auth_address;
      var inner_path = "data/users/" + user_dir + "/data.json";
      Page.cmd("fileGet", {"inner_path": inner_path, "required": false}, function(data) {
        if (data) {
          data = JSON.parse(data);
        } else {
          data = {"next_comment_id": 1, "comment": [], "comment_vote": {}, "topic_vote": {}};
        }

        data.comment.push({
          "comment_id": data.next_comment_id,
          "body": body,
          "post_id": self.post_id,
          "date_added": Time.timestamp()
        });
        data.next_comment_id += 1;
        var json_raw = unescape(encodeURIComponent(JSON.stringify(data, undefined, '\t')));
        Page.writePublish(inner_path, btoa(json_raw), function(res) {
          $(".comment-new .button-submit").removeClass("loading");
          self.loadComments();
          setTimeout(function() {
            Page.loadLastcomments();
          }, 1000);
          User.checkCert("updaterules");
          self.log("Writepublish result", res);
          if (res !== false) {
            $(".comment-new .comment-textarea").val("");
          }
        });
      });
    }

    autoExpand(elem) {
      var editor = elem[0];
      if (elem.height() > 0) elem.height(1);

      var self = this;
      elem.off("input").on("input", function() {
        if (editor.scrollHeight > elem.height()) {
          var old_height = elem.height();
          elem.height(1);
          var new_height = editor.scrollHeight;
          new_height += parseFloat(elem.css("borderTopWidth"));
          new_height += parseFloat(elem.css("borderBottomWidth"));
          new_height -= parseFloat(elem.css("paddingTop"));
          new_height -= parseFloat(elem.css("paddingBottom"));

          var min_height = parseFloat(elem.css("lineHeight")) * 2;
          if (new_height < min_height) new_height = min_height + 4;

          elem.height(new_height - 4);
        }
        if (User.rules.max_size) {
          if (elem.val().length > 0) {
            var current_size = User.rules.current_size + elem.val().length + 90;
          } else {
            var current_size = User.rules.current_size;
          }
        }
      });
      if (elem.height() > 0) elem.trigger("input");
      else elem.height("48px");
    }
  }

  Object.assign(Comments.prototype, LogMixin);
  window.Comments = new Comments();

})();
