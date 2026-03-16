(function() {

  jQuery.fn.readdClass = function(class_name) {
    var elem = this;
    elem.removeClass(class_name);
    setTimeout(function() {
      elem.addClass(class_name);
    }, 1);
    return this;
  };

  jQuery.fn.removeLater = function(time) {
    if (time == null) time = 500;
    var elem = this;
    setTimeout(function() {
      elem.remove();
    }, time);
    return this;
  };

  jQuery.fn.hideLater = function(time) {
    if (time == null) time = 500;
    this.cssLater("display", "none", time);
    return this;
  };

  jQuery.fn.addClassLater = function(class_name, time, mode) {
    if (time == null) time = 5;
    if (mode == null) mode = "clear";
    var elem = this;
    if (!elem[0].timers) elem[0].timers = {};
    var timers = elem[0].timers;
    if (timers[class_name] && mode === "clear") clearInterval(timers[class_name]);
    timers[class_name] = setTimeout(function() {
      elem.addClass(class_name);
    }, time);
    return this;
  };

  jQuery.fn.removeClassLater = function(class_name, time, mode) {
    if (time == null) time = 500;
    if (mode == null) mode = "clear";
    var elem = this;
    if (!elem[0].timers) elem[0].timers = {};
    var timers = elem[0].timers;
    if (timers[class_name] && mode === "clear") clearInterval(timers[class_name]);
    timers[class_name] = setTimeout(function() {
      elem.removeClass(class_name);
    }, time);
    return this;
  };

  jQuery.fn.cssLater = function(name, val, time, mode) {
    if (time == null) time = 500;
    if (mode == null) mode = "clear";
    var elem = this;
    if (!elem[0].timers) elem[0].timers = {};
    var timers = elem[0].timers;
    if (timers[name] && mode === "clear") clearInterval(timers[name]);
    if (time === "now") {
      elem.css(name, val);
    } else {
      timers[name] = setTimeout(function() {
        elem.css(name, val);
      }, time);
    }
    return this;
  };

  jQuery.fn.toggleClassLater = function(name, val, time, mode) {
    if (time == null) time = 10;
    if (mode == null) mode = "clear";
    var elem = this;
    if (!elem[0].timers) elem[0].timers = {};
    var timers = elem[0].timers;
    if (timers[name] && mode === "clear") clearInterval(timers[name]);
    timers[name] = setTimeout(function() {
      elem.toggleClass(name, val);
    }, time);
    return this;
  };

})();
