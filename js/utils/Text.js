(function() {

  class Renderer extends marked.Renderer {
    image(href, title, text) {
      return "<code>![" + text + "](" + href + ")</code>";
    }
  }

  class Text {
    toColor(text) {
      var hash = 0;
      for (var i = 0; i < text.length; i++) {
        hash += text.charCodeAt(i) * i;
      }
      if (Page.server_info && Page.server_info.user_settings && Page.server_info.user_settings.theme === "dark") {
        return "hsl(" + (hash % 360) + ",80%,80%)";
      } else {
        return "hsl(" + (hash % 360) + ",30%,50%)";
      }
    }

    renderMarked(text, options) {
      if (!options) options = {};
      options["gfm"] = true;
      options["breaks"] = true;
      if (options.sanitize) {
        options["renderer"] = window.renderer;
      }
      text = text.replace(/((?<=\s|^)http[s]?:\/\/.*?)(?=\s|$)/g, '<$1>');
      text = marked(text, options);
      text = text.replace(/(https?:\/\/)%5B(.*?)%5D/g, '$1[$2]');
      return text;
    }

    fixLink(link) {
      return link;
    }

    toUrl(text) {
      return text.replace(/[^A-Za-z0-9]/g, "+").replace(/[+]+/g, "+").replace(/[+]+$/, "");
    }

    fixReply(text) {
      return text.replace(/(>.*\n)([^\n>])/gm, "$1\n$2");
    }

    toEpixAddress(text) {
      return text.replace(/[^A-Za-z0-9.]/g, "");
    }

    jsonEncode(obj) {
      return btoa(unescape(encodeURIComponent(JSON.stringify(obj, undefined, '\t'))));
    }

    formatUsername(username) {
      if (!username) return "Anonymous";
      if (username.match(/^epix1[a-z0-9]{38,}$/)) {
        return username.substring(0, 16) + "...";
      }
      return username;
    }
  }

  window.is_proxy = (window.location.pathname === "/");
  window.renderer = new Renderer();
  window.Text = new Text();

})();
