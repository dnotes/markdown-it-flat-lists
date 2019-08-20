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

  //----------------------------------------------------------------------------------------

  function _isNextListItemTight(tokens, current) {
    var i = current + 1, level = tokens[current].level
    while (i < tokens.length && (!tokens[i].level || tokens[i].level > level)) i++
    i++ //list_item_close
    while (i < tokens.length && [
      'ordered_list_open',
      'ordered_list_close',
      'bullet_list_open',
      'bullet_list_close',
      'list_item_close',
    ].indexOf(tokens[i].type) > -1) i++
    return !tokens[i] || tokens[i].type === 'list_item_open'
  }

  //----------------------------------------------------------------------------------------

  function _isLastItem(tokens, current) {
    current++
    while (current < tokens.length) {
      if (tokens[current].type === 'list_item_open') {
        return false
      }
      current++
    }
    return true
  }

  //----------------------------------------------------------------------------------------

  function _getListContent(tokens, current) {
    var content = [''], markup
    current++
    while (tokens[current].type === 'list_item_open') {
      markup = tokens[current].markup
      current++
      if (tokens[current].type === 'list_item_close') {
        content.push(markup)
      }
      else {
        current++
        content.push(markup + ' ' + tokens[current].content)
        current += 3
      }
    }
    current++
    return [content.join('\n'), current]
  }

  //----------------------------------------------------------------------------------------

  function _insertPara(state, index, content, startLine, itemsCountToRemove) {
    var replacementTokens = []
    var token = new state.Token('paragraph_open', 'p', 1)
    var contentLines = content.split('\n')
    var level = index ? state.tokens[index - 1].level + 1 : 1
    token.level = level
    token.map = [startLine, startLine + contentLines.length]
    token.hidden = true
    replacementTokens.push(token)

    token = new state.Token('inline', '', 0)
    token.level = level + 1
    token.content = content
    token.map = [startLine, startLine + contentLines.length]
    token.children = []
    for (var i = 0; i < contentLines.length; i++) {
      var lineToken = new state.Token('text', '', 0)
      lineToken.level = level + 2
      lineToken.content = contentLines[i]
      token.children.push(lineToken)
      if (i < contentLines.length - 1) {
        token.children.push(new state.Token('softbreak', '', 0))
      }
    }
    replacementTokens.push(token)

    token = new state.Token('paragraph_close', 'p', -1)
    token.level = level
    replacementTokens.push(token)
    replacementTokens.push(new state.Token('softbreak', '', 0))

    replacementTokens.unshift(itemsCountToRemove)
    replacementTokens.unshift(index)
    Array.prototype.splice.apply(state.tokens, replacementTokens)
  }

  //----------------------------------------------------------------------------------------
  function _mergeAttrs(a, b) {
    var attrs = {}, res

    function _attrs2obj(arr) {
      if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length; i++) {
          if (!attrs.hasOwnProperty(arr[i][0])) {
            attrs[arr[i][0]] = []
          }
          attrs[arr[i][0]].unshift(arr[i][1])
        }
      }
    }

    _attrs2obj(a)
    _attrs2obj(b)
    res = Object.keys(attrs).map(attr => [attr, attrs[attr].join(' ')])
    return res.length ? res : null
  }

  //----------------------------------------------------------------------------------------
  md.core.ruler.push('flatlist', function (state) {
    var depth = 0, tight = false, prevTight = false, classes, attrs
    var index, t
    for (index = 0; index < state.tokens.length; index++) {
      t = state.tokens[index]
      if (t.type === 'ordered_list_open' || t.type === 'bullet_list_open') {
        depth++
      }
      else if (t.type === 'ordered_list_close' || t.type === 'bullet_list_close') {
        depth--
      }
      if (
        depth === 1 &&
        (t.type === 'ordered_list_open' || t.type === 'bullet_list_open') &&
        index && state.tokens[index - 1].type === 'paragraph_close' &&
        state.tokens[index - 2].map[1] === state.tokens[index].map[0]
      ) {
        var dt = _getListContent(state.tokens, index)
        state.tokens[index - 2].content += '\n' + dt[0]
        state.tokens.splice(index, dt[1] - index)
        var lines = dt[0].split('\n')
        for (var i = 0; i < lines.length; i++) {
          var newToken = new state.Token('text', '', 0)
          newToken.content = lines[i]
          state.tokens[index - 2].children.push(newToken)
          state.tokens[index - 2].children.push(new state.Token('softbreak', '', 0))
        }
        state.tokens[index - 2].children.pop()
        depth--
      }
      else if (t.type === 'list_item_open') {
        if (state.tokens[index + 1].type === 'heading_open') {
          var content = state.tokens[index + 2].content
          if (state.tokens[index + 1].markup !== t.markup) {
            content = state.tokens[index + 1].markup + (content.length ? ' ' + content : '')
          }
          _insertPara(state, index + 1, content, t.map[0], 3)
        }
        if (state.tokens[index + 1].type === 'list_item_close') { // empty one
          _insertPara(state, index + 1, '', t.map[0], 0)
        }
      }
    }
    for (index = 0; index < state.tokens.length; index++) {
      t = state.tokens[index]
      if (t.type === 'ordered_list_open' || t.type === 'bullet_list_open') {
        depth++
      }
      else if (t.type === 'ordered_list_close' || t.type === 'bullet_list_close') {
        depth--
      }
      else if (t.type === 'list_item_open') {
        if (state.tokens[index + 1].type === 'paragraph_open') {
          var p = state.tokens[index + 1]
          // If this line does not have a negative case, it needs /* istanbul ignore else */
          if (!p.attrs) {
            p.attrs = []
          }
          prevTight = tight

          tight = _isNextListItemTight(state.tokens, index)
          if (tight && !prevTight && _isLastItem(state.tokens, index)) {
            tight = false
          }
          if (!p.hidden) {
            tight = false
          }
          var hanging = false
          if (
            state.tokens[index + 2].type === 'inline' &&
            state.tokens[index + 2].children &&
            state.tokens[index + 2].children.length > 2
          ) {
            hanging = state.tokens[index + 2].content.indexOf('\n') >= 0
          }
          classes = []
          if (tight && !hanging) {
            classes.push('li')
          }
          if (depth > 1) {
            classes.push(((tight && !hanging) ? 'li' : 'l') + depth)
          }
          p.attrs = _mergeAttrs(state.tokens[index].attrs || attrs, p.attrs)
          if (classes.length) {
            p.attrs = _mergeAttrs(p.attrs, [['class', classes.join(' ')]])
          }
          p.hidden = false
          var j = index + 1, level = state.tokens[j].level
          do { // find corresponding para end and make it visible
            if (state.tokens[j].type === 'paragraph_open' && state.tokens[j].level === level) {
              state.tokens[j].hidden = false
            }
            if (state.tokens[j].type === 'paragraph_close' && state.tokens[j].level === level) {
              state.tokens[j].hidden = false
            }
            j++
          } while (j < state.tokens.length && (!state.tokens[j].level || state.tokens[j].level > t.level))

          if (!Array.isArray(state.tokens[index + 2].children) || !state.tokens[index + 2].children.length) {
            state.tokens[index + 2].children = [new state.Token('text', '', 0)]
          }
          state.tokens[index + 2].content =
            t.markup + (state.tokens[index + 2].content.length ? ' ' + state.tokens[index + 2].content : '')
          state.tokens[index + 2].children[0].content = t.markup +
              (state.tokens[index + 2].children[0].content.length ?
                ' ' + state.tokens[index + 2].children[0].content :
                ''
              )
        }
      }
    }
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
