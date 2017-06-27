// @ts-nocheck
var cache = {};
var scache = {};
function registerRender(id, options) {
	cache[id] = (options.render || options.template || '').toString();
}
function registerStyle(id, style) {
	scache[id] = { new: style.class, old: style.class };
}
function renderChanged(id, options) {
	var render = (options.render || options.template || '').toString(),
		change = cache[id] !== render;
	if (change) {
		cache[id] = render;
	}
	return change;
}
function styleChanged(id, style) {
	var change = scache[id].new !== style.class;
	if (change) {
		scache[id].old = scache[id].new;
		scache[id].new = style.class;
	}
	return change;
}
function updateStyle(id, style) {
	var sty = document.head.querySelector('#' + scache[id].old);
	if (sty) {
		sty.setAttribute('id', style.class);
		sty.textContent = style.text;
	}
}

module.exports = function (comp, compId) {
	if (comp.hot) {
		(function () {
			var hmrAPI = require('vue-hot-reload-api');
			hmrAPI.install(require('vue'));
			if (!hmrAPI.compatible) {
				console.warn('[VSH] vue-hot-reload-api is not compatible with the version of Vue you are using.');
			} else {
				var vm = comp.exports;
				if (comp.exports.__esModule) vm = vm.default;
				comp.hot.accept();
				var opts = vm.$options || vm.options;
				if (!comp.hot.data) {
					if (hmrAPI.rerender && hmrAPI.reload) registerRender(compId, opts);
					if (opts.style) registerStyle(compId, opts.style);
					hmrAPI.createRecord(compId, vm);
				} else {
					if (hmrAPI.rerender && hmrAPI.reload) {
						if (opts.render && renderChanged(compId, opts)) {
							hmrAPI.rerender(compId, opts);
							console.log('[VSH] Component ' + compId + ' has ben rerendered');
						} else {
							hmrAPI.reload(compId, opts);
							console.log('[VSH] Component ' + compId + ' has ben reloaded');
						}
					} else {
						hmrAPI.update(compId, vm, opts.template);
					}
					if (opts.style && styleChanged(compId, opts.style)) {
						updateStyle(compId, opts.style);
					}
				}
			}
		})();
	}
};