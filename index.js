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

  function _mergeAttrs(a, b) {
    var attrs = {}, res

    function _attrs2obj(arr) {
      if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length; i++) {
          if (!attrs.hasOwnProperty(arr[i][0])) {
            attrs[arr[i][0]] = []
          }
          attrs[arr[i][0]].push(arr[i][1])
        }
      }
    }

    _attrs2obj(a)
    _attrs2obj(b)
    res = Object.keys(attrs).map(attr => [attr, attrs[attr].join(' ')])
    return res.length ? res : null
  }

  md.core.ruler.push('flatlist', function (state) {
    // console.log(state.tokens)
    var depth = 0
    var attrs

    for (var index = 0; index < state.tokens.length; index++) {
      var t = state.tokens[index]
      if (t.type === 'ordered_list_open' || t.type === 'bullet_list_open') {
        depth++
        attrs = t.attrs
      }
      else if (t.type === 'ordered_list_close' || t.type === 'bullet_list_close') {
        depth--
      }
      if (t.type === 'list_item_open') {
        /* istanbul ignore else */
        if (state.tokens[index + 1].type === 'paragraph_open') { // not sure if it can be not paragraph
          var p = state.tokens[index + 1]
          /* istanbul ignore else */
          p.attrs = _mergeAttrs(state.tokens[index].attrs || attrs, p.attrs)
          p.attrs = _mergeAttrs(p.attrs, [['class', 'list-item' + (depth > 1 ? ' indent-' + depth : '')]])
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
        else if (state.tokens[index + 1].type === 'list_item_close') { // empty one
          var pOpen = new state.Token('paragraph_open', 'p', 1)
          pOpen.map = t.map
          pOpen.attrs = [['class', 'list-item']]
          var emptyContent = new state.Token('inline', '', 0)
          emptyContent.map = t.map
          emptyContent.content = t.markup
          var text = new state.Token('text')
          text.content = t.markup
          emptyContent.children = [text]
          var pClose = new state.Token('paragraph_close', 'p', -1)
          pClose.map = t.map
          state.tokens.splice(index + 1, 0, pOpen, emptyContent, pClose, new state.Token('softbreak'))
        }
      }
    }
    // console.log('---',state.tokens)
  })

  function _processListItemOpenToken(token, state) {
    var src = state.src.substr(
      state.bMarks[token.map[0]],
      state.eMarks[token.map[1] > token.map[0] ? token.map[1] : token.map[0] + 1] - state.bMarks[token.map[0]]
    )
    var pos = src.indexOf(token.markup)
    // else condition or /* istanbul ignore else */
    if (token.markup && pos !== -1) {
      token.markup = src.substr(0, pos + 1).replace(/^\s+/, '')
    }
    token.flatlistRendererProcessed = true

  }

  md.block.ruler.after('list', 'flatlist', function (state, startLine) {
    // else condition or /* istanbul ignore else */
    state.tokens
      .filter(token => token.type === 'list_item_open' && !token.flatlistRendererProcessed)
      .forEach(token => _processListItemOpenToken(token, state, startLine))
  })

  return md
}
