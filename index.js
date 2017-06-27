// @ts-nocheck
const walk = require('paul').walk;
const jst = require('jstransform');
const minimatch = require('minimatch');
const parse = require('himalaya').parse;
const { resolve, dirname } = require('path');
const utils = require('jstransform/src/utils');
const { existsSync, readFileSync } = require('fs');
const toHTML = require('himalaya/translate').toHTML;
const compiler = require('vue-template-compiler').compile;
const transpiler = require('vue-template-es2015-compiler');

let version;
try {
	version = require('vue/package.json').version;
} catch (error) {
	throw new Error('Vue is not installed. Please install it via `npm i vue`');
}


function loader(fileContent, sourceMap) {
	let callback = this.async();
	let hotId = hash(this.resourcePath);
	fileContent = jst.transform(transforms(this.resourcePath, hotId), fileContent).code;
	if (isHot(fileContent) && !isExclude(this) && process.env.NODE_ENV !== 'production') {
		fileContent += `\nrequire('vue-ts-loader/hmr-utils')(module, '${hotId}');\n`;
	}
	callback(null, fileContent, sourceMap);
}

function isHot(fileContent) {
	let regexpAll = /vue_ts_decorate_[0-9].Component/g;
	let regexpComp = /vue-ts-decorate\/component/g;
	let hasComp = regexpAll.test(fileContent) || regexpComp.test(fileContent);
	return hasComp;
}

function isExclude(loader) {
	var exclude = false;
	var opts = loader.options || {};
	if (opts.excludeHmr) {
		var excludeFiles = Array.isArray(opts.excludeHmr) ? opts.excludeHmr : [opts.excludeHmr];
		for (var i = 0, len = excludeFiles.length; i < len; i++) {
			var pattern = excludeFiles[i];
			if (minimatch(loader.resourcePath.replace(/\\/g, '/'), pattern)) {
				exclude = true;
				i = len;
			}
		}
	}
	return exclude;
}

function camelToKebabCase(str) {
	let kebab = str.replace(/([A-Z])/g, $1 => `-${$1.toLowerCase()}`);
	if (kebab.charAt(0) === '-') kebab = kebab.substring(1);
	return kebab;
}

function scopedHtml(html, className) {
	let tree = parse(html);
	walk(tree, (node, walk) => {
		if (node.tagName && ~node.tagName.indexOf('-')) {
			if (!node.attributes || !node.attributes.className) {
				node.attributes = node.attributes || {};
				node.attributes.className = [className];
			} else {
				node.attributes.className.unshift(className);
			}
			return;
		}
		if (!node.attributes || !node.attributes.className) {
			node.attributes = node.attributes || {};
			if (node.tagName === 'template') {
				let attrs = Object.keys(node.attributes)
					.filter(at => !!~camelToKebabCase(at).indexOf('v-') || at === 'scope') || [];
				if (attrs.length > 0) {
					node.children[0].content = scopedHtml(node.children[0].content, className);
				}
			} else if (node.tagName !== 'script' && node.tagName !== 'style') {
				node.attributes.className = [className];
			}
		} else {
			node.attributes.className.unshift(className);
		}
		walk(node.children || []);
	});
	return toHTML(tree);
}

function compileTemplate(filename, template) {
	var compiled = compiler(template);
	if (compiled.errors.length) {
		compiled.errors.forEach(function (msg) {
			console.log('\n' + msg + '\n');
		});
		throw new Error('Vue template compilation failed on file: ' + filename);
	} else {
		var render = toFunction(compiled.render);
		var sRender = '[' + compiled.staticRenderFns.map(toFunction).join(',') + ']';
		return 'render:' + render + ',staticRenderFns:' + sRender;
	}
}

function toFunction(code) {
	return transpiler('function r(){' + code + '}');
}

function genHash(hash) {
	return 'scope_' + hash;
}

function transforms(fileName, hash) {
	var type = '';
	var hasStyle = false;
	var Syntax = jst.Syntax;

	function visitTemplate(traverse, node, path, state) {
		var result = '', html = '';
		if (version.charAt(0) === '1') {
			var value = '';
			if (type === Syntax.BinaryExpression) {
				value = utils.getNodeSourceText(node.value, state);
			} else {
				html = node.value.value;
				let tpl = isValidPath(html, fileName);
				if (tpl) {
					html = readFileSync(tpl, 'utf8');
				}
				value = hasStyle ? '\'' + scopedHtml(html, genHash(hash)).replace(/'/g, '\\\'') + '\'' : html;
			}
			result = node.key.name + ': ' + value;
		} else {
			if (type !== Syntax.BinaryExpression) {
				html = node.value.value;
				let tpl = isValidPath(html, fileName);
				if (tpl) {
					html = readFileSync(tpl, 'utf8');
				}
				result = compileTemplate(fileName, hasStyle ? scopedHtml(html, genHash(hash)) : html);
			} else {
				result = node.key.name + ': ' + utils.getNodeSourceText(node.value, state);
				console.log('Interpolated string can not be converte in render Function.');
			}
		}
		utils.append(result, state);
		utils.move(node.range[1], state);
		type = '';
	}

	visitTemplate.test = function (node) {
		var res = node.type === Syntax.Property
			&& node.key.name === 'template'
			&& (node.value.type === Syntax.Literal ||
				node.value.type === Syntax.BinaryExpression);
		if (res) {
			type = node.value.type;
		}
		return res;
	};

	function visitStyle(traverse, node, path, state) {
		hasStyle = true;
		utils.append('COMP_HASH_ID: \'' + hash + '\',', state);
	}

	visitStyle.test = function (node) {
		var res = node.type === Syntax.Property
			&& node.key.name === 'style'
			&& node.value.type === Syntax.ObjectExpression;
		if (res) {
			type = node.value.type;
		}
		return res;
	};

	return [visitStyle, visitTemplate];
}

function isValidPath(tpl, filePath) {
	let isValid = !tpl.startsWith('<') && tpl.endsWith('.html') ? resolve(dirname(filePath), tpl) : '';
	let exist = existsSync(isValid);
	return isValid && exist ? isValid : '';
}

function pad(hash, len) {
	while (hash.length < len) {
		hash = `0${hash}`;
	}
	return hash;
}

function fold(hash, text) {
	let i, chr, len;
	if (text.length === 0) {
		return hash;
	}
	for (i = 0, len = text.length; i < len; i++) {
		chr = text.charCodeAt(i);
		hash = ((hash << 5) - hash) + chr;
		hash |= 0;
	}
	return hash < 0 ? hash * -2 : hash;
}

function hash(value) {
	let preHash = fold(0, value);
	if (value === null) {
		preHash = fold(preHash, 'null');
	} else if (value === undefined) {
		preHash = fold(preHash, 'undefined');
	} else {
		preHash = fold(preHash, value.toString());
	}
	return pad(preHash.toString(16), 8);
}

module.exports = loader;