/*! markdown-it-flat-lists 1.0.0  @license MIT */(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.markdownItFlatLists = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict'

module.exports = function plugin(md) {

  function nope() {
    return ''
  }

  'ordered_list_open|ordered_list_close|bullet_list_open|bullet_list_close|list_item_open|list_item_close'
    .split('|')
    .forEach(el => {
      md.renderer.rules[el] = nope
    })

  md.core.ruler.push('flatlist', function (state) {
    var depth = 0

    for (var index = 0; index < state.tokens.length; index++) {
      var t = state.tokens[index]
      if (t.type === 'ordered_list_open' || t.type === 'bullet_list_open') {
        depth++
      }
      else if (t.type === 'ordered_list_close' || t.type === 'bullet_list_close') {
        depth--
      }
      if (t.type === 'list_item_open') {
        /* istanbul ignore else */
        if (state.tokens[index + 1].type === 'paragraph_open') { // not sure if it can be not paragraph
          var p = state.tokens[index + 1]
          /* istanbul ignore else */
          if (!p.attrs) {
            p.attrs = []
          }
          var classIndex = p.attrs.length
          p.attrs.push(['class', ''])
          var classes = p.attrs[classIndex][1].split(' ').filter(e => e.length)
          classes.push('list-item')
          if (depth > 1) {
            classes.push('indent-' + depth)
          }
          p.attrs[classIndex][1] = classes.join(' ')
          p.hidden = false
          var j = index + 2, nestedness = 1
          do { // find corresponding para end and make it visible
            if (state.tokens[j].type === 'paragraph_open') {
              nestedness++
            }
            if (state.tokens[j].type === 'paragraph_close') {
              nestedness--
            }
            if (state.tokens[j].type === 'paragraph_close' && nestedness === 0) {
              state.tokens[j].hidden = false
            }
            j++
          } while (j < state.tokens.length)
          var content = state.tokens[index + 2]
          var markup = new state.Token('text', '', 0)
          markup.content = t.markup + ' '
          content.children.unshift(markup)
        }
      }
    }
  })

  md.block.ruler.after('list', 'flatlist', function (state, startLine) {
    // else condition or /* istanbul ignore else */
    if (state.tokens.length && state.tokens[state.tokens.length - 1].type === 'list_item_open') {
      var token = state.tokens[state.tokens.length - 1]
      var src = state.src.substr(state.bMarks[startLine], state.eMarks[startLine] - state.bMarks[startLine])
      var pos = src.indexOf(token.markup)
      // else condition or /* istanbul ignore else */
      if (token.markup && pos !== -1) {
        token.markup = src.substr(0, pos + 1).replace(/^\s+/, '')
      }
    }
  })

  return md
}

},{}]},{},[1])(1)
});
