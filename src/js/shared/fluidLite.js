/* eslint-env node */

"use strict";

const fluidScope = function () {
    const fluid = {};

    /** Returns an array of size count, filled with increasing integers, starting at 0 or at the index specified by first.
     * @param {Number} count - Size of the filled array to be returned
     * @param {Number} [first] - (optional, defaults to 0) First element to appear in the array
     * @return {Array} The generated array
     */
    fluid.iota = function (count, first) {
        first = first || 0;
        const togo = [];
        for (let i = 0; i < count; ++i) {
            togo[togo.length] = first++;
        }
        return togo;
    };

    /** Scan through an array or hash of objects, removing those which match a predicate. Similar to
     * jQuery.grep, only acts on the list in-place by removal, rather than by creating
     * a new list by inclusion.
     * @param {Array|Object} source - The array or hash of objects to be scanned over. Note that in the case this is an array,
     * the iteration will proceed from the end of the array towards the front.
     * @param {Function} fn - A predicate function determining whether an element should be
     * removed. This accepts the standard signature (object, index) and returns a "truthy"
     * result in order to determine that the supplied object should be removed from the structure.
     * @param {Array|Object} [target] - (optional) A target object of the same type as <code>source</code>, which will
     * receive any objects removed from it.
     * @return {Array|Object} - <code>target</code>, containing the removed elements, if it was supplied, or else <code>source</code>
     * modified by the operation of removing the matched elements.
     */
    fluid.remove_if = function (source, fn, target) {
        if (Array.isArray(source)) {
            for (let i = source.length - 1; i >= 0; --i) {
                if (fn(source[i], i)) {
                    if (target) {
                        target.unshift(source[i]);
                    }
                    source.splice(i, 1);
                }
            }
        } else {
            for (let key in source) {
                if (fn(source[key], key)) {
                    if (target) {
                        target[key] = source[key];
                    }
                    delete source[key];
                }
            }
        }
        return target || source;
    };

    // Taken from https://codeburst.io/javascript-async-await-with-foreach-b6ba62bbf404
    fluid.asyncForEach = async function (array, callback) {
        for (let index = 0; index < array.length; index++) {
            await callback(array[index], index, array);
        }
    };

    fluid.each = function (hash, callback) {
        for (let key in hash) {
            callback(hash[key], key, hash);
        }
    };

    fluid.asyncMap = async function (array, callback) {
        const togo = [];
        for (let index = 0; index < array.length; index++) {
            const result = await callback(array[index], index, array);
            togo.push(result);
        }
        return togo;
    };

    fluid.asyncTransform = async function (hash, callback) {
        const togo = {};
        for (let key in hash) {
            const result = await callback(hash[key], key, hash);
            togo[key] = result;
        }
        return togo;
    };


    return fluid;
};

if (typeof(module) !== "undefined") {
    module.exports = fluidScope;
}
