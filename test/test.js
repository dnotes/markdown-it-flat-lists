'use strict'

var path     = require('path')
var generate = require('markdown-it-testgen')

/*eslint-env mocha*/

describe('Tests for markdown-it plugin', function () {
  var md = require('markdown-it')('commonmark', { xhtmlOut: true })
    .use(require('../'))
    .use(require('markdown-it-attrs'), {
      allowedAttributes: ['class'],
    })
  generate(path.join(__dirname, 'fixtures/definitions.txt'), { header: true }, md)
})
