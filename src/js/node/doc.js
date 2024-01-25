/* eslint-env node */

"use strict";

const fs = require("fs"),
    linkedom = require("linkedom");

/** Parse an HTML document supplied as a symbolic reference into a linkedom DOM document
 * @param {String} path - Path reference
 * @return {Document} The document parsed into a DOM representation
 */
const parseDocument = function (path) {
    const text = fs.readFileSync(path, "utf8");
    return linkedom.parseHTML(text).document;
};

module.exports = {parseDocument};
