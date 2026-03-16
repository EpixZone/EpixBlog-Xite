(function() {

  var translations = {};

  window.loadLanguage = function(lang, cb) {
    if (!lang || lang === "en") {
      if (cb) cb();
      return;
    }
    Page.cmd("fileGet", {"inner_path": "languages/" + lang + ".json", "required": false}, function(data) {
      if (data) {
        try {
          translations = JSON.parse(data);
        } catch (e) {
          translations = {};
        }
      } else {
        translations = {};
      }
      if (cb) cb();
    });
  };

  window._ = function(s) {
    if (translations && translations[s]) {
      return translations[s];
    }
    return s;
  };

  window.translateDOM = function() {
    var selectors = {
      ".button-certselect": "Connect xID",
      ".readmore": "Read more",
      ".reply-text": "Reply",
      ".button-submit-comment": "Submit comment"
    };
    for (var sel in selectors) {
      var val = selectors[sel];
      if (typeof val === "object") {
        $(sel).attr(val.attr, _(val.text));
      } else {
        $(sel).not(".template " + sel).each(function() {
          var $el = $(this);
          if ($el.children().length === 0) {
            $el.text(_(val));
          }
        });
      }
    }
  };

})();
