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
        if (state.tokens[index + 1].type === 'paragraph_open') { // not sure if it can be not paragraph
          var p = state.tokens[index + 1]
          if (!p.attrs) {
            p.attrs = []
          }
          var classIndex = -1
          for (var i = 0; i < p.attrs.length; i++) {
            if (p.attrs[i][0] === 'class') {
              classIndex = i
              break
            }
          }
          if (classIndex === -1) {
            p.attrs.push(['class', ''])
            classIndex = p.attrs.length - 1
          }
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
    if (state.tokens.length && state.tokens[state.tokens.length - 1].type === 'list_item_open') {
      var token = state.tokens[state.tokens.length - 1]
      var src = state.src.substr(state.bMarks[startLine], state.eMarks[startLine] - state.bMarks[startLine])
      var pos = src.indexOf(token.markup)
      if (token.markup && pos !== -1) {
        token.markup = src.substr(0, pos + 1).replace(/^\s+/, '')
      }
    }
  })

  return md
}
