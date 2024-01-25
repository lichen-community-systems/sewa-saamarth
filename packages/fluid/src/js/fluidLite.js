export const scope = function () {
    const fluid = {};

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

    return fluid;

};
