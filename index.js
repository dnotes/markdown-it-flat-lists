// Lists
/* eslint-disable semi, brace-style, array-bracket-spacing */

'use strict';

var isSpace = require('markdown-it/lib/common/utils').isSpace;


// Copy of parser_block.js:tokenize using different rules
function tokenizeTightLists(state, startLine, endLine) {

  var ok, i,
      rules = state.md.block.ruler.getRules('tight_list'),
      len = rules.length,
      line = startLine,
      hasEmptyLines = false,
      maxNesting = state.md.options.maxNesting;

  while (line < endLine) {
    state.line = line = state.skipEmptyLines(line);
    if (line >= endLine) { break; }
    // Termination condition for nested calls.
    // Nested calls currently used for blockquotes & lists
    if (state.sCount[line] < state.blkIndent) { break; }
    // If nesting level exceeded - skip tail to the end. That's not ordinary
    // situation and we should not care about content.
    if (state.level >= maxNesting) {
      state.line = endLine;
      break;
    }
    // Try all possible rules.
    // On success, rule should:
    //
    // - update `state.line`
    // - update `state.tokens`
    // - return true
    for (i = 0; i < len; i++) {
      ok = rules[i](state, line, endLine, false);
      if (ok) { break; }
    }
    // set state.tight if we had an empty line before current tag
    // i.e. latest empty line should not count
    state.tight = !hasEmptyLines;
    // paragraph might "eat" one newline after it in nested lists
    if (state.isEmpty(state.line - 1)) {
      hasEmptyLines = true;
    }
    line = state.line;
    if (line < endLine && state.isEmpty(line)) {
      hasEmptyLines = true;
      line++;
      state.line = line;
    }
  }
}

// Search `[-+*][\n ]`, returns next pos after marker on success
// or -1 on fail.
function skipBulletListMarker(state, startLine) {
  var marker, pos, max, ch;

  pos = state.bMarks[startLine] + state.tShift[startLine];
  max = state.eMarks[startLine];

  marker = state.src.charCodeAt(pos++);
  // Check bullet
  if (marker !== 0x2A/* * */ &&
      marker !== 0x2D/* - */ &&
      marker !== 0x2B/* + */) {
    return -1;
  }

  if (pos < max) {
    ch = state.src.charCodeAt(pos);

    if (!isSpace(ch)) {
      // " -test " - is not a list item
      return -1;
    }
  }

  return pos;
}

// Search `\d+[.)][\n ]`, returns next pos after marker on success
// or -1 on fail.
function skipOrderedListMarker(state, startLine) {
  var ch,
      start = state.bMarks[startLine] + state.tShift[startLine],
      pos = start,
      max = state.eMarks[startLine];

  // List marker should have at least 2 chars (digit + dot)
  if (pos + 1 >= max) { return -1; }

  ch = state.src.charCodeAt(pos++);

  if (ch < 0x30/* 0 */ || ch > 0x39/* 9 */) { return -1; }

  for (;;) {
    // EOL -> fail
    if (pos >= max) { return -1; }

    ch = state.src.charCodeAt(pos++);

    if (ch >= 0x30/* 0 */ && ch <= 0x39/* 9 */) {

      // List marker should have no more than 9 digits
      // (prevents integer overflow in browsers)
      if (pos - start >= 10) { return -1; }

      continue;
    }

    // found valid marker
    if (ch === 0x29/* ) */ || ch === 0x2e/* . */) {
      break;
    }

    return -1;
  }


  if (pos < max) {
    ch = state.src.charCodeAt(pos);

    if (!isSpace(ch)) {
      // " 1.test " - is not a list item
      return -1;
    }
  }
  return pos;
}

function markTightParagraphs(state, idx) {
  var i, l;

  for (i = idx + 2, l = state.tokens.length - 2; i < l; i++) {
    if (state.tokens[i].tag === 'p') {
      state.tokens[i].tag = 'span';
    }
  }
}

function list(state, startLine, endLine, silent) {
  var ch,
      contentStart,
      i,
      indent,
      indentAfterMarker,
      initial,
      isOrdered,
      itemLines,
      l,
      listLines,
      listTokIdx,
      markerCharCode,
      max,
      nextLine,
      offset,
      oldListIndent,
      oldParentType,
      oldSCount,
      oldTShift,
      oldTight,
      pos,
      posAfterMarker,
      terminate,
      terminatorRules,
      token,
      isTerminatingParagraph = false,
      endTightList;

  // if it's indented more than 3 spaces, it should be a code block
  if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

  // Special case:
  //  - item 1
  //   - item 2
  //    - item 3
  //     - item 4
  //      - this one is a paragraph continuation
  if (state.listIndent >= 0 &&
      state.sCount[startLine] - state.listIndent >= 4 &&
      state.sCount[startLine] < state.blkIndent) {
    return false;
  }

  // limit conditions when list can interrupt
  // a paragraph (validation mode only)
  if (silent && state.parentType === 'paragraph') {
    // Next list item should still terminate previous list item;
    //
    // This code can fail if plugins use blkIndent as well as lists,
    // but I hope the spec gets fixed long before that happens.
    //
    if (state.tShift[startLine] >= state.blkIndent) {
      isTerminatingParagraph = true;
    }
  }

  // Detect list type and position after marker
  if ((posAfterMarker = skipOrderedListMarker(state, startLine)) >= 0) {
    isOrdered = true;
    // TODO: should we highlight the list marker somehow?
    // start = state.bMarks[startLine] + state.tShift[startLine];
    // markerValue = Number(state.src.substr(start, posAfterMarker - start - 1));

    // If we're starting a new tight list to close a paragraph,
    // it should include more than one element.
    if (isTerminatingParagraph && !state.inTightList &&
      skipOrderedListMarker(state, startLine + 1) === -1 &&
      skipOrderedListMarker(state, startLine - 1) === -1) return false;

  } else if ((posAfterMarker = skipBulletListMarker(state, startLine)) >= 0) {
    isOrdered = false;

    if (isTerminatingParagraph && !state.inTightList &&
      skipBulletListMarker(state, startLine + 1) === -1 &&
      skipBulletListMarker(state, startLine - 1) === -1) return false;

  } else {
    return false;
  }

  // If we're starting a new unordered list right after
  // a paragraph, first line should not be empty.
  if (isTerminatingParagraph) {
    if (state.skipSpaces(posAfterMarker) >= state.eMarks[startLine]) return false;
  }

  // We should terminate list on style change. Remember first one to compare.
  markerCharCode = state.src.charCodeAt(posAfterMarker - 1);

  // For validation mode we can terminate immediately
  if (silent) { return true; }

  // Start list
  listTokIdx = state.tokens.length;

  if (isOrdered) {
    token       = state.push('ordered_list_open', 'ol', 1);
    // We don't need the start marker for flat lists because we use manual numbering
  } else {
    token       = state.push('bullet_list_open', 'ul', 1);
  }

  // For the first line of a tight list
  if (!state.inTightList && list(state, startLine + 1, startLine + 1, true)) {
    // Set state.inTightList, to remember the level at which the list should end
    state.inTightList = state.level;
    // Tight lists can combine with the previous paragraph
    if (listTokIdx && !state.isEmpty(startLine - 1) && state.tokens[listTokIdx - 1].type === 'paragraph_close') {
      token.paragraphLeech = true;
    }
  }

  token.map    = listLines = [ startLine, 0 ];
  token.markup = String.fromCharCode(markerCharCode);

  //
  // Iterate list items
  //

  nextLine = startLine;
  terminatorRules = state.md.block.ruler.getRules('list');

  oldParentType = state.parentType;
  state.parentType = 'list';

  while (nextLine < endLine) {
    pos = posAfterMarker;
    max = state.eMarks[nextLine];

    initial = offset = state.sCount[nextLine] + posAfterMarker - (state.bMarks[startLine] + state.tShift[startLine]);

    while (pos < max) {
      ch = state.src.charCodeAt(pos);

      if (ch === 0x09) {
        offset += 4 - (offset + state.bsCount[nextLine]) % 4;
      } else if (ch === 0x20) {
        offset++;
      } else {
        break;
      }

      pos++;
    }

    contentStart = pos;

    if (contentStart >= max) {
      // trimming space in "-    \n  3" case, indent is 1 here
      indentAfterMarker = 1;
    } else {
      indentAfterMarker = offset - initial;
    }

    // If we have more than 4 spaces, the indent is 1
    // (the rest is just indented code block)
    if (indentAfterMarker > 4) { indentAfterMarker = 1; }

    // "  -  test"
    //  ^^^^^ - calculating total length of this thing
    indent = initial + indentAfterMarker;

    // Run subparser & write tokens
    token        = state.push('list_item_open', 'li', 1);
    token.markup = String.fromCharCode(markerCharCode);
    token.marker = state.src.slice(state.bMarks[nextLine], state.bMarks[nextLine] + indent).trim();
    token.map    = itemLines = [ startLine, 0 ];

    // change current state, then restore it after parser subcall
    oldTight = state.tight;
    oldTShift = state.tShift[startLine];
    oldSCount = state.sCount[startLine];

    //  - example list
    // ^ listIndent position will be here
    //   ^ blkIndent position will be here
    //
    oldListIndent = state.listIndent;
    state.listIndent = state.blkIndent;
    state.blkIndent = indent;

    state.tight = true;
    state.tShift[startLine] = contentStart - state.bMarks[startLine];
    state.sCount[startLine] = offset;

    if (contentStart >= max && state.isEmpty(startLine + 1)) {

      // workaround to retain content for empty loose list item
      token = state.push('paragraph_open', 'p', 1);
      token.map = [ state.line, state.line ];

      token = state.push('inline', '', 0);
      token.content = '';
      token.map = [ state.line, state.line ];
      token.children = [];

      token = state.push('paragraph_close', 'p', -1);

      // workaround for this case
      // (list item is empty, list terminates before "foo"):
      // ~~~~~~~~
      //   -
      //
      //     foo
      // ~~~~~~~~
      state.line = Math.min(state.line + 2, endLine);
    } else if (state.inTightList) {
      // Stop tight lists at blank lines
      for (endTightList = nextLine + 1; endTightList < endLine; endTightList++) {
        if (state.isEmpty(endTightList)) break;
      }
      // Tokenize using the tight list rules (default is list and paragraph only)
      tokenizeTightLists(state, nextLine, endTightList);

    } else {
      state.md.block.tokenize(state, startLine, endLine, true);
    }

    state.blkIndent = state.listIndent;
    state.listIndent = oldListIndent;
    state.tShift[startLine] = oldTShift;
    state.sCount[startLine] = oldSCount;
    state.tight = oldTight;

    token        = state.push('list_item_close', 'li', -1);
    token.markup = String.fromCharCode(markerCharCode);

    nextLine = startLine = state.line;
    itemLines[1] = nextLine;
    contentStart = state.bMarks[startLine];

    if (nextLine >= endLine) { break; }

    //
    // Try to check if list is terminated or continued.
    //
    if (state.sCount[nextLine] < state.blkIndent) { break; }

    // if it's indented more than 3 spaces, it should be a code block
    if (state.sCount[startLine] - state.blkIndent >= 4) { break; }

    // fail if terminating block found
    terminate = false;
    for (i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) { break; }

    // fail if list has another type
    if (isOrdered) {
      posAfterMarker = skipOrderedListMarker(state, nextLine);
      if (posAfterMarker < 0) { break; }
    } else {
      posAfterMarker = skipBulletListMarker(state, nextLine);
      if (posAfterMarker < 0) { break; }
    }

    if (markerCharCode !== state.src.charCodeAt(posAfterMarker - 1)) { break; }
  }

  // Finalize list
  if (isOrdered) {
    token = state.push('ordered_list_close', 'ol', -1);
  } else {
    token = state.push('bullet_list_close', 'ul', -1);
  }
  token.markup = String.fromCharCode(markerCharCode);

  listLines[1] = nextLine;
  state.line = nextLine;

  state.parentType = oldParentType;

  // mark paragraphs tight if needed
  if (state.level + 1 === state.inTightList) {
    state.tokens[listTokIdx].tight = true;
    token.tight = true;
    markTightParagraphs(state, listTokIdx);
    state.inTightList = false;
  }

  return true;
}

function flattenList(state) {
  let level = 0
  let marker = ''
  for (let i = 0; i < state.tokens.length; i++) {
    switch (state.tokens[i].tag) {
      case 'ul':
      case 'ol':

        // capture the level of the list
        level += state.tokens[i].nesting

        // make tight lists into paragraphs
        if (state.tokens[i].tight) {
          state.tokens[i].tag = 'p'
        }
        // hide all other ol and ul elements
        else {
          state.tokens[i].hidden = true
        }

        if (state.tokens[i].paragraphLeech) {
          state.tokens[i].hidden = true
          state.tokens[i - 1].hidden = true
        }

        break;
      case 'li':
        // capture the markup used to delineate the list item
        marker = state.tokens[i].marker || ''
        break;
      case 'p':
      case 'span':
        // If the tag is in a list
        if (level) {
          // If it is an opening tag
          if (state.tokens[i].type.indexOf('_open') > 0) {
            // Set li classes
            state.tokens[i].attrJoin('class', 'li')
            if (level > 1) state.tokens[i].attrJoin('class', `li${level}`)
          }
        }
        break;
      default:
        // Add the marker text to the next inline element
        if (marker.length && state.tokens[i].type === 'inline') {
          marker += state.tokens[i].content.length ? ' ' : '';
          state.tokens[i].content = `${marker}${state.tokens[i].content}`;
          marker = '';
        }
    }
  }
  return true;
}

/**
 * We go once through the entire array of tokens, taking the attributes assigned
 * to <ul>, <ol>, and <li> elements and assigning them to the proper <p> and <span>.
 * For each level of the list we must record the attributes for each of the
 * <ol>, <ul>, and <li> elements, and we must remember the index of the opening token
 * for the last paragraph at each level. Then, when we come to a closing token for
 * a list or list item, we can assign the attributes to the correct opening token
 * for its corresponding last paragraph.
 * @param {object} state The state object from markdown-it
 */
function flattenAttrs(state) {
  let level = 0
  let stubs = {}
  let lastParagraph = {}
  for (let i = 0; i < state.tokens.length; i++) {
    switch (state.tokens[i].tag) {
      case 'ol':
      case 'ul':
      case 'li':
        if (state.tokens[i].type.indexOf('open') > 0) {
          // For opening tokens, we increase the level first
          level += state.tokens[i].nesting
          if (state.tokens[i].attrs && state.tokens[i].attrs.length) {
            // For these elements, we must get the attributes and store them in a stub token,
            // So that later we can add them to the last paragraph.
            stubs[level] = new state.Token()
            for (let x = 0; x < state.tokens[i].attrs.length; x++) {
              stubs[level].attrJoin(state.tokens[i].attrs[x][0], state.tokens[i].attrs[x][1])
            }
          }
        }
        else if (state.tokens[i].type.indexOf('close') > 0) {
          if (lastParagraph[level] && stubs[level]) {
            // Merge attributes that have been saved from earlier
            for (let x = 0; x < stubs[level].attrs.length; x++) {
              state.tokens[lastParagraph[level]].attrJoin(stubs[level].attrs[x][0], stubs[level].attrs[x][1])
            }
          }
          // After merging attributes, unset the stub token
          stubs[level] = null
          // For closing tokens, the last thing we do is decrease the level
          level += state.tokens[i].nesting
        }
        break;
      case 'p':
      case 'span':
        if (level && state.tokens[i].type.indexOf('open') > 0) {
          // For the <ol> and <ul> elements, we need to remember the last paragraph
          // so that we can capture any attributes assigned to the list, e.g. in the
          // following case the ".class" will be assigned to the <ul> element instead
          // of the actual list item.
          //  - List item
          //    {.class}
          lastParagraph[level] = i
          lastParagraph[level - 1] = i
          // However, in cases where the list item receives the attributes, we must
          // assign them to the first paragraph; otherwise, list items with multiple
          // paragraphs will have attributes wrongly assigned to the last paragraph,
          // e.g. in the following example the ".p1" class should be assigned to the
          // first paragraph:
          // - List item paragraph 1 {.p1}
          //
          //   List item paragraph 2 {.p2}

          if (stubs[level]) {
            for (let x = 0; x < stubs[level].attrs.length; x++) {
              state.tokens[lastParagraph[level]].attrJoin(stubs[level].attrs[x][0], stubs[level].attrs[x][1])
            }
            stubs[level] = null
          }
        }
        break;
    }
  }
}

module.exports = function plugin(md) {

  // Replace the 'list' rule with ours, keeping the same alt options
  md.block.ruler.at('list', list, { alt: md.block.ruler.__rules__[md.block.ruler.__find__('list')].alt });

  // Add our flattening rule between block and inline rendering
  md.core.ruler.after('block', 'flatten_list', flattenList);

  md.core.ruler.push('flatten_attrs', flattenAttrs);

  // Create a chain for "tight_list" blocks
  md.block.ruler.__rules__[md.block.ruler.__find__('paragraph')].alt.push('tight_list');
  md.block.ruler.__rules__[md.block.ruler.__find__('list')].alt.push('tight_list');

  // Do not render list items at all
  md.renderer.rules.list_item_open = md.renderer.rules.list_item_close = () => { return ''; };

  return md;
};
