const fs = require("fs-extra"),
    path = require("path"),
    JSON5 = require("JSON5");

const fluid = {
    module: {}
};

// A mapping of module name to a structure containing elements
//    baseDir {String} The slash-terminated filesystem path of the base directory of the module
//    require {Function} A function capable as acting as "require" loading modules relative to the module

fluid.module.modules = {};

/* Canonicalise a path by replacing all backslashes with forward slashes,
 * (such paths are always valid when supplied to Windows APIs) - except for any initial
 * "\\" beginning a UNC path - since this will defeat the simpleminded "// -> /" normalisation which is done in
 * fluid.module.resolvePath, kettle.dataSource.file.handle and similar locations.
 * JavaScript regexes don't support lookbehind assertions, so this is a reasonable strategy to achieve this.
 */
fluid.module.canonPath = function (path) {
    return path.replace(/\\/g, "/").replace(/^\/\//, "\\\\");
};

/*
 * A module which has just loaded will call this API to register itself into
 * the Fluid module loader's records. The call will generally take the form:
 * <code>fluid.module.register("my-module", __dirname, require)</code>
 */
fluid.module.register = function (name, baseDir, moduleRequire) {
    console.log("Registering module " + name + " from path " + baseDir);
    fluid.module.modules[name] = {
        baseDir: fluid.module.canonPath(baseDir),
        require: moduleRequire
    };
};

fluid.module.getDirs = function () {
    return Object.fromEntries(
        Object.entries(fluid.module.modules).map(([key, val]) => [key, val.baseDir])
    );
    // Was return fluid.getMembers(fluid.module.modules, "baseDir");
};

// Template values with a %key syntax and optional warning for missing values
fluid.stringTemplate = function (template, values, warnFunc) {
    let keys = Object.keys(values);
    keys = keys.sort((a, b) => b.length - a.length);
    for (let i = 0; i < keys.length; ++i) {
        const key = keys[i];
        const templatePlaceholder = "%" + key;
        const replacementValue = values[key];
        if (warnFunc && replacementValue === undefined) {
            warnFunc(key);
        }
        template = template.replaceAll(templatePlaceholder, replacementValue);
    }
    return template;
};

/**
 * Resolve a path expression which may begin with a module reference of the form,
 * say, %moduleName, into an absolute path relative to that module, using the
 * database of base directories registered previously with fluid.module.register.
 * If the path does not begin with such a module reference, it is returned unchanged.
 */
fluid.module.resolvePath = function (path) {
    return fluid.stringTemplate(path, fluid.module.getDirs()).replace("//", "/");
};

fluid.module.moduleRegex = /^%([^\W._][\w\.-]*)/;


/**
 * Determine whether ths supplied string begins with the pattern %module-name for
 * some `module-name` which is considered a valid module name by npm by its legacy rules (see
 * https://github.com/npm/validate-npm-package-name ).
 *
 * @param {String} ref - the string to check
 * @return {String|Boolean} - the matched module name if the string matches, or falsy if it does not.
 */
fluid.module.refToModuleName = function (ref) {
    const matches = ref.match(fluid.module.moduleRegex);
    return matches && matches[1];
};

const makeArray = function (value) {
    return Array.isArray(value) ? value : [value];
};

const doReplace = function (text, replaceSourceI, replaceTargetI) {
    const replaceSource = makeArray(replaceSourceI);
    const replaceTarget = makeArray(replaceTargetI);
    replaceSource.forEach((replaceOneSource, i) => {
        text = text.replaceAll(replaceOneSource, replaceTarget[i]);
    });
    return text;
};

const copyGlob = function (sourcePattern, targetDir) {
    console.log("copyGlob ", sourcePattern);
    const fileNames = glob.sync(sourcePattern);
    console.log("Got files ", fileNames);
    fileNames.forEach(filePath => {
        const fileName = path.basename(filePath);
        const destinationPath = path.join(targetDir, fileName);

        fs.ensureDirSync(path.dirname(destinationPath));
        fs.copyFileSync(filePath, destinationPath);
        console.log(`Copied file: ${fileName}`);
    });
};

/** Copy dependencies into docs directory for GitHub pages **/

const copyDep = function (source, target, replaceSource, replaceTarget) {
    const targetPath = fluid.module.resolvePath(target);
    const sourceModule = fluid.module.refToModuleName(source);
    if (sourceModule && sourceModule !== "sewa-e-kheti") {
        require(sourceModule);
    }
    const sourcePath = fluid.module.resolvePath(source);
    if (replaceSource) {
        const text = fs.readFileSync(sourcePath, "utf8");
        const replaced = doReplace(text, replaceSource, replaceTarget);
        fs.writeFileSync(targetPath, replaced, "utf8");
        console.log(`Copied file: ${targetPath}`);
    } else if (sourcePath.includes("*")) {
        copyGlob(sourcePath, targetPath);
    } else {
        fs.ensureDirSync(path.dirname(targetPath));
        fs.copySync(sourcePath, targetPath);
        console.log(`Copied file: ${targetPath}`);
    }
};

fluid.loadJSON5File = function (path) {
    const resolved = fluid.module.resolvePath(path);
    try {
        const text = fs.readFileSync(resolved, "utf8");
        return JSON5.parse(text);
    } catch (e) {
        e.message = "Error reading JSON5 file " + resolved + "\n" + e.message;
        throw e;
    }
};

const build = async function () {
    const config = fluid.loadJSON5File("buildConfig.json5");

    config.copyJobs.forEach(function (dep) {
        copyDep(dep.source, dep.target, dep.replaceSource, dep.replaceTarget);
    });
};

fluid.module.register("sewa-e-kheti", __dirname, require);

build().then();