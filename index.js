var Module = typeof Module !== "undefined" ? Module : {};
function httpRequest(method, url) {
    return new Promise(function (resolve, reject) {
        var wasmXHR = new XMLHttpRequest();
        wasmXHR.open(method, url, true);
        if (method == "HEAD") wasmXHR.setRequestHeader("Cache-Control", "no-store");
        wasmXHR.responseType = "arraybuffer";
        wasmXHR.onload = function () {
            if (wasmXHR.status == 200 || wasmXHR.status == 304 || wasmXHR.status == 206 || (wasmXHR.status == 0 && wasmXHR.response)) {
                resolve(wasmXHR);
            } else {
                reject(wasmXHR);
            }
        };
        wasmXHR.onerror = function () {
            reject(wasmXHR);
        };
        wasmXHR.send(null);
    });
}
Module.instantiateWasm = function (imports, successCallback) {
    var trueModule = Module;
    function receiveInstantiatedSource(output) {
        assert(Module === trueModule, "the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?");
        trueModule = null;
        successCallback(output["instance"]);
    }
    var module_name = "index";
    function instantiateArrayBuffer(receiver) {
        var wasm = httpRequest("GET", module_name + ".wasm.gz");
        wasm.then(
            function (xhr) {
                compressed = xhr.response;
                var t = Date.now();
                var wasmBinary = Zee.decompress(new Uint8Array(compressed));
                console.log(module_name + ".wasm.gz decompressed in " + ((Date.now() - t) / 1e3).toFixed(2) + " secs");
                var wasmInstantiate = WebAssembly.instantiate(new Uint8Array(wasmBinary), imports)
                    .then(function (output) {
                        successCallback(output.instance);
                    })
                    .catch(function (e) {
                        Module.setStatus("wasm instantiation failed! " + e);
                    });
            },
            function (xhr) {
                Module.setStatus("Error while downloading " + xhr.responseURL + " : " + xhr.statusText + " (status code " + xhr.status + ")");
            }
        );
        return {};
    }
    var wasm = httpRequest("HEAD", module_name + ".wasm");
    wasm.then(
        function (xhr) {
            console.log(module_name + ".wasm content-encoding: " + xhr.getResponseHeader("content-encoding"));
            if (xhr.getResponseHeader("content-encoding") == "gzip" && !Module["wasmBinary"] && typeof WebAssembly.instantiateStreaming === "function" && !isDataURI(wasmBinaryFile) && typeof fetch === "function") {
                WebAssembly.instantiateStreaming(fetch(wasmBinaryFile, { credentials: "same-origin" }), imports).then(receiveInstantiatedSource, function (reason) {
                    err("wasm streaming compile failed: " + reason);
                    err("falling back to .wasm.gz");
                    instantiateArrayBuffer(receiveInstantiatedSource);
                });
            } else {
                err("falling back to .wasm.gz");
                instantiateArrayBuffer(receiveInstantiatedSource);
            }
        },
        function (xhr) {
            err("HEAD " + xhr.responseURL + " failed: " + xhr.status);
            err("falling back to .wasm.gz");
            instantiateArrayBuffer(receiveInstantiatedSource);
        }
    );
    return {};
};
Module["onRuntimeInitialized"] = function () {
    _GET = {};
    if (location.search.length > 0) {
        location.search
            .substr(1)
            .split("&")
            .forEach(function (item) {
                _GET[item.split("=")[0]] = item.split("=")[1];
            });
    }
    var url = DEFAULT_GAME_FILENAME;
    if (_GET["game"]) {
        if (_GET["game"].match(/^[0-9a-z._-]+$/i)) {
            url = _GET["game"];
        } else {
            throw "Invalid game filename.";
        }
    }
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "arraybuffer";
    xhr.onprogress = function (event) {
        var size = -1;
        if (event.total) size = event.total;
        if (event.loaded) {
            if (!xhr.addedTotal) {
                xhr.addedTotal = true;
                if (!Module.dataFileDownloads) Module.dataFileDownloads = {};
                Module.dataFileDownloads[url] = { loaded: event.loaded, total: size };
            } else {
                Module.dataFileDownloads[url].loaded = event.loaded;
            }
            var total = 0;
            var loaded = 0;
            var num = 0;
            for (var download in Module.dataFileDownloads) {
                var data = Module.dataFileDownloads[download];
                total += data.total;
                loaded += data.loaded;
                num++;
            }
            total = Math.ceil((total * Module.expectedDataFileDownloads) / num);
            if (Module["setStatus"]) Module["setStatus"]("Downloading Story... (" + loaded + "/" + total + ")");
        } else if (!Module.dataFileDownloads) {
            if (Module["setStatus"]) Module["setStatus"]("Downloading Story...");
        }
    };
    xhr.onerror = function (event) {
        console.log(xhr);
        console.log(event);
        Module.print("No se pudo descargar el juego. Hay problemas con la conexión a internet.\n");
    };
    xhr.onload = function (event) {
        if (xhr.status == 200 || xhr.status == 304 || xhr.status == 206 || (xhr.status == 0 && xhr.response)) {
            FS.writeFile("game.zip", new Uint8Array(xhr.response));
            if (Module["setStatus"]) Module["setStatus"]("");
            Module.print("Extracting Story...\n");
            window.setTimeout(function () {
                gameExtractAndRun();
            }, 300);
        } else {
            console.log(xhr);
            console.log(event);
            Module.print("Error while downloading " + xhr.responseURL + " : " + xhr.statusText + " (status code " + xhr.status + ")\n");
        }
    };
    xhr.send(null);
};
Module["quit"] = function () {
    console.log("Module.quit");
    Module["setStatus"]("Quit");
};
var moduleOverrides = {};
var key;
for (key in Module) {
    if (Module.hasOwnProperty(key)) {
        moduleOverrides[key] = Module[key];
    }
}
var arguments_ = [];
var thisProgram = "./this.program";
var quit_ = function (status, toThrow) {
    throw toThrow;
};
var ENVIRONMENT_IS_WEB = true;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var scriptDirectory = "";
function locateFile(path) {
    if (Module["locateFile"]) {
        return Module["locateFile"](path, scriptDirectory);
    }
    return scriptDirectory + path;
}
var read_, readAsync, readBinary, setWindowTitle;
if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = self.location.href;
    } else if (document.currentScript) {
        scriptDirectory = document.currentScript.src;
    }
    if (scriptDirectory.indexOf("blob:") !== 0) {
        scriptDirectory = scriptDirectory.substr(0, scriptDirectory.lastIndexOf("/") + 1);
    } else {
        scriptDirectory = "";
    }
    read_ = function shell_read(url) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, false);
        xhr.send(null);
        return xhr.responseText;
    };
    if (ENVIRONMENT_IS_WORKER) {
        readBinary = function readBinary(url) {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.responseType = "arraybuffer";
            xhr.send(null);
            return new Uint8Array(xhr.response);
        };
    }
    readAsync = function readAsync(url, onload, onerror) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.responseType = "arraybuffer";
        xhr.onload = function xhr_onload() {
            if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
                onload(xhr.response);
                return;
            }
            onerror();
        };
        xhr.onerror = onerror;
        xhr.send(null);
    };
    setWindowTitle = function (title) {
        document.title = title;
    };
} else {
}
var out = Module["print"] || console.log.bind(console);
var err = Module["printErr"] || console.warn.bind(console);
for (key in moduleOverrides) {
    if (moduleOverrides.hasOwnProperty(key)) {
        Module[key] = moduleOverrides[key];
    }
}
moduleOverrides = null;
if (Module["arguments"]) arguments_ = Module["arguments"];
if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
if (Module["quit"]) quit_ = Module["quit"];
Module["setWindowTitle"] = setWindowTitle;
var STACK_ALIGN = 16;
function dynamicAlloc(size) {
    var ret = HEAP32[DYNAMICTOP_PTR >> 2];
    var end = (ret + size + 15) & -16;
    if (end > _emscripten_get_heap_size()) {
        abort();
    }
    HEAP32[DYNAMICTOP_PTR >> 2] = end;
    return ret;
}
function getNativeTypeSize(type) {
    switch (type) {
        case "i1":
        case "i8":
            return 1;
        case "i16":
            return 2;
        case "i32":
            return 4;
        case "i64":
            return 8;
        case "float":
            return 4;
        case "double":
            return 8;
        default: {
            if (type[type.length - 1] === "*") {
                return 4;
            } else if (type[0] === "i") {
                var bits = parseInt(type.substr(1));
                assert(bits % 8 === 0, "getNativeTypeSize invalid bits " + bits + ", type " + type);
                return bits / 8;
            } else {
                return 0;
            }
        }
    }
}
function warnOnce(text) {
    if (!warnOnce.shown) warnOnce.shown = {};
    if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        err(text);
    }
}
var asm2wasmImports = {
    "f64-rem": function (x, y) {
        return x % y;
    },
    debugger: function () {},
};
function convertJsFunctionToWasm(func, sig) {
    var typeSection = [1, 0, 1, 96];
    var sigRet = sig.slice(0, 1);
    var sigParam = sig.slice(1);
    var typeCodes = { i: 127, j: 126, f: 125, d: 124 };
    typeSection.push(sigParam.length);
    for (var i = 0; i < sigParam.length; ++i) {
        typeSection.push(typeCodes[sigParam[i]]);
    }
    if (sigRet == "v") {
        typeSection.push(0);
    } else {
        typeSection = typeSection.concat([1, typeCodes[sigRet]]);
    }
    typeSection[1] = typeSection.length - 2;
    var bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0].concat(typeSection, [2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0]));
    var module = new WebAssembly.Module(bytes);
    var instance = new WebAssembly.Instance(module, { e: { f: func } });
    var wrappedFunc = instance.exports.f;
    return wrappedFunc;
}
function addFunctionWasm(func, sig) {
    var table = wasmTable;
    var ret = table.length;
    try {
        table.grow(1);
    } catch (err) {
        if (!err instanceof RangeError) {
            throw err;
        }
        throw "Unable to grow wasm table. Use a higher value for RESERVED_FUNCTION_POINTERS or set ALLOW_TABLE_GROWTH.";
    }
    try {
        table.set(ret, func);
    } catch (err) {
        if (!err instanceof TypeError) {
            throw err;
        }
        assert(typeof sig !== "undefined", "Missing signature argument to addFunction");
        var wrapped = convertJsFunctionToWasm(func, sig);
        table.set(ret, wrapped);
    }
    return ret;
}
function removeFunctionWasm(index) {}
var funcWrappers = {};
function getFuncWrapper(func, sig) {
    if (!func) return;
    assert(sig);
    if (!funcWrappers[sig]) {
        funcWrappers[sig] = {};
    }
    var sigCache = funcWrappers[sig];
    if (!sigCache[func]) {
        if (sig.length === 1) {
            sigCache[func] = function dynCall_wrapper() {
                return dynCall(sig, func);
            };
        } else if (sig.length === 2) {
            sigCache[func] = function dynCall_wrapper(arg) {
                return dynCall(sig, func, [arg]);
            };
        } else {
            sigCache[func] = function dynCall_wrapper() {
                return dynCall(sig, func, Array.prototype.slice.call(arguments));
            };
        }
    }
    return sigCache[func];
}
function dynCall(sig, ptr, args) {
    if (args && args.length) {
        return Module["dynCall_" + sig].apply(null, [ptr].concat(args));
    } else {
        return Module["dynCall_" + sig].call(null, ptr);
    }
}
var tempRet0 = 0;
var setTempRet0 = function (value) {
    tempRet0 = value;
};
var getTempRet0 = function () {
    return tempRet0;
};
var wasmBinary;
if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
var noExitRuntime;
if (Module["noExitRuntime"]) noExitRuntime = Module["noExitRuntime"];
if (typeof WebAssembly !== "object") {
    err("no native wasm support detected");
}
function setValue(ptr, value, type, noSafe) {
    type = type || "i8";
    if (type.charAt(type.length - 1) === "*") type = "i32";
    switch (type) {
        case "i1":
            HEAP8[ptr >> 0] = value;
            break;
        case "i8":
            HEAP8[ptr >> 0] = value;
            break;
        case "i16":
            HEAP16[ptr >> 1] = value;
            break;
        case "i32":
            HEAP32[ptr >> 2] = value;
            break;
        case "i64":
            (tempI64 = [
                value >>> 0,
                ((tempDouble = value), +Math_abs(tempDouble) >= +1 ? (tempDouble > +0 ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / +4294967296) >>> 0) : 0),
            ]),
                (HEAP32[ptr >> 2] = tempI64[0]),
                (HEAP32[(ptr + 4) >> 2] = tempI64[1]);
            break;
        case "float":
            HEAPF32[ptr >> 2] = value;
            break;
        case "double":
            HEAPF64[ptr >> 3] = value;
            break;
        default:
            abort("invalid type for setValue: " + type);
    }
}
var wasmMemory;
var wasmTable;
var ABORT = false;
var EXITSTATUS = 0;
function assert(condition, text) {
    if (!condition) {
        abort("Assertion failed: " + text);
    }
}
function getCFunc(ident) {
    var func = Module["_" + ident];
    assert(func, "Cannot call unknown function " + ident + ", make sure it is exported");
    return func;
}
function ccall(ident, returnType, argTypes, args, opts) {
    var toC = {
        string: function (str) {
            var ret = 0;
            if (str !== null && str !== undefined && str !== 0) {
                var len = (str.length << 2) + 1;
                ret = stackAlloc(len);
                stringToUTF8(str, ret, len);
            }
            return ret;
        },
        array: function (arr) {
            var ret = stackAlloc(arr.length);
            writeArrayToMemory(arr, ret);
            return ret;
        },
    };
    function convertReturnValue(ret) {
        if (returnType === "string") return UTF8ToString(ret);
        if (returnType === "boolean") return Boolean(ret);
        return ret;
    }
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    if (args) {
        for (var i = 0; i < args.length; i++) {
            var converter = toC[argTypes[i]];
            if (converter) {
                if (stack === 0) stack = stackSave();
                cArgs[i] = converter(args[i]);
            } else {
                cArgs[i] = args[i];
            }
        }
    }
    var ret = func.apply(null, cArgs);
    if (typeof EmterpreterAsync === "object" && EmterpreterAsync.state) {
        return new Promise(function (resolve) {
            EmterpreterAsync.restartFunc = func;
            EmterpreterAsync.asyncFinalizers.push(function (ret) {
                if (stack !== 0) stackRestore(stack);
                resolve(convertReturnValue(ret));
            });
        });
    }
    ret = convertReturnValue(ret);
    if (stack !== 0) stackRestore(stack);
    if (opts && opts.async) return Promise.resolve(ret);
    return ret;
}
function cwrap(ident, returnType, argTypes, opts) {
    argTypes = argTypes || [];
    var numericArgs = argTypes.every(function (type) {
        return type === "number";
    });
    var numericRet = returnType !== "string";
    if (numericRet && numericArgs && !opts) {
        return getCFunc(ident);
    }
    return function () {
        return ccall(ident, returnType, argTypes, arguments, opts);
    };
}
var ALLOC_NORMAL = 0;
var ALLOC_STACK = 1;
var ALLOC_NONE = 3;
function allocate(slab, types, allocator, ptr) {
    var zeroinit, size;
    if (typeof slab === "number") {
        zeroinit = true;
        size = slab;
    } else {
        zeroinit = false;
        size = slab.length;
    }
    var singleType = typeof types === "string" ? types : null;
    var ret;
    if (allocator == ALLOC_NONE) {
        ret = ptr;
    } else {
        ret = [_malloc, stackAlloc, dynamicAlloc][allocator](Math.max(size, singleType ? 1 : types.length));
    }
    if (zeroinit) {
        var stop;
        ptr = ret;
        assert((ret & 3) == 0);
        stop = ret + (size & ~3);
        for (; ptr < stop; ptr += 4) {
            HEAP32[ptr >> 2] = 0;
        }
        stop = ret + size;
        while (ptr < stop) {
            HEAP8[ptr++ >> 0] = 0;
        }
        return ret;
    }
    if (singleType === "i8") {
        if (slab.subarray || slab.slice) {
            HEAPU8.set(slab, ret);
        } else {
            HEAPU8.set(new Uint8Array(slab), ret);
        }
        return ret;
    }
    var i = 0,
        type,
        typeSize,
        previousType;
    while (i < size) {
        var curr = slab[i];
        type = singleType || types[i];
        if (type === 0) {
            i++;
            continue;
        }
        if (type == "i64") type = "i32";
        setValue(ret + i, curr, type);
        if (previousType !== type) {
            typeSize = getNativeTypeSize(type);
            previousType = type;
        }
        i += typeSize;
    }
    return ret;
}
function getMemory(size) {
    if (!runtimeInitialized) return dynamicAlloc(size);
    return _malloc(size);
}
var UTF8Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf8") : undefined;
function UTF8ArrayToString(u8Array, idx, maxBytesToRead) {
    var endIdx = idx + maxBytesToRead;
    var endPtr = idx;
    while (u8Array[endPtr] && !(endPtr >= endIdx)) ++endPtr;
    if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
        return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
    } else {
        var str = "";
        while (idx < endPtr) {
            var u0 = u8Array[idx++];
            if (!(u0 & 128)) {
                str += String.fromCharCode(u0);
                continue;
            }
            var u1 = u8Array[idx++] & 63;
            if ((u0 & 224) == 192) {
                str += String.fromCharCode(((u0 & 31) << 6) | u1);
                continue;
            }
            var u2 = u8Array[idx++] & 63;
            if ((u0 & 240) == 224) {
                u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
            } else {
                u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (u8Array[idx++] & 63);
            }
            if (u0 < 65536) {
                str += String.fromCharCode(u0);
            } else {
                var ch = u0 - 65536;
                str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));
            }
        }
    }
    return str;
}
function UTF8ToString(ptr, maxBytesToRead) {
    return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
}
function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
    if (!(maxBytesToWrite > 0)) return 0;
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1;
    for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343) {
            var u1 = str.charCodeAt(++i);
            u = (65536 + ((u & 1023) << 10)) | (u1 & 1023);
        }
        if (u <= 127) {
            if (outIdx >= endIdx) break;
            outU8Array[outIdx++] = u;
        } else if (u <= 2047) {
            if (outIdx + 1 >= endIdx) break;
            outU8Array[outIdx++] = 192 | (u >> 6);
            outU8Array[outIdx++] = 128 | (u & 63);
        } else if (u <= 65535) {
            if (outIdx + 2 >= endIdx) break;
            outU8Array[outIdx++] = 224 | (u >> 12);
            outU8Array[outIdx++] = 128 | ((u >> 6) & 63);
            outU8Array[outIdx++] = 128 | (u & 63);
        } else {
            if (outIdx + 3 >= endIdx) break;
            outU8Array[outIdx++] = 240 | (u >> 18);
            outU8Array[outIdx++] = 128 | ((u >> 12) & 63);
            outU8Array[outIdx++] = 128 | ((u >> 6) & 63);
            outU8Array[outIdx++] = 128 | (u & 63);
        }
    }
    outU8Array[outIdx] = 0;
    return outIdx - startIdx;
}
function stringToUTF8(str, outPtr, maxBytesToWrite) {
    return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
}
function lengthBytesUTF8(str) {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343) u = (65536 + ((u & 1023) << 10)) | (str.charCodeAt(++i) & 1023);
        if (u <= 127) ++len;
        else if (u <= 2047) len += 2;
        else if (u <= 65535) len += 3;
        else len += 4;
    }
    return len;
}
var UTF16Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-16le") : undefined;
function allocateUTF8(str) {
    var size = lengthBytesUTF8(str) + 1;
    var ret = _malloc(size);
    if (ret) stringToUTF8Array(str, HEAP8, ret, size);
    return ret;
}
function allocateUTF8OnStack(str) {
    var size = lengthBytesUTF8(str) + 1;
    var ret = stackAlloc(size);
    stringToUTF8Array(str, HEAP8, ret, size);
    return ret;
}
function writeArrayToMemory(array, buffer) {
    HEAP8.set(array, buffer);
}
function writeAsciiToMemory(str, buffer, dontAddNull) {
    for (var i = 0; i < str.length; ++i) {
        HEAP8[buffer++ >> 0] = str.charCodeAt(i);
    }
    if (!dontAddNull) HEAP8[buffer >> 0] = 0;
}
var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
function alignUp(x, multiple) {
    if (x % multiple > 0) {
        x += multiple - (x % multiple);
    }
    return x;
}
var buffer, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
function updateGlobalBufferAndViews(buf) {
    buffer = buf;
    Module["HEAP8"] = HEAP8 = new Int8Array(buf);
    Module["HEAP16"] = HEAP16 = new Int16Array(buf);
    Module["HEAP32"] = HEAP32 = new Int32Array(buf);
    Module["HEAPU8"] = HEAPU8 = new Uint8Array(buf);
    Module["HEAPU16"] = HEAPU16 = new Uint16Array(buf);
    Module["HEAPU32"] = HEAPU32 = new Uint32Array(buf);
    Module["HEAPF32"] = HEAPF32 = new Float32Array(buf);
    Module["HEAPF64"] = HEAPF64 = new Float64Array(buf);
}
var STACK_BASE = 2607168,
    DYNAMIC_BASE = 7850048,
    DYNAMICTOP_PTR = 2607136;
function abortStackOverflowEmterpreter() {
    abort("Emterpreter stack overflow! Decrease the recursion level or increase EMT_STACK_MAX in tools/emterpretify.py (current value " + EMT_STACK_MAX + ").");
}
var INITIAL_TOTAL_MEMORY = Module["TOTAL_MEMORY"] || 134217728;
if (Module["wasmMemory"]) {
    wasmMemory = Module["wasmMemory"];
} else {
    wasmMemory = new WebAssembly.Memory({ initial: INITIAL_TOTAL_MEMORY / WASM_PAGE_SIZE });
}
if (wasmMemory) {
    buffer = wasmMemory.buffer;
}
INITIAL_TOTAL_MEMORY = buffer.byteLength;
updateGlobalBufferAndViews(buffer);
HEAP32[DYNAMICTOP_PTR >> 2] = DYNAMIC_BASE;
function callRuntimeCallbacks(callbacks) {
    while (callbacks.length > 0) {
        var callback = callbacks.shift();
        if (typeof callback == "function") {
            callback();
            continue;
        }
        var func = callback.func;
        if (typeof func === "number") {
            if (callback.arg === undefined) {
                Module["dynCall_v"](func);
            } else {
                Module["dynCall_vi"](func, callback.arg);
            }
        } else {
            func(callback.arg === undefined ? null : callback.arg);
        }
    }
}
var __ATPRERUN__ = [];
var __ATINIT__ = [];
var __ATMAIN__ = [];
var __ATEXIT__ = [];
var __ATPOSTRUN__ = [];
var runtimeInitialized = false;
var runtimeExited = false;
function preRun() {
    if (Module["preRun"]) {
        if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
        while (Module["preRun"].length) {
            addOnPreRun(Module["preRun"].shift());
        }
    }
    callRuntimeCallbacks(__ATPRERUN__);
}
function initRuntime() {
    runtimeInitialized = true;
    if (!Module["noFSInit"] && !FS.init.initialized) FS.init();
    TTY.init();
    SOCKFS.root = FS.mount(SOCKFS, {}, null);
    PIPEFS.root = FS.mount(PIPEFS, {}, null);
    callRuntimeCallbacks(__ATINIT__);
}
function preMain() {
    FS.ignorePermissions = false;
    callRuntimeCallbacks(__ATMAIN__);
}
function exitRuntime() {
    runtimeExited = true;
}
function postRun() {
    if (Module["postRun"]) {
        if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
        while (Module["postRun"].length) {
            addOnPostRun(Module["postRun"].shift());
        }
    }
    callRuntimeCallbacks(__ATPOSTRUN__);
}
function addOnPreRun(cb) {
    __ATPRERUN__.unshift(cb);
}
function addOnPostRun(cb) {
    __ATPOSTRUN__.unshift(cb);
}
var Math_abs = Math.abs;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_fround = Math.fround;
var Math_min = Math.min;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null;
function getUniqueRunDependency(id) {
    return id;
}
function addRunDependency(id) {
    runDependencies++;
    if (Module["monitorRunDependencies"]) {
        Module["monitorRunDependencies"](runDependencies);
    }
}
function removeRunDependency(id) {
    runDependencies--;
    if (Module["monitorRunDependencies"]) {
        Module["monitorRunDependencies"](runDependencies);
    }
    if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
            clearInterval(runDependencyWatcher);
            runDependencyWatcher = null;
        }
        if (dependenciesFulfilled) {
            var callback = dependenciesFulfilled;
            dependenciesFulfilled = null;
            callback();
        }
    }
}
Module["preloadedImages"] = {};
Module["preloadedAudios"] = {};
var dataURIPrefix = "data:application/octet-stream;base64,";
function isDataURI(filename) {
    return String.prototype.startsWith ? filename.startsWith(dataURIPrefix) : filename.indexOf(dataURIPrefix) === 0;
}
var wasmBinaryFile = "index.wasm";
if (!isDataURI(wasmBinaryFile)) {
    wasmBinaryFile = locateFile(wasmBinaryFile);
}
function getBinary() {
    try {
        if (wasmBinary) {
            return new Uint8Array(wasmBinary);
        }
        if (readBinary) {
            return readBinary(wasmBinaryFile);
        } else {
            throw "both async and sync fetching of the wasm failed";
        }
    } catch (err) {
        abort(err);
    }
}
function getBinaryPromise() {
    if (!wasmBinary && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && typeof fetch === "function") {
        return fetch(wasmBinaryFile, { credentials: "same-origin" })
            .then(function (response) {
                if (!response["ok"]) {
                    throw "failed to load wasm binary file at '" + wasmBinaryFile + "'";
                }
                return response["arrayBuffer"]();
            })
            .catch(function () {
                return getBinary();
            });
    }
    return new Promise(function (resolve, reject) {
        resolve(getBinary());
    });
}
function createWasm(env) {
    var info = { env: env, wasi_unstable: env, global: { NaN: NaN, Infinity: Infinity }, "global.Math": Math, asm2wasm: asm2wasmImports };
    function receiveInstance(instance, module) {
        var exports = instance.exports;
        Module["asm"] = exports;
        removeRunDependency("wasm-instantiate");
    }
    addRunDependency("wasm-instantiate");
    function receiveInstantiatedSource(output) {
        receiveInstance(output["instance"]);
    }
    function instantiateArrayBuffer(receiver) {
        return getBinaryPromise()
            .then(function (binary) {
                return WebAssembly.instantiate(binary, info);
            })
            .then(receiver, function (reason) {
                err("failed to asynchronously prepare wasm: " + reason);
                abort(reason);
            });
    }
    function instantiateAsync() {
        if (!wasmBinary && typeof WebAssembly.instantiateStreaming === "function" && !isDataURI(wasmBinaryFile) && typeof fetch === "function") {
            fetch(wasmBinaryFile, { credentials: "same-origin" }).then(function (response) {
                var result = WebAssembly.instantiateStreaming(response, info);
                return result.then(receiveInstantiatedSource, function (reason) {
                    err("wasm streaming compile failed: " + reason);
                    err("falling back to ArrayBuffer instantiation");
                    instantiateArrayBuffer(receiveInstantiatedSource);
                });
            });
        } else {
            return instantiateArrayBuffer(receiveInstantiatedSource);
        }
    }
    if (Module["instantiateWasm"]) {
        try {
            var exports = Module["instantiateWasm"](info, receiveInstance);
            return exports;
        } catch (e) {
            err("Module.instantiateWasm callback failed with error: " + e);
            return false;
        }
    }
    instantiateAsync();
    return {};
}
Module["asm"] = function (global, env, providedBuffer) {
    env["memory"] = wasmMemory;
    env["table"] = wasmTable = new WebAssembly.Table({ initial: 8192, maximum: 8192, element: "anyfunc" });
    env["__memory_base"] = 1024;
    env["__table_base"] = 0;
    var exports = createWasm(env);
    return exports;
};
var tempDouble;
var tempI64;
var ASM_CONSTS = [
    function () {
        return screen.width;
    },
    function () {
        return screen.height;
    },
    function ($0) {
        if (typeof Module["setWindowTitle"] !== "undefined") {
            Module["setWindowTitle"](UTF8ToString($0));
        }
        return 0;
    },
    function ($0, $1, $2) {
        var w = $0;
        var h = $1;
        var pixels = $2;
        if (!Module["SDL2"]) Module["SDL2"] = {};
        var SDL2 = Module["SDL2"];
        if (SDL2.ctxCanvas !== Module["canvas"]) {
            SDL2.ctx = Module["createContext"](Module["canvas"], false, true);
            SDL2.ctxCanvas = Module["canvas"];
        }
        if (SDL2.w !== w || SDL2.h !== h || SDL2.imageCtx !== SDL2.ctx) {
            SDL2.image = SDL2.ctx.createImageData(w, h);
            SDL2.w = w;
            SDL2.h = h;
            SDL2.imageCtx = SDL2.ctx;
        }
        var data = SDL2.image.data;
        var src = pixels >> 2;
        var dst = 0;
        var num;
        if (typeof CanvasPixelArray !== "undefined" && data instanceof CanvasPixelArray) {
            num = data.length;
            while (dst < num) {
                var val = HEAP32[src];
                data[dst] = val & 255;
                data[dst + 1] = (val >> 8) & 255;
                data[dst + 2] = (val >> 16) & 255;
                data[dst + 3] = 255;
                src++;
                dst += 4;
            }
        } else {
            if (SDL2.data32Data !== data) {
                SDL2.data32 = new Int32Array(data.buffer);
                SDL2.data8 = new Uint8Array(data.buffer);
            }
            var data32 = SDL2.data32;
            num = data32.length;
            data32.set(HEAP32.subarray(src, src + num));
            var data8 = SDL2.data8;
            var i = 3;
            var j = i + 4 * num;
            if (num % 8 == 0) {
                while (i < j) {
                    data8[i] = 255;
                    i = (i + 4) | 0;
                    data8[i] = 255;
                    i = (i + 4) | 0;
                    data8[i] = 255;
                    i = (i + 4) | 0;
                    data8[i] = 255;
                    i = (i + 4) | 0;
                    data8[i] = 255;
                    i = (i + 4) | 0;
                    data8[i] = 255;
                    i = (i + 4) | 0;
                    data8[i] = 255;
                    i = (i + 4) | 0;
                    data8[i] = 255;
                    i = (i + 4) | 0;
                }
            } else {
                while (i < j) {
                    data8[i] = 255;
                    i = (i + 4) | 0;
                }
            }
        }
        SDL2.ctx.putImageData(SDL2.image, 0, 0);
        return 0;
    },
    function ($0, $1, $2, $3, $4) {
        var w = $0;
        var h = $1;
        var hot_x = $2;
        var hot_y = $3;
        var pixels = $4;
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        var image = ctx.createImageData(w, h);
        var data = image.data;
        var src = pixels >> 2;
        var dst = 0;
        var num;
        if (typeof CanvasPixelArray !== "undefined" && data instanceof CanvasPixelArray) {
            num = data.length;
            while (dst < num) {
                var val = HEAP32[src];
                data[dst] = val & 255;
                data[dst + 1] = (val >> 8) & 255;
                data[dst + 2] = (val >> 16) & 255;
                data[dst + 3] = (val >> 24) & 255;
                src++;
                dst += 4;
            }
        } else {
            var data32 = new Int32Array(data.buffer);
            num = data32.length;
            data32.set(HEAP32.subarray(src, src + num));
        }
        ctx.putImageData(image, 0, 0);
        var url = hot_x === 0 && hot_y === 0 ? "url(" + canvas.toDataURL() + "), auto" : "url(" + canvas.toDataURL() + ") " + hot_x + " " + hot_y + ", auto";
        var urlBuf = _malloc(url.length + 1);
        stringToUTF8(url, urlBuf, url.length + 1);
        return urlBuf;
    },
    function ($0) {
        if (Module["canvas"]) {
            Module["canvas"].style["cursor"] = UTF8ToString($0);
        }
        return 0;
    },
    function () {
        if (Module["canvas"]) {
            Module["canvas"].style["cursor"] = "none";
        }
    },
    function () {
        if (typeof AudioContext !== "undefined") {
            return 1;
        } else if (typeof webkitAudioContext !== "undefined") {
            return 1;
        }
        return 0;
    },
    function () {
        if (typeof navigator.mediaDevices !== "undefined" && typeof navigator.mediaDevices.getUserMedia !== "undefined") {
            return 1;
        } else if (typeof navigator.webkitGetUserMedia !== "undefined") {
            return 1;
        }
        return 0;
    },
    function ($0) {
        if (typeof Module["SDL2"] === "undefined") {
            Module["SDL2"] = {};
        }
        var SDL2 = Module["SDL2"];
        if (!$0) {
            SDL2.audio = {};
        } else {
            SDL2.capture = {};
        }
        if (!SDL2.audioContext) {
            if (typeof AudioContext !== "undefined") {
                SDL2.audioContext = new AudioContext();
            } else if (typeof webkitAudioContext !== "undefined") {
                SDL2.audioContext = new webkitAudioContext();
            }
        }
        return SDL2.audioContext === undefined ? -1 : 0;
    },
    function () {
        var SDL2 = Module["SDL2"];
        return SDL2.audioContext.sampleRate;
    },
    function ($0, $1, $2, $3) {
        var SDL2 = Module["SDL2"];
        var have_microphone = function (stream) {
            if (SDL2.capture.silenceTimer !== undefined) {
                clearTimeout(SDL2.capture.silenceTimer);
                SDL2.capture.silenceTimer = undefined;
            }
            SDL2.capture.mediaStreamNode = SDL2.audioContext.createMediaStreamSource(stream);
            SDL2.capture.scriptProcessorNode = SDL2.audioContext.createScriptProcessor($1, $0, 1);
            SDL2.capture.scriptProcessorNode.onaudioprocess = function (audioProcessingEvent) {
                if (SDL2 === undefined || SDL2.capture === undefined) {
                    return;
                }
                audioProcessingEvent.outputBuffer.getChannelData(0).fill(0);
                SDL2.capture.currentCaptureBuffer = audioProcessingEvent.inputBuffer;
                dynCall("vi", $2, [$3]);
            };
            SDL2.capture.mediaStreamNode.connect(SDL2.capture.scriptProcessorNode);
            SDL2.capture.scriptProcessorNode.connect(SDL2.audioContext.destination);
            SDL2.capture.stream = stream;
        };
        var no_microphone = function (error) {};
        SDL2.capture.silenceBuffer = SDL2.audioContext.createBuffer($0, $1, SDL2.audioContext.sampleRate);
        SDL2.capture.silenceBuffer.getChannelData(0).fill(0);
        var silence_callback = function () {
            SDL2.capture.currentCaptureBuffer = SDL2.capture.silenceBuffer;
            dynCall("vi", $2, [$3]);
        };
        SDL2.capture.silenceTimer = setTimeout(silence_callback, ($1 / SDL2.audioContext.sampleRate) * 1e3);
        if (navigator.mediaDevices !== undefined && navigator.mediaDevices.getUserMedia !== undefined) {
            navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(have_microphone).catch(no_microphone);
        } else if (navigator.webkitGetUserMedia !== undefined) {
            navigator.webkitGetUserMedia({ audio: true, video: false }, have_microphone, no_microphone);
        }
    },
    function ($0, $1, $2, $3) {
        var SDL2 = Module["SDL2"];
        SDL2.audio.scriptProcessorNode = SDL2.audioContext["createScriptProcessor"]($1, 0, $0);
        SDL2.audio.scriptProcessorNode["onaudioprocess"] = function (e) {
            if (SDL2 === undefined || SDL2.audio === undefined) {
                return;
            }
            SDL2.audio.currentOutputBuffer = e["outputBuffer"];
            dynCall("vi", $2, [$3]);
        };
        SDL2.audio.scriptProcessorNode["connect"](SDL2.audioContext["destination"]);
    },
    function ($0) {
        var SDL2 = Module["SDL2"];
        if ($0) {
            if (SDL2.capture.silenceTimer !== undefined) {
                clearTimeout(SDL2.capture.silenceTimer);
            }
            if (SDL2.capture.stream !== undefined) {
                var tracks = SDL2.capture.stream.getAudioTracks();
                for (var i = 0; i < tracks.length; i++) {
                    SDL2.capture.stream.removeTrack(tracks[i]);
                }
                SDL2.capture.stream = undefined;
            }
            if (SDL2.capture.scriptProcessorNode !== undefined) {
                SDL2.capture.scriptProcessorNode.onaudioprocess = function (audioProcessingEvent) {};
                SDL2.capture.scriptProcessorNode.disconnect();
                SDL2.capture.scriptProcessorNode = undefined;
            }
            if (SDL2.capture.mediaStreamNode !== undefined) {
                SDL2.capture.mediaStreamNode.disconnect();
                SDL2.capture.mediaStreamNode = undefined;
            }
            if (SDL2.capture.silenceBuffer !== undefined) {
                SDL2.capture.silenceBuffer = undefined;
            }
            SDL2.capture = undefined;
        } else {
            if (SDL2.audio.scriptProcessorNode != undefined) {
                SDL2.audio.scriptProcessorNode.disconnect();
                SDL2.audio.scriptProcessorNode = undefined;
            }
            SDL2.audio = undefined;
        }
        if (SDL2.audioContext !== undefined && SDL2.audio === undefined && SDL2.capture === undefined) {
            SDL2.audioContext.close();
            SDL2.audioContext = undefined;
        }
    },
    function ($0, $1) {
        var SDL2 = Module["SDL2"];
        var numChannels = SDL2.capture.currentCaptureBuffer.numberOfChannels;
        for (var c = 0; c < numChannels; ++c) {
            var channelData = SDL2.capture.currentCaptureBuffer.getChannelData(c);
            if (channelData.length != $1) {
                throw "Web Audio capture buffer length mismatch! Destination size: " + channelData.length + " samples vs expected " + $1 + " samples!";
            }
            if (numChannels == 1) {
                for (var j = 0; j < $1; ++j) {
                    setValue($0 + j * 4, channelData[j], "float");
                }
            } else {
                for (var j = 0; j < $1; ++j) {
                    setValue($0 + (j * numChannels + c) * 4, channelData[j], "float");
                }
            }
        }
    },
    function ($0, $1) {
        var SDL2 = Module["SDL2"];
        var numChannels = SDL2.audio.currentOutputBuffer["numberOfChannels"];
        for (var c = 0; c < numChannels; ++c) {
            var channelData = SDL2.audio.currentOutputBuffer["getChannelData"](c);
            if (channelData.length != $1) {
                throw "Web Audio output buffer length mismatch! Destination size: " + channelData.length + " samples vs expected " + $1 + " samples!";
            }
            for (var j = 0; j < $1; ++j) {
                channelData[j] = HEAPF32[($0 + ((j * numChannels + c) << 2)) >> 2];
            }
        }
    },
    function ($0, $1, $2, $3, $4) {
        return Browser.safeSetTimeout(function () {
            dynCall("viiii", $0, [$1, $2, $3, $4]);
        }, $2);
    },
    function ($0) {
        window.clearTimeout($0);
    },
];
function _emscripten_asm_const_i(code) {
    return ASM_CONSTS[code]();
}
function _emscripten_asm_const_ii(code, a0) {
    return ASM_CONSTS[code](a0);
}
function _emscripten_asm_const_iiiiii(code, a0, a1, a2, a3, a4) {
    return ASM_CONSTS[code](a0, a1, a2, a3, a4);
}
function _emscripten_asm_const_iiiii(code, a0, a1, a2, a3) {
    return ASM_CONSTS[code](a0, a1, a2, a3);
}
function _emscripten_asm_const_iii(code, a0, a1) {
    return ASM_CONSTS[code](a0, a1);
}
function _emscripten_asm_const_iiii(code, a0, a1, a2) {
    return ASM_CONSTS[code](a0, a1, a2);
}
__ATINIT__.push({
    func: function () {
        ___emscripten_environ_constructor();
    },
});
var tempDoublePtr = 2607152;
var EMTSTACKTOP = getMemory(2097152);
var EMT_STACK_MAX = EMTSTACKTOP + 2097152;
var eb = getMemory(146616);
__ATPRERUN__.push(function () {
    var bytecodeFile = Module["emterpreterFile"];
    if (!(bytecodeFile instanceof ArrayBuffer)) {
        throw "bad or missing emterpreter file. If you compiled to JS (and not HTML) make sure you set Module['emterpreterFile']";
    }
    var codeSize = 146616;
    HEAPU8.set(new Uint8Array(bytecodeFile).subarray(0, codeSize), eb);
    var relocationsStart = (codeSize + 3) >> 2;
    var relocations = new Uint32Array(bytecodeFile).subarray(relocationsStart);
    if (relocations.length > 0) {
    }
    for (var i = 0; i < relocations.length; i++) {
        HEAPU32[(eb + relocations[i]) >> 2] = HEAPU32[(eb + relocations[i]) >> 2] + eb;
    }
});
function demangle(func) {
    return func;
}
function demangleAll(text) {
    var regex = /\b__Z[\w\d_]+/g;
    return text.replace(regex, function (x) {
        var y = demangle(x);
        return x === y ? x : y + " [" + x + "]";
    });
}
function jsStackTrace() {
    var err = new Error();
    if (!err.stack) {
        try {
            throw new Error(0);
        } catch (e) {
            err = e;
        }
        if (!err.stack) {
            return "(no stack trace available)";
        }
    }
    return err.stack.toString();
}
function stackTrace() {
    var js = jsStackTrace();
    if (Module["extraStackTrace"]) js += "\n" + Module["extraStackTrace"]();
    return demangleAll(js);
}
function ___assert_fail(condition, filename, line, func) {
    abort("Assertion failed: " + UTF8ToString(condition) + ", at: " + [filename ? UTF8ToString(filename) : "unknown filename", line, func ? UTF8ToString(func) : "unknown function"]);
}
var ENV = {};
function ___buildEnvironment(environ) {
    var MAX_ENV_VALUES = 64;
    var TOTAL_ENV_SIZE = 1024;
    var poolPtr;
    var envPtr;
    if (!___buildEnvironment.called) {
        ___buildEnvironment.called = true;
        ENV["USER"] = ENV["LOGNAME"] = "web_user";
        ENV["PATH"] = "/";
        ENV["PWD"] = "/";
        ENV["HOME"] = "/home/web_user";
        ENV["LANG"] = ((typeof navigator === "object" && navigator.languages && navigator.languages[0]) || "C").replace("-", "_") + ".UTF-8";
        ENV["_"] = thisProgram;
        poolPtr = getMemory(TOTAL_ENV_SIZE);
        envPtr = getMemory(MAX_ENV_VALUES * 4);
        HEAP32[envPtr >> 2] = poolPtr;
        HEAP32[environ >> 2] = envPtr;
    } else {
        envPtr = HEAP32[environ >> 2];
        poolPtr = HEAP32[envPtr >> 2];
    }
    var strings = [];
    var totalSize = 0;
    for (var key in ENV) {
        if (typeof ENV[key] === "string") {
            var line = key + "=" + ENV[key];
            strings.push(line);
            totalSize += line.length;
        }
    }
    if (totalSize > TOTAL_ENV_SIZE) {
        throw new Error("Environment size exceeded TOTAL_ENV_SIZE!");
    }
    var ptrSize = 4;
    for (var i = 0; i < strings.length; i++) {
        var line = strings[i];
        writeAsciiToMemory(line, poolPtr);
        HEAP32[(envPtr + i * ptrSize) >> 2] = poolPtr;
        poolPtr += line.length + 1;
    }
    HEAP32[(envPtr + strings.length * ptrSize) >> 2] = 0;
}
function _emscripten_get_now() {
    abort();
}
function _emscripten_get_now_is_monotonic() {
    return 0 || (typeof performance === "object" && performance && typeof performance["now"] === "function");
}
function ___setErrNo(value) {
    if (Module["___errno_location"]) HEAP32[Module["___errno_location"]() >> 2] = value;
    return value;
}
function _clock_gettime(clk_id, tp) {
    var now;
    if (clk_id === 0) {
        now = Date.now();
    } else if (clk_id === 1 && _emscripten_get_now_is_monotonic()) {
        now = _emscripten_get_now();
    } else {
        ___setErrNo(22);
        return -1;
    }
    HEAP32[tp >> 2] = (now / 1e3) | 0;
    HEAP32[(tp + 4) >> 2] = ((now % 1e3) * 1e3 * 1e3) | 0;
    return 0;
}
function ___clock_gettime(a0, a1) {
    return _clock_gettime(a0, a1);
}
function _llvm_cttz_i32(x) {
    x = x | 0;
    return (x ? (31 - (Math_clz32(x ^ (x - 1)) | 0)) | 0 : 32) | 0;
}
function ___lock() {}
function ___map_file(pathname, size) {
    ___setErrNo(1);
    return -1;
}
var PATH = {
    splitPath: function (filename) {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
    },
    normalizeArray: function (parts, allowAboveRoot) {
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
            var last = parts[i];
            if (last === ".") {
                parts.splice(i, 1);
            } else if (last === "..") {
                parts.splice(i, 1);
                up++;
            } else if (up) {
                parts.splice(i, 1);
                up--;
            }
        }
        if (allowAboveRoot) {
            for (; up; up--) {
                parts.unshift("..");
            }
        }
        return parts;
    },
    normalize: function (path) {
        var isAbsolute = path.charAt(0) === "/",
            trailingSlash = path.substr(-1) === "/";
        path = PATH.normalizeArray(
            path.split("/").filter(function (p) {
                return !!p;
            }),
            !isAbsolute
        ).join("/");
        if (!path && !isAbsolute) {
            path = ".";
        }
        if (path && trailingSlash) {
            path += "/";
        }
        return (isAbsolute ? "/" : "") + path;
    },
    dirname: function (path) {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
            return ".";
        }
        if (dir) {
            dir = dir.substr(0, dir.length - 1);
        }
        return root + dir;
    },
    basename: function (path) {
        if (path === "/") return "/";
        var lastSlash = path.lastIndexOf("/");
        if (lastSlash === -1) return path;
        return path.substr(lastSlash + 1);
    },
    extname: function (path) {
        return PATH.splitPath(path)[3];
    },
    join: function () {
        var paths = Array.prototype.slice.call(arguments, 0);
        return PATH.normalize(paths.join("/"));
    },
    join2: function (l, r) {
        return PATH.normalize(l + "/" + r);
    },
};
var PATH_FS = {
    resolve: function () {
        var resolvedPath = "",
            resolvedAbsolute = false;
        for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
            var path = i >= 0 ? arguments[i] : FS.cwd();
            if (typeof path !== "string") {
                throw new TypeError("Arguments to path.resolve must be strings");
            } else if (!path) {
                return "";
            }
            resolvedPath = path + "/" + resolvedPath;
            resolvedAbsolute = path.charAt(0) === "/";
        }
        resolvedPath = PATH.normalizeArray(
            resolvedPath.split("/").filter(function (p) {
                return !!p;
            }),
            !resolvedAbsolute
        ).join("/");
        return (resolvedAbsolute ? "/" : "") + resolvedPath || ".";
    },
    relative: function (from, to) {
        from = PATH_FS.resolve(from).substr(1);
        to = PATH_FS.resolve(to).substr(1);
        function trim(arr) {
            var start = 0;
            for (; start < arr.length; start++) {
                if (arr[start] !== "") break;
            }
            var end = arr.length - 1;
            for (; end >= 0; end--) {
                if (arr[end] !== "") break;
            }
            if (start > end) return [];
            return arr.slice(start, end - start + 1);
        }
        var fromParts = trim(from.split("/"));
        var toParts = trim(to.split("/"));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
            if (fromParts[i] !== toParts[i]) {
                samePartsLength = i;
                break;
            }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
            outputParts.push("..");
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join("/");
    },
};
var TTY = {
    ttys: [],
    init: function () {},
    shutdown: function () {},
    register: function (dev, ops) {
        TTY.ttys[dev] = { input: [], output: [], ops: ops };
        FS.registerDevice(dev, TTY.stream_ops);
    },
    stream_ops: {
        open: function (stream) {
            var tty = TTY.ttys[stream.node.rdev];
            if (!tty) {
                throw new FS.ErrnoError(19);
            }
            stream.tty = tty;
            stream.seekable = false;
        },
        close: function (stream) {
            stream.tty.ops.flush(stream.tty);
        },
        flush: function (stream) {
            stream.tty.ops.flush(stream.tty);
        },
        read: function (stream, buffer, offset, length, pos) {
            if (!stream.tty || !stream.tty.ops.get_char) {
                throw new FS.ErrnoError(6);
            }
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
                var result;
                try {
                    result = stream.tty.ops.get_char(stream.tty);
                } catch (e) {
                    throw new FS.ErrnoError(5);
                }
                if (result === undefined && bytesRead === 0) {
                    throw new FS.ErrnoError(11);
                }
                if (result === null || result === undefined) break;
                bytesRead++;
                buffer[offset + i] = result;
            }
            if (bytesRead) {
                stream.node.timestamp = Date.now();
            }
            return bytesRead;
        },
        write: function (stream, buffer, offset, length, pos) {
            if (!stream.tty || !stream.tty.ops.put_char) {
                throw new FS.ErrnoError(6);
            }
            try {
                for (var i = 0; i < length; i++) {
                    stream.tty.ops.put_char(stream.tty, buffer[offset + i]);
                }
            } catch (e) {
                throw new FS.ErrnoError(5);
            }
            if (length) {
                stream.node.timestamp = Date.now();
            }
            return i;
        },
    },
    default_tty_ops: {
        get_char: function (tty) {
            if (!tty.input.length) {
                var result = null;
                if (typeof window != "undefined" && typeof window.prompt == "function") {
                    result = window.prompt("Input: ");
                    if (result !== null) {
                        result += "\n";
                    }
                } else if (typeof readline == "function") {
                    result = readline();
                    if (result !== null) {
                        result += "\n";
                    }
                }
                if (!result) {
                    return null;
                }
                tty.input = intArrayFromString(result, true);
            }
            return tty.input.shift();
        },
        put_char: function (tty, val) {
            if (val === null || val === 10) {
                out(UTF8ArrayToString(tty.output, 0));
                tty.output = [];
            } else {
                if (val != 0) tty.output.push(val);
            }
        },
        flush: function (tty) {
            if (tty.output && tty.output.length > 0) {
                out(UTF8ArrayToString(tty.output, 0));
                tty.output = [];
            }
        },
    },
    default_tty1_ops: {
        put_char: function (tty, val) {
            if (val === null || val === 10) {
                err(UTF8ArrayToString(tty.output, 0));
                tty.output = [];
            } else {
                if (val != 0) tty.output.push(val);
            }
        },
        flush: function (tty) {
            if (tty.output && tty.output.length > 0) {
                err(UTF8ArrayToString(tty.output, 0));
                tty.output = [];
            }
        },
    },
};
var MEMFS = {
    ops_table: null,
    mount: function (mount) {
        return MEMFS.createNode(null, "/", 16384 | 511, 0);
    },
    createNode: function (parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
            throw new FS.ErrnoError(1);
        }
        if (!MEMFS.ops_table) {
            MEMFS.ops_table = {
                dir: {
                    node: {
                        getattr: MEMFS.node_ops.getattr,
                        setattr: MEMFS.node_ops.setattr,
                        lookup: MEMFS.node_ops.lookup,
                        mknod: MEMFS.node_ops.mknod,
                        rename: MEMFS.node_ops.rename,
                        unlink: MEMFS.node_ops.unlink,
                        rmdir: MEMFS.node_ops.rmdir,
                        readdir: MEMFS.node_ops.readdir,
                        symlink: MEMFS.node_ops.symlink,
                    },
                    stream: { llseek: MEMFS.stream_ops.llseek },
                },
                file: {
                    node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr },
                    stream: { llseek: MEMFS.stream_ops.llseek, read: MEMFS.stream_ops.read, write: MEMFS.stream_ops.write, allocate: MEMFS.stream_ops.allocate, mmap: MEMFS.stream_ops.mmap, msync: MEMFS.stream_ops.msync },
                },
                link: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr, readlink: MEMFS.node_ops.readlink }, stream: {} },
                chrdev: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr }, stream: FS.chrdev_stream_ops },
            };
        }
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
            node.node_ops = MEMFS.ops_table.dir.node;
            node.stream_ops = MEMFS.ops_table.dir.stream;
            node.contents = {};
        } else if (FS.isFile(node.mode)) {
            node.node_ops = MEMFS.ops_table.file.node;
            node.stream_ops = MEMFS.ops_table.file.stream;
            node.usedBytes = 0;
            node.contents = null;
        } else if (FS.isLink(node.mode)) {
            node.node_ops = MEMFS.ops_table.link.node;
            node.stream_ops = MEMFS.ops_table.link.stream;
        } else if (FS.isChrdev(node.mode)) {
            node.node_ops = MEMFS.ops_table.chrdev.node;
            node.stream_ops = MEMFS.ops_table.chrdev.stream;
        }
        node.timestamp = Date.now();
        if (parent) {
            parent.contents[name] = node;
        }
        return node;
    },
    getFileDataAsRegularArray: function (node) {
        if (node.contents && node.contents.subarray) {
            var arr = [];
            for (var i = 0; i < node.usedBytes; ++i) arr.push(node.contents[i]);
            return arr;
        }
        return node.contents;
    },
    getFileDataAsTypedArray: function (node) {
        if (!node.contents) return new Uint8Array();
        if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes);
        return new Uint8Array(node.contents);
    },
    expandFileStorage: function (node, newCapacity) {
        var prevCapacity = node.contents ? node.contents.length : 0;
        if (prevCapacity >= newCapacity) return;
        var CAPACITY_DOUBLING_MAX = 1024 * 1024;
        newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125)) | 0);
        if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);
        var oldContents = node.contents;
        node.contents = new Uint8Array(newCapacity);
        if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0);
        return;
    },
    resizeFileStorage: function (node, newSize) {
        if (node.usedBytes == newSize) return;
        if (newSize == 0) {
            node.contents = null;
            node.usedBytes = 0;
            return;
        }
        if (!node.contents || node.contents.subarray) {
            var oldContents = node.contents;
            node.contents = new Uint8Array(new ArrayBuffer(newSize));
            if (oldContents) {
                node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes)));
            }
            node.usedBytes = newSize;
            return;
        }
        if (!node.contents) node.contents = [];
        if (node.contents.length > newSize) node.contents.length = newSize;
        else while (node.contents.length < newSize) node.contents.push(0);
        node.usedBytes = newSize;
    },
    node_ops: {
        getattr: function (node) {
            var attr = {};
            attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
            attr.ino = node.id;
            attr.mode = node.mode;
            attr.nlink = 1;
            attr.uid = 0;
            attr.gid = 0;
            attr.rdev = node.rdev;
            if (FS.isDir(node.mode)) {
                attr.size = 4096;
            } else if (FS.isFile(node.mode)) {
                attr.size = node.usedBytes;
            } else if (FS.isLink(node.mode)) {
                attr.size = node.link.length;
            } else {
                attr.size = 0;
            }
            attr.atime = new Date(node.timestamp);
            attr.mtime = new Date(node.timestamp);
            attr.ctime = new Date(node.timestamp);
            attr.blksize = 4096;
            attr.blocks = Math.ceil(attr.size / attr.blksize);
            return attr;
        },
        setattr: function (node, attr) {
            if (attr.mode !== undefined) {
                node.mode = attr.mode;
            }
            if (attr.timestamp !== undefined) {
                node.timestamp = attr.timestamp;
            }
            if (attr.size !== undefined) {
                MEMFS.resizeFileStorage(node, attr.size);
            }
        },
        lookup: function (parent, name) {
            throw FS.genericErrors[2];
        },
        mknod: function (parent, name, mode, dev) {
            return MEMFS.createNode(parent, name, mode, dev);
        },
        rename: function (old_node, new_dir, new_name) {
            if (FS.isDir(old_node.mode)) {
                var new_node;
                try {
                    new_node = FS.lookupNode(new_dir, new_name);
                } catch (e) {}
                if (new_node) {
                    for (var i in new_node.contents) {
                        throw new FS.ErrnoError(39);
                    }
                }
            }
            delete old_node.parent.contents[old_node.name];
            old_node.name = new_name;
            new_dir.contents[new_name] = old_node;
            old_node.parent = new_dir;
        },
        unlink: function (parent, name) {
            delete parent.contents[name];
        },
        rmdir: function (parent, name) {
            var node = FS.lookupNode(parent, name);
            for (var i in node.contents) {
                throw new FS.ErrnoError(39);
            }
            delete parent.contents[name];
        },
        readdir: function (node) {
            var entries = [".", ".."];
            for (var key in node.contents) {
                if (!node.contents.hasOwnProperty(key)) {
                    continue;
                }
                entries.push(key);
            }
            return entries;
        },
        symlink: function (parent, newname, oldpath) {
            var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
            node.link = oldpath;
            return node;
        },
        readlink: function (node) {
            if (!FS.isLink(node.mode)) {
                throw new FS.ErrnoError(22);
            }
            return node.link;
        },
    },
    stream_ops: {
        read: function (stream, buffer, offset, length, position) {
            var contents = stream.node.contents;
            if (position >= stream.node.usedBytes) return 0;
            var size = Math.min(stream.node.usedBytes - position, length);
            if (size > 8 && contents.subarray) {
                buffer.set(contents.subarray(position, position + size), offset);
            } else {
                for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
            }
            return size;
        },
        write: function (stream, buffer, offset, length, position, canOwn) {
            canOwn = false;
            if (!length) return 0;
            var node = stream.node;
            node.timestamp = Date.now();
            if (buffer.subarray && (!node.contents || node.contents.subarray)) {
                if (canOwn) {
                    node.contents = buffer.subarray(offset, offset + length);
                    node.usedBytes = length;
                    return length;
                } else if (node.usedBytes === 0 && position === 0) {
                    node.contents = new Uint8Array(buffer.subarray(offset, offset + length));
                    node.usedBytes = length;
                    return length;
                } else if (position + length <= node.usedBytes) {
                    node.contents.set(buffer.subarray(offset, offset + length), position);
                    return length;
                }
            }
            MEMFS.expandFileStorage(node, position + length);
            if (node.contents.subarray && buffer.subarray) node.contents.set(buffer.subarray(offset, offset + length), position);
            else {
                for (var i = 0; i < length; i++) {
                    node.contents[position + i] = buffer[offset + i];
                }
            }
            node.usedBytes = Math.max(node.usedBytes, position + length);
            return length;
        },
        llseek: function (stream, offset, whence) {
            var position = offset;
            if (whence === 1) {
                position += stream.position;
            } else if (whence === 2) {
                if (FS.isFile(stream.node.mode)) {
                    position += stream.node.usedBytes;
                }
            }
            if (position < 0) {
                throw new FS.ErrnoError(22);
            }
            return position;
        },
        allocate: function (stream, offset, length) {
            MEMFS.expandFileStorage(stream.node, offset + length);
            stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
        },
        mmap: function (stream, buffer, offset, length, position, prot, flags) {
            if (!FS.isFile(stream.node.mode)) {
                throw new FS.ErrnoError(19);
            }
            var ptr;
            var allocated;
            var contents = stream.node.contents;
            if (!(flags & 2) && (contents.buffer === buffer || contents.buffer === buffer.buffer)) {
                allocated = false;
                ptr = contents.byteOffset;
            } else {
                if (position > 0 || position + length < stream.node.usedBytes) {
                    if (contents.subarray) {
                        contents = contents.subarray(position, position + length);
                    } else {
                        contents = Array.prototype.slice.call(contents, position, position + length);
                    }
                }
                allocated = true;
                var fromHeap = buffer.buffer == HEAP8.buffer;
                ptr = _malloc(length);
                if (!ptr) {
                    throw new FS.ErrnoError(12);
                }
                (fromHeap ? HEAP8 : buffer).set(contents, ptr);
            }
            return { ptr: ptr, allocated: allocated };
        },
        msync: function (stream, buffer, offset, length, mmapFlags) {
            if (!FS.isFile(stream.node.mode)) {
                throw new FS.ErrnoError(19);
            }
            if (mmapFlags & 2) {
                return 0;
            }
            var bytesWritten = MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
            return 0;
        },
    },
};
var IDBFS = {
    dbs: {},
    indexedDB: function () {
        if (typeof indexedDB !== "undefined") return indexedDB;
        var ret = null;
        if (typeof window === "object") ret = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        assert(ret, "IDBFS used, but indexedDB not supported");
        return ret;
    },
    DB_VERSION: 21,
    DB_STORE_NAME: "FILE_DATA",
    mount: function (mount) {
        return MEMFS.mount.apply(null, arguments);
    },
    syncfs: function (mount, populate, callback) {
        IDBFS.getLocalSet(mount, function (err, local) {
            if (err) return callback(err);
            IDBFS.getRemoteSet(mount, function (err, remote) {
                if (err) return callback(err);
                var src = populate ? remote : local;
                var dst = populate ? local : remote;
                IDBFS.reconcile(src, dst, callback);
            });
        });
    },
    getDB: function (name, callback) {
        var db = IDBFS.dbs[name];
        if (db) {
            return callback(null, db);
        }
        var req;
        try {
            req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION);
        } catch (e) {
            return callback(e);
        }
        if (!req) {
            return callback("Unable to connect to IndexedDB");
        }
        req.onupgradeneeded = function (e) {
            var db = e.target.result;
            var transaction = e.target.transaction;
            var fileStore;
            if (db.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
                fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME);
            } else {
                fileStore = db.createObjectStore(IDBFS.DB_STORE_NAME);
            }
            if (!fileStore.indexNames.contains("timestamp")) {
                fileStore.createIndex("timestamp", "timestamp", { unique: false });
            }
        };
        req.onsuccess = function () {
            db = req.result;
            IDBFS.dbs[name] = db;
            callback(null, db);
        };
        req.onerror = function (e) {
            callback(this.error);
            e.preventDefault();
        };
    },
    getLocalSet: function (mount, callback) {
        var entries = {};
        function isRealDir(p) {
            return p !== "." && p !== "..";
        }
        function toAbsolute(root) {
            return function (p) {
                return PATH.join2(root, p);
            };
        }
        var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));
        while (check.length) {
            var path = check.pop();
            var stat;
            try {
                stat = FS.stat(path);
            } catch (e) {
                return callback(e);
            }
            if (FS.isDir(stat.mode)) {
                check.push.apply(check, FS.readdir(path).filter(isRealDir).map(toAbsolute(path)));
            }
            entries[path] = { timestamp: stat.mtime };
        }
        return callback(null, { type: "local", entries: entries });
    },
    getRemoteSet: function (mount, callback) {
        var entries = {};
        IDBFS.getDB(mount.mountpoint, function (err, db) {
            if (err) return callback(err);
            try {
                var transaction = db.transaction([IDBFS.DB_STORE_NAME], "readonly");
                transaction.onerror = function (e) {
                    callback(this.error);
                    e.preventDefault();
                };
                var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
                var index = store.index("timestamp");
                index.openKeyCursor().onsuccess = function (event) {
                    var cursor = event.target.result;
                    if (!cursor) {
                        return callback(null, { type: "remote", db: db, entries: entries });
                    }
                    entries[cursor.primaryKey] = { timestamp: cursor.key };
                    cursor.continue();
                };
            } catch (e) {
                return callback(e);
            }
        });
    },
    loadLocalEntry: function (path, callback) {
        var stat, node;
        try {
            var lookup = FS.lookupPath(path);
            node = lookup.node;
            stat = FS.stat(path);
        } catch (e) {
            return callback(e);
        }
        if (FS.isDir(stat.mode)) {
            return callback(null, { timestamp: stat.mtime, mode: stat.mode });
        } else if (FS.isFile(stat.mode)) {
            node.contents = MEMFS.getFileDataAsTypedArray(node);
            return callback(null, { timestamp: stat.mtime, mode: stat.mode, contents: node.contents });
        } else {
            return callback(new Error("node type not supported"));
        }
    },
    storeLocalEntry: function (path, entry, callback) {
        try {
            if (FS.isDir(entry.mode)) {
                FS.mkdir(path, entry.mode);
            } else if (FS.isFile(entry.mode)) {
                FS.writeFile(path, entry.contents, { canOwn: true });
            } else {
                return callback(new Error("node type not supported"));
            }
            FS.chmod(path, entry.mode);
            FS.utime(path, entry.timestamp, entry.timestamp);
        } catch (e) {
            return callback(e);
        }
        callback(null);
    },
    removeLocalEntry: function (path, callback) {
        try {
            var lookup = FS.lookupPath(path);
            var stat = FS.stat(path);
            if (FS.isDir(stat.mode)) {
                FS.rmdir(path);
            } else if (FS.isFile(stat.mode)) {
                FS.unlink(path);
            }
        } catch (e) {
            return callback(e);
        }
        callback(null);
    },
    loadRemoteEntry: function (store, path, callback) {
        var req = store.get(path);
        req.onsuccess = function (event) {
            callback(null, event.target.result);
        };
        req.onerror = function (e) {
            callback(this.error);
            e.preventDefault();
        };
    },
    storeRemoteEntry: function (store, path, entry, callback) {
        var req = store.put(entry, path);
        req.onsuccess = function () {
            callback(null);
        };
        req.onerror = function (e) {
            callback(this.error);
            e.preventDefault();
        };
    },
    removeRemoteEntry: function (store, path, callback) {
        var req = store.delete(path);
        req.onsuccess = function () {
            callback(null);
        };
        req.onerror = function (e) {
            callback(this.error);
            e.preventDefault();
        };
    },
    reconcile: function (src, dst, callback) {
        var total = 0;
        var create = [];
        Object.keys(src.entries).forEach(function (key) {
            var e = src.entries[key];
            var e2 = dst.entries[key];
            if (!e2 || e.timestamp > e2.timestamp) {
                create.push(key);
                total++;
            }
        });
        var remove = [];
        Object.keys(dst.entries).forEach(function (key) {
            var e = dst.entries[key];
            var e2 = src.entries[key];
            if (!e2) {
                remove.push(key);
                total++;
            }
        });
        if (!total) {
            return callback(null);
        }
        var errored = false;
        var db = src.type === "remote" ? src.db : dst.db;
        var transaction = db.transaction([IDBFS.DB_STORE_NAME], "readwrite");
        var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
        function done(err) {
            if (err && !errored) {
                errored = true;
                return callback(err);
            }
        }
        transaction.onerror = function (e) {
            done(this.error);
            e.preventDefault();
        };
        transaction.oncomplete = function (e) {
            if (!errored) {
                callback(null);
            }
        };
        create.sort().forEach(function (path) {
            if (dst.type === "local") {
                IDBFS.loadRemoteEntry(store, path, function (err, entry) {
                    if (err) return done(err);
                    IDBFS.storeLocalEntry(path, entry, done);
                });
            } else {
                IDBFS.loadLocalEntry(path, function (err, entry) {
                    if (err) return done(err);
                    IDBFS.storeRemoteEntry(store, path, entry, done);
                });
            }
        });
        remove
            .sort()
            .reverse()
            .forEach(function (path) {
                if (dst.type === "local") {
                    IDBFS.removeLocalEntry(path, done);
                } else {
                    IDBFS.removeRemoteEntry(store, path, done);
                }
            });
    },
};
var WORKERFS = {
    DIR_MODE: 16895,
    FILE_MODE: 33279,
    reader: null,
    mount: function (mount) {
        assert(ENVIRONMENT_IS_WORKER);
        if (!WORKERFS.reader) WORKERFS.reader = new FileReaderSync();
        var root = WORKERFS.createNode(null, "/", WORKERFS.DIR_MODE, 0);
        var createdParents = {};
        function ensureParent(path) {
            var parts = path.split("/");
            var parent = root;
            for (var i = 0; i < parts.length - 1; i++) {
                var curr = parts.slice(0, i + 1).join("/");
                if (!createdParents[curr]) {
                    createdParents[curr] = WORKERFS.createNode(parent, parts[i], WORKERFS.DIR_MODE, 0);
                }
                parent = createdParents[curr];
            }
            return parent;
        }
        function base(path) {
            var parts = path.split("/");
            return parts[parts.length - 1];
        }
        Array.prototype.forEach.call(mount.opts["files"] || [], function (file) {
            WORKERFS.createNode(ensureParent(file.name), base(file.name), WORKERFS.FILE_MODE, 0, file, file.lastModifiedDate);
        });
        (mount.opts["blobs"] || []).forEach(function (obj) {
            WORKERFS.createNode(ensureParent(obj["name"]), base(obj["name"]), WORKERFS.FILE_MODE, 0, obj["data"]);
        });
        (mount.opts["packages"] || []).forEach(function (pack) {
            pack["metadata"].files.forEach(function (file) {
                var name = file.filename.substr(1);
                WORKERFS.createNode(ensureParent(name), base(name), WORKERFS.FILE_MODE, 0, pack["blob"].slice(file.start, file.end));
            });
        });
        return root;
    },
    createNode: function (parent, name, mode, dev, contents, mtime) {
        var node = FS.createNode(parent, name, mode);
        node.mode = mode;
        node.node_ops = WORKERFS.node_ops;
        node.stream_ops = WORKERFS.stream_ops;
        node.timestamp = (mtime || new Date()).getTime();
        assert(WORKERFS.FILE_MODE !== WORKERFS.DIR_MODE);
        if (mode === WORKERFS.FILE_MODE) {
            node.size = contents.size;
            node.contents = contents;
        } else {
            node.size = 4096;
            node.contents = {};
        }
        if (parent) {
            parent.contents[name] = node;
        }
        return node;
    },
    node_ops: {
        getattr: function (node) {
            return {
                dev: 1,
                ino: undefined,
                mode: node.mode,
                nlink: 1,
                uid: 0,
                gid: 0,
                rdev: undefined,
                size: node.size,
                atime: new Date(node.timestamp),
                mtime: new Date(node.timestamp),
                ctime: new Date(node.timestamp),
                blksize: 4096,
                blocks: Math.ceil(node.size / 4096),
            };
        },
        setattr: function (node, attr) {
            if (attr.mode !== undefined) {
                node.mode = attr.mode;
            }
            if (attr.timestamp !== undefined) {
                node.timestamp = attr.timestamp;
            }
        },
        lookup: function (parent, name) {
            throw new FS.ErrnoError(2);
        },
        mknod: function (parent, name, mode, dev) {
            throw new FS.ErrnoError(1);
        },
        rename: function (oldNode, newDir, newName) {
            throw new FS.ErrnoError(1);
        },
        unlink: function (parent, name) {
            throw new FS.ErrnoError(1);
        },
        rmdir: function (parent, name) {
            throw new FS.ErrnoError(1);
        },
        readdir: function (node) {
            var entries = [".", ".."];
            for (var key in node.contents) {
                if (!node.contents.hasOwnProperty(key)) {
                    continue;
                }
                entries.push(key);
            }
            return entries;
        },
        symlink: function (parent, newName, oldPath) {
            throw new FS.ErrnoError(1);
        },
        readlink: function (node) {
            throw new FS.ErrnoError(1);
        },
    },
    stream_ops: {
        read: function (stream, buffer, offset, length, position) {
            if (position >= stream.node.size) return 0;
            var chunk = stream.node.contents.slice(position, position + length);
            var ab = WORKERFS.reader.readAsArrayBuffer(chunk);
            buffer.set(new Uint8Array(ab), offset);
            return chunk.size;
        },
        write: function (stream, buffer, offset, length, position) {
            throw new FS.ErrnoError(5);
        },
        llseek: function (stream, offset, whence) {
            var position = offset;
            if (whence === 1) {
                position += stream.position;
            } else if (whence === 2) {
                if (FS.isFile(stream.node.mode)) {
                    position += stream.node.size;
                }
            }
            if (position < 0) {
                throw new FS.ErrnoError(22);
            }
            return position;
        },
    },
};
var ERRNO_CODES = {
    EPERM: 1,
    ENOENT: 2,
    ESRCH: 3,
    EINTR: 4,
    EIO: 5,
    ENXIO: 6,
    E2BIG: 7,
    ENOEXEC: 8,
    EBADF: 9,
    ECHILD: 10,
    EAGAIN: 11,
    EWOULDBLOCK: 11,
    ENOMEM: 12,
    EACCES: 13,
    EFAULT: 14,
    ENOTBLK: 15,
    EBUSY: 16,
    EEXIST: 17,
    EXDEV: 18,
    ENODEV: 19,
    ENOTDIR: 20,
    EISDIR: 21,
    EINVAL: 22,
    ENFILE: 23,
    EMFILE: 24,
    ENOTTY: 25,
    ETXTBSY: 26,
    EFBIG: 27,
    ENOSPC: 28,
    ESPIPE: 29,
    EROFS: 30,
    EMLINK: 31,
    EPIPE: 32,
    EDOM: 33,
    ERANGE: 34,
    ENOMSG: 42,
    EIDRM: 43,
    ECHRNG: 44,
    EL2NSYNC: 45,
    EL3HLT: 46,
    EL3RST: 47,
    ELNRNG: 48,
    EUNATCH: 49,
    ENOCSI: 50,
    EL2HLT: 51,
    EDEADLK: 35,
    ENOLCK: 37,
    EBADE: 52,
    EBADR: 53,
    EXFULL: 54,
    ENOANO: 55,
    EBADRQC: 56,
    EBADSLT: 57,
    EDEADLOCK: 35,
    EBFONT: 59,
    ENOSTR: 60,
    ENODATA: 61,
    ETIME: 62,
    ENOSR: 63,
    ENONET: 64,
    ENOPKG: 65,
    EREMOTE: 66,
    ENOLINK: 67,
    EADV: 68,
    ESRMNT: 69,
    ECOMM: 70,
    EPROTO: 71,
    EMULTIHOP: 72,
    EDOTDOT: 73,
    EBADMSG: 74,
    ENOTUNIQ: 76,
    EBADFD: 77,
    EREMCHG: 78,
    ELIBACC: 79,
    ELIBBAD: 80,
    ELIBSCN: 81,
    ELIBMAX: 82,
    ELIBEXEC: 83,
    ENOSYS: 38,
    ENOTEMPTY: 39,
    ENAMETOOLONG: 36,
    ELOOP: 40,
    EOPNOTSUPP: 95,
    EPFNOSUPPORT: 96,
    ECONNRESET: 104,
    ENOBUFS: 105,
    EAFNOSUPPORT: 97,
    EPROTOTYPE: 91,
    ENOTSOCK: 88,
    ENOPROTOOPT: 92,
    ESHUTDOWN: 108,
    ECONNREFUSED: 111,
    EADDRINUSE: 98,
    ECONNABORTED: 103,
    ENETUNREACH: 101,
    ENETDOWN: 100,
    ETIMEDOUT: 110,
    EHOSTDOWN: 112,
    EHOSTUNREACH: 113,
    EINPROGRESS: 115,
    EALREADY: 114,
    EDESTADDRREQ: 89,
    EMSGSIZE: 90,
    EPROTONOSUPPORT: 93,
    ESOCKTNOSUPPORT: 94,
    EADDRNOTAVAIL: 99,
    ENETRESET: 102,
    EISCONN: 106,
    ENOTCONN: 107,
    ETOOMANYREFS: 109,
    EUSERS: 87,
    EDQUOT: 122,
    ESTALE: 116,
    ENOTSUP: 95,
    ENOMEDIUM: 123,
    EILSEQ: 84,
    EOVERFLOW: 75,
    ECANCELED: 125,
    ENOTRECOVERABLE: 131,
    EOWNERDEAD: 130,
    ESTRPIPE: 86,
};
var LZ4 = {
    DIR_MODE: 16895,
    FILE_MODE: 33279,
    CHUNK_SIZE: -1,
    codec: null,
    init: function () {
        if (LZ4.codec) return;
        LZ4.codec = (function () {
            var MiniLZ4 = (function () {
                var exports = {};
                exports.uncompress = function (input, output, sIdx, eIdx) {
                    sIdx = sIdx || 0;
                    eIdx = eIdx || input.length - sIdx;
                    for (var i = sIdx, n = eIdx, j = 0; i < n; ) {
                        var token = input[i++];
                        var literals_length = token >> 4;
                        if (literals_length > 0) {
                            var l = literals_length + 240;
                            while (l === 255) {
                                l = input[i++];
                                literals_length += l;
                            }
                            var end = i + literals_length;
                            while (i < end) output[j++] = input[i++];
                            if (i === n) return j;
                        }
                        var offset = input[i++] | (input[i++] << 8);
                        if (offset === 0) return j;
                        if (offset > j) return -(i - 2);
                        var match_length = token & 15;
                        var l = match_length + 240;
                        while (l === 255) {
                            l = input[i++];
                            match_length += l;
                        }
                        var pos = j - offset;
                        var end = j + match_length + 4;
                        while (j < end) output[j++] = output[pos++];
                    }
                    return j;
                };
                var maxInputSize = 2113929216,
                    minMatch = 4,
                    hashLog = 16,
                    hashShift = minMatch * 8 - hashLog,
                    hashSize = 1 << hashLog,
                    copyLength = 8,
                    mfLimit = copyLength + minMatch,
                    skipStrength = 6,
                    mlBits = 4,
                    mlMask = (1 << mlBits) - 1,
                    runBits = 8 - mlBits,
                    runMask = (1 << runBits) - 1,
                    hasher = 2654435761;
                assert(hashShift === 16);
                var hashTable = new Int16Array(1 << 16);
                var empty = new Int16Array(hashTable.length);
                exports.compressBound = function (isize) {
                    return isize > maxInputSize ? 0 : (isize + isize / 255 + 16) | 0;
                };
                exports.compress = function (src, dst, sIdx, eIdx) {
                    hashTable.set(empty);
                    return compressBlock(src, dst, 0, sIdx || 0, eIdx || dst.length);
                };
                function compressBlock(src, dst, pos, sIdx, eIdx) {
                    var dpos = sIdx;
                    var dlen = eIdx - sIdx;
                    var anchor = 0;
                    if (src.length >= maxInputSize) throw new Error("input too large");
                    if (src.length > mfLimit) {
                        var n = exports.compressBound(src.length);
                        if (dlen < n) throw Error("output too small: " + dlen + " < " + n);
                        var step = 1,
                            findMatchAttempts = (1 << skipStrength) + 3,
                            srcLength = src.length - mfLimit;
                        while (pos + minMatch < srcLength) {
                            var sequenceLowBits = (src[pos + 1] << 8) | src[pos];
                            var sequenceHighBits = (src[pos + 3] << 8) | src[pos + 2];
                            var hash = Math.imul(sequenceLowBits | (sequenceHighBits << 16), hasher) >>> hashShift;
                            var ref = hashTable[hash] - 1;
                            hashTable[hash] = pos + 1;
                            if (ref < 0 || (pos - ref) >>> 16 > 0 || ((src[ref + 3] << 8) | src[ref + 2]) != sequenceHighBits || ((src[ref + 1] << 8) | src[ref]) != sequenceLowBits) {
                                step = findMatchAttempts++ >> skipStrength;
                                pos += step;
                                continue;
                            }
                            findMatchAttempts = (1 << skipStrength) + 3;
                            var literals_length = pos - anchor;
                            var offset = pos - ref;
                            pos += minMatch;
                            ref += minMatch;
                            var match_length = pos;
                            while (pos < srcLength && src[pos] == src[ref]) {
                                pos++;
                                ref++;
                            }
                            match_length = pos - match_length;
                            var token = match_length < mlMask ? match_length : mlMask;
                            if (literals_length >= runMask) {
                                dst[dpos++] = (runMask << mlBits) + token;
                                for (var len = literals_length - runMask; len > 254; len -= 255) {
                                    dst[dpos++] = 255;
                                }
                                dst[dpos++] = len;
                            } else {
                                dst[dpos++] = (literals_length << mlBits) + token;
                            }
                            for (var i = 0; i < literals_length; i++) {
                                dst[dpos++] = src[anchor + i];
                            }
                            dst[dpos++] = offset;
                            dst[dpos++] = offset >> 8;
                            if (match_length >= mlMask) {
                                match_length -= mlMask;
                                while (match_length >= 255) {
                                    match_length -= 255;
                                    dst[dpos++] = 255;
                                }
                                dst[dpos++] = match_length;
                            }
                            anchor = pos;
                        }
                    }
                    if (anchor == 0) return 0;
                    literals_length = src.length - anchor;
                    if (literals_length >= runMask) {
                        dst[dpos++] = runMask << mlBits;
                        for (var ln = literals_length - runMask; ln > 254; ln -= 255) {
                            dst[dpos++] = 255;
                        }
                        dst[dpos++] = ln;
                    } else {
                        dst[dpos++] = literals_length << mlBits;
                    }
                    pos = anchor;
                    while (pos < src.length) {
                        dst[dpos++] = src[pos++];
                    }
                    return dpos;
                }
                exports.CHUNK_SIZE = 2048;
                exports.compressPackage = function (data, verify) {
                    if (verify) {
                        var temp = new Uint8Array(exports.CHUNK_SIZE);
                    }
                    assert(data instanceof ArrayBuffer);
                    data = new Uint8Array(data);
                    console.log("compressing package of size " + data.length);
                    var compressedChunks = [];
                    var successes = [];
                    var offset = 0;
                    var total = 0;
                    while (offset < data.length) {
                        var chunk = data.subarray(offset, offset + exports.CHUNK_SIZE);
                        offset += exports.CHUNK_SIZE;
                        var bound = exports.compressBound(chunk.length);
                        var compressed = new Uint8Array(bound);
                        var compressedSize = exports.compress(chunk, compressed);
                        if (compressedSize > 0) {
                            assert(compressedSize <= bound);
                            compressed = compressed.subarray(0, compressedSize);
                            compressedChunks.push(compressed);
                            total += compressedSize;
                            successes.push(1);
                            if (verify) {
                                var back = exports.uncompress(compressed, temp);
                                assert(back === chunk.length, [back, chunk.length]);
                                for (var i = 0; i < chunk.length; i++) {
                                    assert(chunk[i] === temp[i]);
                                }
                            }
                        } else {
                            assert(compressedSize === 0);
                            compressedChunks.push(chunk);
                            total += chunk.length;
                            successes.push(0);
                        }
                    }
                    data = null;
                    var compressedData = { data: new Uint8Array(total + exports.CHUNK_SIZE * 2), cachedOffset: total, cachedIndexes: [-1, -1], cachedChunks: [null, null], offsets: [], sizes: [], successes: successes };
                    offset = 0;
                    for (var i = 0; i < compressedChunks.length; i++) {
                        compressedData.data.set(compressedChunks[i], offset);
                        compressedData.offsets[i] = offset;
                        compressedData.sizes[i] = compressedChunks[i].length;
                        offset += compressedChunks[i].length;
                    }
                    console.log("compressed package into " + [compressedData.data.length]);
                    assert(offset === total);
                    return compressedData;
                };
                assert(exports.CHUNK_SIZE < 1 << 15);
                return exports;
            })();
            return MiniLZ4;
        })();
        LZ4.CHUNK_SIZE = LZ4.codec.CHUNK_SIZE;
    },
    loadPackage: function (pack) {
        LZ4.init();
        var compressedData = pack["compressedData"];
        if (!compressedData) compressedData = LZ4.codec.compressPackage(pack["data"]);
        assert(compressedData.cachedIndexes.length === compressedData.cachedChunks.length);
        for (var i = 0; i < compressedData.cachedIndexes.length; i++) {
            compressedData.cachedIndexes[i] = -1;
            compressedData.cachedChunks[i] = compressedData.data.subarray(compressedData.cachedOffset + i * LZ4.CHUNK_SIZE, compressedData.cachedOffset + (i + 1) * LZ4.CHUNK_SIZE);
            assert(compressedData.cachedChunks[i].length === LZ4.CHUNK_SIZE);
        }
        pack["metadata"].files.forEach(function (file) {
            var dir = PATH.dirname(file.filename);
            var name = PATH.basename(file.filename);
            FS.createPath("", dir, true, true);
            var parent = FS.analyzePath(dir).object;
            LZ4.createNode(parent, name, LZ4.FILE_MODE, 0, { compressedData: compressedData, start: file.start, end: file.end });
        });
    },
    createNode: function (parent, name, mode, dev, contents, mtime) {
        var node = FS.createNode(parent, name, mode);
        node.mode = mode;
        node.node_ops = LZ4.node_ops;
        node.stream_ops = LZ4.stream_ops;
        node.timestamp = (mtime || new Date()).getTime();
        assert(LZ4.FILE_MODE !== LZ4.DIR_MODE);
        if (mode === LZ4.FILE_MODE) {
            node.size = contents.end - contents.start;
            node.contents = contents;
        } else {
            node.size = 4096;
            node.contents = {};
        }
        if (parent) {
            parent.contents[name] = node;
        }
        return node;
    },
    node_ops: {
        getattr: function (node) {
            return {
                dev: 1,
                ino: undefined,
                mode: node.mode,
                nlink: 1,
                uid: 0,
                gid: 0,
                rdev: undefined,
                size: node.size,
                atime: new Date(node.timestamp),
                mtime: new Date(node.timestamp),
                ctime: new Date(node.timestamp),
                blksize: 4096,
                blocks: Math.ceil(node.size / 4096),
            };
        },
        setattr: function (node, attr) {
            if (attr.mode !== undefined) {
                node.mode = attr.mode;
            }
            if (attr.timestamp !== undefined) {
                node.timestamp = attr.timestamp;
            }
        },
        lookup: function (parent, name) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        },
        mknod: function (parent, name, mode, dev) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },
        rename: function (oldNode, newDir, newName) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },
        unlink: function (parent, name) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },
        rmdir: function (parent, name) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },
        readdir: function (node) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },
        symlink: function (parent, newName, oldPath) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },
        readlink: function (node) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },
    },
    stream_ops: {
        read: function (stream, buffer, offset, length, position) {
            length = Math.min(length, stream.node.size - position);
            if (length <= 0) return 0;
            var contents = stream.node.contents;
            var compressedData = contents.compressedData;
            var written = 0;
            while (written < length) {
                var start = contents.start + position + written;
                var desired = length - written;
                var chunkIndex = Math.floor(start / LZ4.CHUNK_SIZE);
                var compressedStart = compressedData.offsets[chunkIndex];
                var compressedSize = compressedData.sizes[chunkIndex];
                var currChunk;
                if (compressedData.successes[chunkIndex]) {
                    var found = compressedData.cachedIndexes.indexOf(chunkIndex);
                    if (found >= 0) {
                        currChunk = compressedData.cachedChunks[found];
                    } else {
                        compressedData.cachedIndexes.pop();
                        compressedData.cachedIndexes.unshift(chunkIndex);
                        currChunk = compressedData.cachedChunks.pop();
                        compressedData.cachedChunks.unshift(currChunk);
                        if (compressedData.debug) {
                            console.log("decompressing chunk " + chunkIndex);
                            Module["decompressedChunks"] = (Module["decompressedChunks"] || 0) + 1;
                        }
                        var compressed = compressedData.data.subarray(compressedStart, compressedStart + compressedSize);
                        var originalSize = LZ4.codec.uncompress(compressed, currChunk);
                        if (chunkIndex < compressedData.successes.length - 1) assert(originalSize === LZ4.CHUNK_SIZE);
                    }
                } else {
                    currChunk = compressedData.data.subarray(compressedStart, compressedStart + LZ4.CHUNK_SIZE);
                }
                var startInChunk = start % LZ4.CHUNK_SIZE;
                var endInChunk = Math.min(startInChunk + desired, LZ4.CHUNK_SIZE);
                buffer.set(currChunk.subarray(startInChunk, endInChunk), offset + written);
                var currWritten = endInChunk - startInChunk;
                written += currWritten;
            }
            return written;
        },
        write: function (stream, buffer, offset, length, position) {
            throw new FS.ErrnoError(ERRNO_CODES.EIO);
        },
        llseek: function (stream, offset, whence) {
            var position = offset;
            if (whence === 1) {
                position += stream.position;
            } else if (whence === 2) {
                if (FS.isFile(stream.node.mode)) {
                    position += stream.node.size;
                }
            }
            if (position < 0) {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
            }
            return position;
        },
    },
};
var FS = {
    root: null,
    mounts: [],
    devices: {},
    streams: [],
    nextInode: 1,
    nameTable: null,
    currentPath: "/",
    initialized: false,
    ignorePermissions: true,
    trackingDelegate: {},
    tracking: { openFlags: { READ: 1, WRITE: 2 } },
    ErrnoError: null,
    genericErrors: {},
    filesystems: null,
    syncFSRequests: 0,
    handleFSError: function (e) {
        if (!(e instanceof FS.ErrnoError)) throw e + " : " + stackTrace();
        return ___setErrNo(e.errno);
    },
    lookupPath: function (path, opts) {
        path = PATH_FS.resolve(FS.cwd(), path);
        opts = opts || {};
        if (!path) return { path: "", node: null };
        var defaults = { follow_mount: true, recurse_count: 0 };
        for (var key in defaults) {
            if (opts[key] === undefined) {
                opts[key] = defaults[key];
            }
        }
        if (opts.recurse_count > 8) {
            throw new FS.ErrnoError(40);
        }
        var parts = PATH.normalizeArray(
            path.split("/").filter(function (p) {
                return !!p;
            }),
            false
        );
        var current = FS.root;
        var current_path = "/";
        for (var i = 0; i < parts.length; i++) {
            var islast = i === parts.length - 1;
            if (islast && opts.parent) {
                break;
            }
            current = FS.lookupNode(current, parts[i]);
            current_path = PATH.join2(current_path, parts[i]);
            if (FS.isMountpoint(current)) {
                if (!islast || (islast && opts.follow_mount)) {
                    current = current.mounted.root;
                }
            }
            if (!islast || opts.follow) {
                var count = 0;
                while (FS.isLink(current.mode)) {
                    var link = FS.readlink(current_path);
                    current_path = PATH_FS.resolve(PATH.dirname(current_path), link);
                    var lookup = FS.lookupPath(current_path, { recurse_count: opts.recurse_count });
                    current = lookup.node;
                    if (count++ > 40) {
                        throw new FS.ErrnoError(40);
                    }
                }
            }
        }
        return { path: current_path, node: current };
    },
    getPath: function (node) {
        var path;
        while (true) {
            if (FS.isRoot(node)) {
                var mount = node.mount.mountpoint;
                if (!path) return mount;
                return mount[mount.length - 1] !== "/" ? mount + "/" + path : mount + path;
            }
            path = path ? node.name + "/" + path : node.name;
            node = node.parent;
        }
    },
    hashName: function (parentid, name) {
        var hash = 0;
        for (var i = 0; i < name.length; i++) {
            hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        }
        return ((parentid + hash) >>> 0) % FS.nameTable.length;
    },
    hashAddNode: function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node;
    },
    hashRemoveNode: function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
            FS.nameTable[hash] = node.name_next;
        } else {
            var current = FS.nameTable[hash];
            while (current) {
                if (current.name_next === node) {
                    current.name_next = node.name_next;
                    break;
                }
                current = current.name_next;
            }
        }
    },
    lookupNode: function (parent, name) {
        var err = FS.mayLookup(parent);
        if (err) {
            throw new FS.ErrnoError(err, parent);
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
            var nodeName = node.name;
            if (node.parent.id === parent.id && nodeName === name) {
                return node;
            }
        }
        return FS.lookup(parent, name);
    },
    createNode: function (parent, name, mode, rdev) {
        if (!FS.FSNode) {
            FS.FSNode = function (parent, name, mode, rdev) {
                if (!parent) {
                    parent = this;
                }
                this.parent = parent;
                this.mount = parent.mount;
                this.mounted = null;
                this.id = FS.nextInode++;
                this.name = name;
                this.mode = mode;
                this.node_ops = {};
                this.stream_ops = {};
                this.rdev = rdev;
            };
            FS.FSNode.prototype = {};
            var readMode = 292 | 73;
            var writeMode = 146;
            Object.defineProperties(FS.FSNode.prototype, {
                read: {
                    get: function () {
                        return (this.mode & readMode) === readMode;
                    },
                    set: function (val) {
                        val ? (this.mode |= readMode) : (this.mode &= ~readMode);
                    },
                },
                write: {
                    get: function () {
                        return (this.mode & writeMode) === writeMode;
                    },
                    set: function (val) {
                        val ? (this.mode |= writeMode) : (this.mode &= ~writeMode);
                    },
                },
                isFolder: {
                    get: function () {
                        return FS.isDir(this.mode);
                    },
                },
                isDevice: {
                    get: function () {
                        return FS.isChrdev(this.mode);
                    },
                },
            });
        }
        var node = new FS.FSNode(parent, name, mode, rdev);
        FS.hashAddNode(node);
        return node;
    },
    destroyNode: function (node) {
        FS.hashRemoveNode(node);
    },
    isRoot: function (node) {
        return node === node.parent;
    },
    isMountpoint: function (node) {
        return !!node.mounted;
    },
    isFile: function (mode) {
        return (mode & 61440) === 32768;
    },
    isDir: function (mode) {
        return (mode & 61440) === 16384;
    },
    isLink: function (mode) {
        return (mode & 61440) === 40960;
    },
    isChrdev: function (mode) {
        return (mode & 61440) === 8192;
    },
    isBlkdev: function (mode) {
        return (mode & 61440) === 24576;
    },
    isFIFO: function (mode) {
        return (mode & 61440) === 4096;
    },
    isSocket: function (mode) {
        return (mode & 49152) === 49152;
    },
    flagModes: { r: 0, rs: 1052672, "r+": 2, w: 577, wx: 705, xw: 705, "w+": 578, "wx+": 706, "xw+": 706, a: 1089, ax: 1217, xa: 1217, "a+": 1090, "ax+": 1218, "xa+": 1218 },
    modeStringToFlags: function (str) {
        var flags = FS.flagModes[str];
        if (typeof flags === "undefined") {
            throw new Error("Unknown file open mode: " + str);
        }
        return flags;
    },
    flagsToPermissionString: function (flag) {
        var perms = ["r", "w", "rw"][flag & 3];
        if (flag & 512) {
            perms += "w";
        }
        return perms;
    },
    nodePermissions: function (node, perms) {
        if (FS.ignorePermissions) {
            return 0;
        }
        if (perms.indexOf("r") !== -1 && !(node.mode & 292)) {
            return 13;
        } else if (perms.indexOf("w") !== -1 && !(node.mode & 146)) {
            return 13;
        } else if (perms.indexOf("x") !== -1 && !(node.mode & 73)) {
            return 13;
        }
        return 0;
    },
    mayLookup: function (dir) {
        var err = FS.nodePermissions(dir, "x");
        if (err) return err;
        if (!dir.node_ops.lookup) return 13;
        return 0;
    },
    mayCreate: function (dir, name) {
        try {
            var node = FS.lookupNode(dir, name);
            return 17;
        } catch (e) {}
        return FS.nodePermissions(dir, "wx");
    },
    mayDelete: function (dir, name, isdir) {
        var node;
        try {
            node = FS.lookupNode(dir, name);
        } catch (e) {
            return e.errno;
        }
        var err = FS.nodePermissions(dir, "wx");
        if (err) {
            return err;
        }
        if (isdir) {
            if (!FS.isDir(node.mode)) {
                return 20;
            }
            if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
                return 16;
            }
        } else {
            if (FS.isDir(node.mode)) {
                return 21;
            }
        }
        return 0;
    },
    mayOpen: function (node, flags) {
        if (!node) {
            return 2;
        }
        if (FS.isLink(node.mode)) {
            return 40;
        } else if (FS.isDir(node.mode)) {
            if (FS.flagsToPermissionString(flags) !== "r" || flags & 512) {
                return 21;
            }
        }
        return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
    },
    MAX_OPEN_FDS: 4096,
    nextfd: function (fd_start, fd_end) {
        fd_start = fd_start || 0;
        fd_end = fd_end || FS.MAX_OPEN_FDS;
        for (var fd = fd_start; fd <= fd_end; fd++) {
            if (!FS.streams[fd]) {
                return fd;
            }
        }
        throw new FS.ErrnoError(24);
    },
    getStream: function (fd) {
        return FS.streams[fd];
    },
    createStream: function (stream, fd_start, fd_end) {
        if (!FS.FSStream) {
            FS.FSStream = function () {};
            FS.FSStream.prototype = {};
            Object.defineProperties(FS.FSStream.prototype, {
                object: {
                    get: function () {
                        return this.node;
                    },
                    set: function (val) {
                        this.node = val;
                    },
                },
                isRead: {
                    get: function () {
                        return (this.flags & 2097155) !== 1;
                    },
                },
                isWrite: {
                    get: function () {
                        return (this.flags & 2097155) !== 0;
                    },
                },
                isAppend: {
                    get: function () {
                        return this.flags & 1024;
                    },
                },
            });
        }
        var newStream = new FS.FSStream();
        for (var p in stream) {
            newStream[p] = stream[p];
        }
        stream = newStream;
        var fd = FS.nextfd(fd_start, fd_end);
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream;
    },
    closeStream: function (fd) {
        FS.streams[fd] = null;
    },
    chrdev_stream_ops: {
        open: function (stream) {
            var device = FS.getDevice(stream.node.rdev);
            stream.stream_ops = device.stream_ops;
            if (stream.stream_ops.open) {
                stream.stream_ops.open(stream);
            }
        },
        llseek: function () {
            throw new FS.ErrnoError(29);
        },
    },
    major: function (dev) {
        return dev >> 8;
    },
    minor: function (dev) {
        return dev & 255;
    },
    makedev: function (ma, mi) {
        return (ma << 8) | mi;
    },
    registerDevice: function (dev, ops) {
        FS.devices[dev] = { stream_ops: ops };
    },
    getDevice: function (dev) {
        return FS.devices[dev];
    },
    getMounts: function (mount) {
        var mounts = [];
        var check = [mount];
        while (check.length) {
            var m = check.pop();
            mounts.push(m);
            check.push.apply(check, m.mounts);
        }
        return mounts;
    },
    syncfs: function (populate, callback) {
        if (typeof populate === "function") {
            callback = populate;
            populate = false;
        }
        FS.syncFSRequests++;
        if (FS.syncFSRequests > 1) {
            console.log("warning: " + FS.syncFSRequests + " FS.syncfs operations in flight at once, probably just doing extra work");
        }
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;
        function doCallback(err) {
            FS.syncFSRequests--;
            return callback(err);
        }
        function done(err) {
            if (err) {
                if (!done.errored) {
                    done.errored = true;
                    return doCallback(err);
                }
                return;
            }
            if (++completed >= mounts.length) {
                doCallback(null);
            }
        }
        mounts.forEach(function (mount) {
            if (!mount.type.syncfs) {
                return done(null);
            }
            mount.type.syncfs(mount, populate, done);
        });
    },
    mount: function (type, opts, mountpoint) {
        var root = mountpoint === "/";
        var pseudo = !mountpoint;
        var node;
        if (root && FS.root) {
            throw new FS.ErrnoError(16);
        } else if (!root && !pseudo) {
            var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
            mountpoint = lookup.path;
            node = lookup.node;
            if (FS.isMountpoint(node)) {
                throw new FS.ErrnoError(16);
            }
            if (!FS.isDir(node.mode)) {
                throw new FS.ErrnoError(20);
            }
        }
        var mount = { type: type, opts: opts, mountpoint: mountpoint, mounts: [] };
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
        if (root) {
            FS.root = mountRoot;
        } else if (node) {
            node.mounted = mount;
            if (node.mount) {
                node.mount.mounts.push(mount);
            }
        }
        return mountRoot;
    },
    unmount: function (mountpoint) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
        if (!FS.isMountpoint(lookup.node)) {
            throw new FS.ErrnoError(22);
        }
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
        Object.keys(FS.nameTable).forEach(function (hash) {
            var current = FS.nameTable[hash];
            while (current) {
                var next = current.name_next;
                if (mounts.indexOf(current.mount) !== -1) {
                    FS.destroyNode(current);
                }
                current = next;
            }
        });
        node.mounted = null;
        var idx = node.mount.mounts.indexOf(mount);
        node.mount.mounts.splice(idx, 1);
    },
    lookup: function (parent, name) {
        return parent.node_ops.lookup(parent, name);
    },
    mknod: function (path, mode, dev) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name || name === "." || name === "..") {
            throw new FS.ErrnoError(22);
        }
        var err = FS.mayCreate(parent, name);
        if (err) {
            throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.mknod) {
            throw new FS.ErrnoError(1);
        }
        return parent.node_ops.mknod(parent, name, mode, dev);
    },
    create: function (path, mode) {
        mode = mode !== undefined ? mode : 438;
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0);
    },
    mkdir: function (path, mode) {
        mode = mode !== undefined ? mode : 511;
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0);
    },
    mkdirTree: function (path, mode) {
        var dirs = path.split("/");
        var d = "";
        for (var i = 0; i < dirs.length; ++i) {
            if (!dirs[i]) continue;
            d += "/" + dirs[i];
            try {
                FS.mkdir(d, mode);
            } catch (e) {
                if (e.errno != 17) throw e;
            }
        }
    },
    mkdev: function (path, mode, dev) {
        if (typeof dev === "undefined") {
            dev = mode;
            mode = 438;
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev);
    },
    symlink: function (oldpath, newpath) {
        if (!PATH_FS.resolve(oldpath)) {
            throw new FS.ErrnoError(2);
        }
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
            throw new FS.ErrnoError(2);
        }
        var newname = PATH.basename(newpath);
        var err = FS.mayCreate(parent, newname);
        if (err) {
            throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.symlink) {
            throw new FS.ErrnoError(1);
        }
        return parent.node_ops.symlink(parent, newname, oldpath);
    },
    rename: function (old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        var lookup, old_dir, new_dir;
        try {
            lookup = FS.lookupPath(old_path, { parent: true });
            old_dir = lookup.node;
            lookup = FS.lookupPath(new_path, { parent: true });
            new_dir = lookup.node;
        } catch (e) {
            throw new FS.ErrnoError(16);
        }
        if (!old_dir || !new_dir) throw new FS.ErrnoError(2);
        if (old_dir.mount !== new_dir.mount) {
            throw new FS.ErrnoError(18);
        }
        var old_node = FS.lookupNode(old_dir, old_name);
        var relative = PATH_FS.relative(old_path, new_dirname);
        if (relative.charAt(0) !== ".") {
            throw new FS.ErrnoError(22);
        }
        relative = PATH_FS.relative(new_path, old_dirname);
        if (relative.charAt(0) !== ".") {
            throw new FS.ErrnoError(39);
        }
        var new_node;
        try {
            new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {}
        if (old_node === new_node) {
            return;
        }
        var isdir = FS.isDir(old_node.mode);
        var err = FS.mayDelete(old_dir, old_name, isdir);
        if (err) {
            throw new FS.ErrnoError(err);
        }
        err = new_node ? FS.mayDelete(new_dir, new_name, isdir) : FS.mayCreate(new_dir, new_name);
        if (err) {
            throw new FS.ErrnoError(err);
        }
        if (!old_dir.node_ops.rename) {
            throw new FS.ErrnoError(1);
        }
        if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
            throw new FS.ErrnoError(16);
        }
        if (new_dir !== old_dir) {
            err = FS.nodePermissions(old_dir, "w");
            if (err) {
                throw new FS.ErrnoError(err);
            }
        }
        try {
            if (FS.trackingDelegate["willMovePath"]) {
                FS.trackingDelegate["willMovePath"](old_path, new_path);
            }
        } catch (e) {
            console.log("FS.trackingDelegate['willMovePath']('" + old_path + "', '" + new_path + "') threw an exception: " + e.message);
        }
        FS.hashRemoveNode(old_node);
        try {
            old_dir.node_ops.rename(old_node, new_dir, new_name);
        } catch (e) {
            throw e;
        } finally {
            FS.hashAddNode(old_node);
        }
        try {
            if (FS.trackingDelegate["onMovePath"]) FS.trackingDelegate["onMovePath"](old_path, new_path);
        } catch (e) {
            console.log("FS.trackingDelegate['onMovePath']('" + old_path + "', '" + new_path + "') threw an exception: " + e.message);
        }
    },
    rmdir: function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, true);
        if (err) {
            throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.rmdir) {
            throw new FS.ErrnoError(1);
        }
        if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(16);
        }
        try {
            if (FS.trackingDelegate["willDeletePath"]) {
                FS.trackingDelegate["willDeletePath"](path);
            }
        } catch (e) {
            console.log("FS.trackingDelegate['willDeletePath']('" + path + "') threw an exception: " + e.message);
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
        try {
            if (FS.trackingDelegate["onDeletePath"]) FS.trackingDelegate["onDeletePath"](path);
        } catch (e) {
            console.log("FS.trackingDelegate['onDeletePath']('" + path + "') threw an exception: " + e.message);
        }
    },
    readdir: function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        if (!node.node_ops.readdir) {
            throw new FS.ErrnoError(20);
        }
        return node.node_ops.readdir(node);
    },
    unlink: function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, false);
        if (err) {
            throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.unlink) {
            throw new FS.ErrnoError(1);
        }
        if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(16);
        }
        try {
            if (FS.trackingDelegate["willDeletePath"]) {
                FS.trackingDelegate["willDeletePath"](path);
            }
        } catch (e) {
            console.log("FS.trackingDelegate['willDeletePath']('" + path + "') threw an exception: " + e.message);
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
        try {
            if (FS.trackingDelegate["onDeletePath"]) FS.trackingDelegate["onDeletePath"](path);
        } catch (e) {
            console.log("FS.trackingDelegate['onDeletePath']('" + path + "') threw an exception: " + e.message);
        }
    },
    readlink: function (path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
            throw new FS.ErrnoError(2);
        }
        if (!link.node_ops.readlink) {
            throw new FS.ErrnoError(22);
        }
        return PATH_FS.resolve(FS.getPath(link.parent), link.node_ops.readlink(link));
    },
    stat: function (path, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        var node = lookup.node;
        if (!node) {
            throw new FS.ErrnoError(2);
        }
        if (!node.node_ops.getattr) {
            throw new FS.ErrnoError(1);
        }
        return node.node_ops.getattr(node);
    },
    lstat: function (path) {
        return FS.stat(path, true);
    },
    chmod: function (path, mode, dontFollow) {
        var node;
        if (typeof path === "string") {
            var lookup = FS.lookupPath(path, { follow: !dontFollow });
            node = lookup.node;
        } else {
            node = path;
        }
        if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(1);
        }
        node.node_ops.setattr(node, { mode: (mode & 4095) | (node.mode & ~4095), timestamp: Date.now() });
    },
    lchmod: function (path, mode) {
        FS.chmod(path, mode, true);
    },
    fchmod: function (fd, mode) {
        var stream = FS.getStream(fd);
        if (!stream) {
            throw new FS.ErrnoError(9);
        }
        FS.chmod(stream.node, mode);
    },
    chown: function (path, uid, gid, dontFollow) {
        var node;
        if (typeof path === "string") {
            var lookup = FS.lookupPath(path, { follow: !dontFollow });
            node = lookup.node;
        } else {
            node = path;
        }
        if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(1);
        }
        node.node_ops.setattr(node, { timestamp: Date.now() });
    },
    lchown: function (path, uid, gid) {
        FS.chown(path, uid, gid, true);
    },
    fchown: function (fd, uid, gid) {
        var stream = FS.getStream(fd);
        if (!stream) {
            throw new FS.ErrnoError(9);
        }
        FS.chown(stream.node, uid, gid);
    },
    truncate: function (path, len) {
        if (len < 0) {
            throw new FS.ErrnoError(22);
        }
        var node;
        if (typeof path === "string") {
            var lookup = FS.lookupPath(path, { follow: true });
            node = lookup.node;
        } else {
            node = path;
        }
        if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(1);
        }
        if (FS.isDir(node.mode)) {
            throw new FS.ErrnoError(21);
        }
        if (!FS.isFile(node.mode)) {
            throw new FS.ErrnoError(22);
        }
        var err = FS.nodePermissions(node, "w");
        if (err) {
            throw new FS.ErrnoError(err);
        }
        node.node_ops.setattr(node, { size: len, timestamp: Date.now() });
    },
    ftruncate: function (fd, len) {
        var stream = FS.getStream(fd);
        if (!stream) {
            throw new FS.ErrnoError(9);
        }
        if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(22);
        }
        FS.truncate(stream.node, len);
    },
    utime: function (path, atime, mtime) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        node.node_ops.setattr(node, { timestamp: Math.max(atime, mtime) });
    },
    open: function (path, flags, mode, fd_start, fd_end) {
        if (path === "") {
            throw new FS.ErrnoError(2);
        }
        flags = typeof flags === "string" ? FS.modeStringToFlags(flags) : flags;
        mode = typeof mode === "undefined" ? 438 : mode;
        if (flags & 64) {
            mode = (mode & 4095) | 32768;
        } else {
            mode = 0;
        }
        var node;
        if (typeof path === "object") {
            node = path;
        } else {
            path = PATH.normalize(path);
            try {
                var lookup = FS.lookupPath(path, { follow: !(flags & 131072) });
                node = lookup.node;
            } catch (e) {}
        }
        var created = false;
        if (flags & 64) {
            if (node) {
                if (flags & 128) {
                    throw new FS.ErrnoError(17);
                }
            } else {
                node = FS.mknod(path, mode, 0);
                created = true;
            }
        }
        if (!node) {
            throw new FS.ErrnoError(2);
        }
        if (FS.isChrdev(node.mode)) {
            flags &= ~512;
        }
        if (flags & 65536 && !FS.isDir(node.mode)) {
            throw new FS.ErrnoError(20);
        }
        if (!created) {
            var err = FS.mayOpen(node, flags);
            if (err) {
                throw new FS.ErrnoError(err);
            }
        }
        if (flags & 512) {
            FS.truncate(node, 0);
        }
        flags &= ~(128 | 512);
        var stream = FS.createStream({ node: node, path: FS.getPath(node), flags: flags, seekable: true, position: 0, stream_ops: node.stream_ops, ungotten: [], error: false }, fd_start, fd_end);
        if (stream.stream_ops.open) {
            stream.stream_ops.open(stream);
        }
        if (Module["logReadFiles"] && !(flags & 1)) {
            if (!FS.readFiles) FS.readFiles = {};
            if (!(path in FS.readFiles)) {
                FS.readFiles[path] = 1;
                console.log("FS.trackingDelegate error on read file: " + path);
            }
        }
        try {
            if (FS.trackingDelegate["onOpenFile"]) {
                var trackingFlags = 0;
                if ((flags & 2097155) !== 1) {
                    trackingFlags |= FS.tracking.openFlags.READ;
                }
                if ((flags & 2097155) !== 0) {
                    trackingFlags |= FS.tracking.openFlags.WRITE;
                }
                FS.trackingDelegate["onOpenFile"](path, trackingFlags);
            }
        } catch (e) {
            console.log("FS.trackingDelegate['onOpenFile']('" + path + "', flags) threw an exception: " + e.message);
        }
        return stream;
    },
    close: function (stream) {
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(9);
        }
        if (stream.getdents) stream.getdents = null;
        try {
            if (stream.stream_ops.close) {
                stream.stream_ops.close(stream);
            }
        } catch (e) {
            throw e;
        } finally {
            FS.closeStream(stream.fd);
        }
        stream.fd = null;
    },
    isClosed: function (stream) {
        return stream.fd === null;
    },
    llseek: function (stream, offset, whence) {
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(9);
        }
        if (!stream.seekable || !stream.stream_ops.llseek) {
            throw new FS.ErrnoError(29);
        }
        if (whence != 0 && whence != 1 && whence != 2) {
            throw new FS.ErrnoError(22);
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position;
    },
    read: function (stream, buffer, offset, length, position) {
        if (length < 0 || position < 0) {
            throw new FS.ErrnoError(22);
        }
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(9);
        }
        if ((stream.flags & 2097155) === 1) {
            throw new FS.ErrnoError(9);
        }
        if (FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(21);
        }
        if (!stream.stream_ops.read) {
            throw new FS.ErrnoError(22);
        }
        var seeking = typeof position !== "undefined";
        if (!seeking) {
            position = stream.position;
        } else if (!stream.seekable) {
            throw new FS.ErrnoError(29);
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead;
    },
    write: function (stream, buffer, offset, length, position, canOwn) {
        if (length < 0 || position < 0) {
            throw new FS.ErrnoError(22);
        }
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(9);
        }
        if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(9);
        }
        if (FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(21);
        }
        if (!stream.stream_ops.write) {
            throw new FS.ErrnoError(22);
        }
        if (stream.flags & 1024) {
            FS.llseek(stream, 0, 2);
        }
        var seeking = typeof position !== "undefined";
        if (!seeking) {
            position = stream.position;
        } else if (!stream.seekable) {
            throw new FS.ErrnoError(29);
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking) stream.position += bytesWritten;
        try {
            if (stream.path && FS.trackingDelegate["onWriteToFile"]) FS.trackingDelegate["onWriteToFile"](stream.path);
        } catch (e) {
            console.log("FS.trackingDelegate['onWriteToFile']('" + stream.path + "') threw an exception: " + e.message);
        }
        return bytesWritten;
    },
    allocate: function (stream, offset, length) {
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(9);
        }
        if (offset < 0 || length <= 0) {
            throw new FS.ErrnoError(22);
        }
        if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(9);
        }
        if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(19);
        }
        if (!stream.stream_ops.allocate) {
            throw new FS.ErrnoError(95);
        }
        stream.stream_ops.allocate(stream, offset, length);
    },
    mmap: function (stream, buffer, offset, length, position, prot, flags) {
        if ((prot & 2) !== 0 && (flags & 2) === 0 && (stream.flags & 2097155) !== 2) {
            throw new FS.ErrnoError(13);
        }
        if ((stream.flags & 2097155) === 1) {
            throw new FS.ErrnoError(13);
        }
        if (!stream.stream_ops.mmap) {
            throw new FS.ErrnoError(19);
        }
        return stream.stream_ops.mmap(stream, buffer, offset, length, position, prot, flags);
    },
    msync: function (stream, buffer, offset, length, mmapFlags) {
        if (!stream || !stream.stream_ops.msync) {
            return 0;
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
    },
    munmap: function (stream) {
        return 0;
    },
    ioctl: function (stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
            throw new FS.ErrnoError(25);
        }
        return stream.stream_ops.ioctl(stream, cmd, arg);
    },
    readFile: function (path, opts) {
        opts = opts || {};
        opts.flags = opts.flags || "r";
        opts.encoding = opts.encoding || "binary";
        if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
            throw new Error('Invalid encoding type "' + opts.encoding + '"');
        }
        var ret;
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === "utf8") {
            ret = UTF8ArrayToString(buf, 0);
        } else if (opts.encoding === "binary") {
            ret = buf;
        }
        FS.close(stream);
        return ret;
    },
    writeFile: function (path, data, opts) {
        opts = opts || {};
        opts.flags = opts.flags || "w";
        var stream = FS.open(path, opts.flags, opts.mode);
        if (typeof data === "string") {
            var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
            var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
            FS.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn);
        } else if (ArrayBuffer.isView(data)) {
            FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
        } else {
            throw new Error("Unsupported data type");
        }
        FS.close(stream);
    },
    cwd: function () {
        return FS.currentPath;
    },
    chdir: function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        if (lookup.node === null) {
            throw new FS.ErrnoError(2);
        }
        if (!FS.isDir(lookup.node.mode)) {
            throw new FS.ErrnoError(20);
        }
        var err = FS.nodePermissions(lookup.node, "x");
        if (err) {
            throw new FS.ErrnoError(err);
        }
        FS.currentPath = lookup.path;
    },
    createDefaultDirectories: function () {
        FS.mkdir("/tmp");
        FS.mkdir("/home");
        FS.mkdir("/home/web_user");
    },
    createDefaultDevices: function () {
        FS.mkdir("/dev");
        FS.registerDevice(FS.makedev(1, 3), {
            read: function () {
                return 0;
            },
            write: function (stream, buffer, offset, length, pos) {
                return length;
            },
        });
        FS.mkdev("/dev/null", FS.makedev(1, 3));
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev("/dev/tty", FS.makedev(5, 0));
        FS.mkdev("/dev/tty1", FS.makedev(6, 0));
        var random_device;
        if (typeof crypto === "object" && typeof crypto["getRandomValues"] === "function") {
            var randomBuffer = new Uint8Array(1);
            random_device = function () {
                crypto.getRandomValues(randomBuffer);
                return randomBuffer[0];
            };
        } else {
        }
        if (!random_device) {
            random_device = function () {
                abort("random_device");
            };
        }
        FS.createDevice("/dev", "random", random_device);
        FS.createDevice("/dev", "urandom", random_device);
        FS.mkdir("/dev/shm");
        FS.mkdir("/dev/shm/tmp");
    },
    createSpecialDirectories: function () {
        FS.mkdir("/proc");
        FS.mkdir("/proc/self");
        FS.mkdir("/proc/self/fd");
        FS.mount(
            {
                mount: function () {
                    var node = FS.createNode("/proc/self", "fd", 16384 | 511, 73);
                    node.node_ops = {
                        lookup: function (parent, name) {
                            var fd = +name;
                            var stream = FS.getStream(fd);
                            if (!stream) throw new FS.ErrnoError(9);
                            var ret = {
                                parent: null,
                                mount: { mountpoint: "fake" },
                                node_ops: {
                                    readlink: function () {
                                        return stream.path;
                                    },
                                },
                            };
                            ret.parent = ret;
                            return ret;
                        },
                    };
                    return node;
                },
            },
            {},
            "/proc/self/fd"
        );
    },
    createStandardStreams: function () {
        if (Module["stdin"]) {
            FS.createDevice("/dev", "stdin", Module["stdin"]);
        } else {
            FS.symlink("/dev/tty", "/dev/stdin");
        }
        if (Module["stdout"]) {
            FS.createDevice("/dev", "stdout", null, Module["stdout"]);
        } else {
            FS.symlink("/dev/tty", "/dev/stdout");
        }
        if (Module["stderr"]) {
            FS.createDevice("/dev", "stderr", null, Module["stderr"]);
        } else {
            FS.symlink("/dev/tty1", "/dev/stderr");
        }
        var stdin = FS.open("/dev/stdin", "r");
        var stdout = FS.open("/dev/stdout", "w");
        var stderr = FS.open("/dev/stderr", "w");
    },
    ensureErrnoError: function () {
        if (FS.ErrnoError) return;
        FS.ErrnoError = function ErrnoError(errno, node) {
            this.node = node;
            this.setErrno = function (errno) {
                this.errno = errno;
            };
            this.setErrno(errno);
            this.message = "FS error";
        };
        FS.ErrnoError.prototype = new Error();
        FS.ErrnoError.prototype.constructor = FS.ErrnoError;
        [2].forEach(function (code) {
            FS.genericErrors[code] = new FS.ErrnoError(code);
            FS.genericErrors[code].stack = "<generic error, no stack>";
        });
    },
    staticInit: function () {
        FS.ensureErrnoError();
        FS.nameTable = new Array(4096);
        FS.mount(MEMFS, {}, "/");
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
        FS.filesystems = { MEMFS: MEMFS, IDBFS: IDBFS, WORKERFS: WORKERFS };
    },
    init: function (input, output, error) {
        FS.init.initialized = true;
        FS.ensureErrnoError();
        Module["stdin"] = input || Module["stdin"];
        Module["stdout"] = output || Module["stdout"];
        Module["stderr"] = error || Module["stderr"];
        FS.createStandardStreams();
    },
    quit: function () {
        FS.init.initialized = false;
        var fflush = Module["_fflush"];
        if (fflush) fflush(0);
        for (var i = 0; i < FS.streams.length; i++) {
            var stream = FS.streams[i];
            if (!stream) {
                continue;
            }
            FS.close(stream);
        }
    },
    getMode: function (canRead, canWrite) {
        var mode = 0;
        if (canRead) mode |= 292 | 73;
        if (canWrite) mode |= 146;
        return mode;
    },
    joinPath: function (parts, forceRelative) {
        var path = PATH.join.apply(null, parts);
        if (forceRelative && path[0] == "/") path = path.substr(1);
        return path;
    },
    absolutePath: function (relative, base) {
        return PATH_FS.resolve(base, relative);
    },
    standardizePath: function (path) {
        return PATH.normalize(path);
    },
    findObject: function (path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (ret.exists) {
            return ret.object;
        } else {
            ___setErrNo(ret.error);
            return null;
        }
    },
    analyzePath: function (path, dontResolveLastLink) {
        try {
            var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
            path = lookup.path;
        } catch (e) {}
        var ret = { isRoot: false, exists: false, error: 0, name: null, path: null, object: null, parentExists: false, parentPath: null, parentObject: null };
        try {
            var lookup = FS.lookupPath(path, { parent: true });
            ret.parentExists = true;
            ret.parentPath = lookup.path;
            ret.parentObject = lookup.node;
            ret.name = PATH.basename(path);
            lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
            ret.exists = true;
            ret.path = lookup.path;
            ret.object = lookup.node;
            ret.name = lookup.node.name;
            ret.isRoot = lookup.path === "/";
        } catch (e) {
            ret.error = e.errno;
        }
        return ret;
    },
    createFolder: function (parent, name, canRead, canWrite) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.mkdir(path, mode);
    },
    createPath: function (parent, path, canRead, canWrite) {
        parent = typeof parent === "string" ? parent : FS.getPath(parent);
        var parts = path.split("/").reverse();
        while (parts.length) {
            var part = parts.pop();
            if (!part) continue;
            var current = PATH.join2(parent, part);
            try {
                FS.mkdir(current);
            } catch (e) {}
            parent = current;
        }
        return current;
    },
    createFile: function (parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.create(path, mode);
    },
    createDataFile: function (parent, name, data, canRead, canWrite, canOwn) {
        var path = name ? PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name) : parent;
        var mode = FS.getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
            if (typeof data === "string") {
                var arr = new Array(data.length);
                for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
                data = arr;
            }
            FS.chmod(node, mode | 146);
            var stream = FS.open(node, "w");
            FS.write(stream, data, 0, data.length, 0, canOwn);
            FS.close(stream);
            FS.chmod(node, mode);
        }
        return node;
    },
    createDevice: function (parent, name, input, output) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(!!input, !!output);
        if (!FS.createDevice.major) FS.createDevice.major = 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        FS.registerDevice(dev, {
            open: function (stream) {
                stream.seekable = false;
            },
            close: function (stream) {
                if (output && output.buffer && output.buffer.length) {
                    output(10);
                }
            },
            read: function (stream, buffer, offset, length, pos) {
                var bytesRead = 0;
                for (var i = 0; i < length; i++) {
                    var result;
                    try {
                        result = input();
                    } catch (e) {
                        throw new FS.ErrnoError(5);
                    }
                    if (result === undefined && bytesRead === 0) {
                        throw new FS.ErrnoError(11);
                    }
                    if (result === null || result === undefined) break;
                    bytesRead++;
                    buffer[offset + i] = result;
                }
                if (bytesRead) {
                    stream.node.timestamp = Date.now();
                }
                return bytesRead;
            },
            write: function (stream, buffer, offset, length, pos) {
                for (var i = 0; i < length; i++) {
                    try {
                        output(buffer[offset + i]);
                    } catch (e) {
                        throw new FS.ErrnoError(5);
                    }
                }
                if (length) {
                    stream.node.timestamp = Date.now();
                }
                return i;
            },
        });
        return FS.mkdev(path, mode, dev);
    },
    createLink: function (parent, name, target, canRead, canWrite) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        return FS.symlink(target, path);
    },
    forceLoadFile: function (obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        var success = true;
        if (typeof XMLHttpRequest !== "undefined") {
            throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
        } else if (read_) {
            try {
                obj.contents = intArrayFromString(read_(obj.url), true);
                obj.usedBytes = obj.contents.length;
            } catch (e) {
                success = false;
            }
        } else {
            throw new Error("Cannot load without read() or XMLHttpRequest.");
        }
        if (!success) ___setErrNo(5);
        return success;
    },
    createLazyFile: function (parent, name, url, canRead, canWrite) {
        function LazyUint8Array() {
            this.lengthKnown = false;
            this.chunks = [];
        }
        LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
            if (idx > this.length - 1 || idx < 0) {
                return undefined;
            }
            var chunkOffset = idx % this.chunkSize;
            var chunkNum = (idx / this.chunkSize) | 0;
            return this.getter(chunkNum)[chunkOffset];
        };
        LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
            this.getter = getter;
        };
        LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
            var xhr = new XMLHttpRequest();
            xhr.open("HEAD", url, false);
            xhr.send(null);
            if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
            var datalength = Number(xhr.getResponseHeader("Content-length"));
            var header;
            var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
            var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
            var chunkSize = 1024 * 1024;
            if (!hasByteServing) chunkSize = datalength;
            var doXHR = function (from, to) {
                if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
                if (to > datalength - 1) throw new Error("only " + datalength + " bytes available! programmer error!");
                var xhr = new XMLHttpRequest();
                xhr.open("GET", url, false);
                if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
                if (typeof Uint8Array != "undefined") xhr.responseType = "arraybuffer";
                if (xhr.overrideMimeType) {
                    xhr.overrideMimeType("text/plain; charset=x-user-defined");
                }
                xhr.send(null);
                if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
                if (xhr.response !== undefined) {
                    return new Uint8Array(xhr.response || []);
                } else {
                    return intArrayFromString(xhr.responseText || "", true);
                }
            };
            var lazyArray = this;
            lazyArray.setDataGetter(function (chunkNum) {
                var start = chunkNum * chunkSize;
                var end = (chunkNum + 1) * chunkSize - 1;
                end = Math.min(end, datalength - 1);
                if (typeof lazyArray.chunks[chunkNum] === "undefined") {
                    lazyArray.chunks[chunkNum] = doXHR(start, end);
                }
                if (typeof lazyArray.chunks[chunkNum] === "undefined") throw new Error("doXHR failed!");
                return lazyArray.chunks[chunkNum];
            });
            if (usesGzip || !datalength) {
                chunkSize = datalength = 1;
                datalength = this.getter(0).length;
                chunkSize = datalength;
                console.log("LazyFiles on gzip forces download of the whole file when length is accessed");
            }
            this._length = datalength;
            this._chunkSize = chunkSize;
            this.lengthKnown = true;
        };
        if (typeof XMLHttpRequest !== "undefined") {
            if (!ENVIRONMENT_IS_WORKER) throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
            var lazyArray = new LazyUint8Array();
            Object.defineProperties(lazyArray, {
                length: {
                    get: function () {
                        if (!this.lengthKnown) {
                            this.cacheLength();
                        }
                        return this._length;
                    },
                },
                chunkSize: {
                    get: function () {
                        if (!this.lengthKnown) {
                            this.cacheLength();
                        }
                        return this._chunkSize;
                    },
                },
            });
            var properties = { isDevice: false, contents: lazyArray };
        } else {
            var properties = { isDevice: false, url: url };
        }
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        if (properties.contents) {
            node.contents = properties.contents;
        } else if (properties.url) {
            node.contents = null;
            node.url = properties.url;
        }
        Object.defineProperties(node, {
            usedBytes: {
                get: function () {
                    return this.contents.length;
                },
            },
        });
        var stream_ops = {};
        var keys = Object.keys(node.stream_ops);
        keys.forEach(function (key) {
            var fn = node.stream_ops[key];
            stream_ops[key] = function forceLoadLazyFile() {
                if (!FS.forceLoadFile(node)) {
                    throw new FS.ErrnoError(5);
                }
                return fn.apply(null, arguments);
            };
        });
        stream_ops.read = function stream_ops_read(stream, buffer, offset, length, position) {
            if (!FS.forceLoadFile(node)) {
                throw new FS.ErrnoError(5);
            }
            var contents = stream.node.contents;
            if (position >= contents.length) return 0;
            var size = Math.min(contents.length - position, length);
            if (contents.slice) {
                for (var i = 0; i < size; i++) {
                    buffer[offset + i] = contents[position + i];
                }
            } else {
                for (var i = 0; i < size; i++) {
                    buffer[offset + i] = contents.get(position + i);
                }
            }
            return size;
        };
        node.stream_ops = stream_ops;
        return node;
    },
    createPreloadedFile: function (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) {
        Browser.init();
        var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
        var dep = getUniqueRunDependency("cp " + fullname);
        function processData(byteArray) {
            function finish(byteArray) {
                if (preFinish) preFinish();
                if (!dontCreateFile) {
                    FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
                }
                if (onload) onload();
                removeRunDependency(dep);
            }
            var handled = false;
            Module["preloadPlugins"].forEach(function (plugin) {
                if (handled) return;
                if (plugin["canHandle"](fullname)) {
                    plugin["handle"](byteArray, fullname, finish, function () {
                        if (onerror) onerror();
                        removeRunDependency(dep);
                    });
                    handled = true;
                }
            });
            if (!handled) finish(byteArray);
        }
        addRunDependency(dep);
        if (typeof url == "string") {
            Browser.asyncLoad(
                url,
                function (byteArray) {
                    processData(byteArray);
                },
                onerror
            );
        } else {
            processData(url);
        }
    },
    indexedDB: function () {
        return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
    },
    DB_NAME: function () {
        return "EM_FS_" + window.location.pathname;
    },
    DB_VERSION: 20,
    DB_STORE_NAME: "FILE_DATA",
    saveFilesToDB: function (paths, onload, onerror) {
        onload = onload || function () {};
        onerror = onerror || function () {};
        var indexedDB = FS.indexedDB();
        try {
            var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
            return onerror(e);
        }
        openRequest.onupgradeneeded = function openRequest_onupgradeneeded() {
            console.log("creating db");
            var db = openRequest.result;
            db.createObjectStore(FS.DB_STORE_NAME);
        };
        openRequest.onsuccess = function openRequest_onsuccess() {
            var db = openRequest.result;
            var transaction = db.transaction([FS.DB_STORE_NAME], "readwrite");
            var files = transaction.objectStore(FS.DB_STORE_NAME);
            var ok = 0,
                fail = 0,
                total = paths.length;
            function finish() {
                if (fail == 0) onload();
                else onerror();
            }
            paths.forEach(function (path) {
                var putRequest = files.put(FS.analyzePath(path).object.contents, path);
                putRequest.onsuccess = function putRequest_onsuccess() {
                    ok++;
                    if (ok + fail == total) finish();
                };
                putRequest.onerror = function putRequest_onerror() {
                    fail++;
                    if (ok + fail == total) finish();
                };
            });
            transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
    },
    loadFilesFromDB: function (paths, onload, onerror) {
        onload = onload || function () {};
        onerror = onerror || function () {};
        var indexedDB = FS.indexedDB();
        try {
            var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
            return onerror(e);
        }
        openRequest.onupgradeneeded = onerror;
        openRequest.onsuccess = function openRequest_onsuccess() {
            var db = openRequest.result;
            try {
                var transaction = db.transaction([FS.DB_STORE_NAME], "readonly");
            } catch (e) {
                onerror(e);
                return;
            }
            var files = transaction.objectStore(FS.DB_STORE_NAME);
            var ok = 0,
                fail = 0,
                total = paths.length;
            function finish() {
                if (fail == 0) onload();
                else onerror();
            }
            paths.forEach(function (path) {
                var getRequest = files.get(path);
                getRequest.onsuccess = function getRequest_onsuccess() {
                    if (FS.analyzePath(path).exists) {
                        FS.unlink(path);
                    }
                    FS.createDataFile(PATH.dirname(path), PATH.basename(path), getRequest.result, true, true, true);
                    ok++;
                    if (ok + fail == total) finish();
                };
                getRequest.onerror = function getRequest_onerror() {
                    fail++;
                    if (ok + fail == total) finish();
                };
            });
            transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
    },
};
var SYSCALLS = {
    DEFAULT_POLLMASK: 5,
    mappings: {},
    umask: 511,
    calculateAt: function (dirfd, path) {
        if (path[0] !== "/") {
            var dir;
            if (dirfd === -100) {
                dir = FS.cwd();
            } else {
                var dirstream = FS.getStream(dirfd);
                if (!dirstream) throw new FS.ErrnoError(9);
                dir = dirstream.path;
            }
            path = PATH.join2(dir, path);
        }
        return path;
    },
    doStat: function (func, path, buf) {
        try {
            var stat = func(path);
        } catch (e) {
            if (e && e.node && PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))) {
                return -20;
            }
            throw e;
        }
        HEAP32[buf >> 2] = stat.dev;
        HEAP32[(buf + 4) >> 2] = 0;
        HEAP32[(buf + 8) >> 2] = stat.ino;
        HEAP32[(buf + 12) >> 2] = stat.mode;
        HEAP32[(buf + 16) >> 2] = stat.nlink;
        HEAP32[(buf + 20) >> 2] = stat.uid;
        HEAP32[(buf + 24) >> 2] = stat.gid;
        HEAP32[(buf + 28) >> 2] = stat.rdev;
        HEAP32[(buf + 32) >> 2] = 0;
        (tempI64 = [
            stat.size >>> 0,
            ((tempDouble = stat.size), +Math_abs(tempDouble) >= +1 ? (tempDouble > +0 ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / +4294967296) >>> 0) : 0),
        ]),
            (HEAP32[(buf + 40) >> 2] = tempI64[0]),
            (HEAP32[(buf + 44) >> 2] = tempI64[1]);
        HEAP32[(buf + 48) >> 2] = 4096;
        HEAP32[(buf + 52) >> 2] = stat.blocks;
        HEAP32[(buf + 56) >> 2] = (stat.atime.getTime() / 1e3) | 0;
        HEAP32[(buf + 60) >> 2] = 0;
        HEAP32[(buf + 64) >> 2] = (stat.mtime.getTime() / 1e3) | 0;
        HEAP32[(buf + 68) >> 2] = 0;
        HEAP32[(buf + 72) >> 2] = (stat.ctime.getTime() / 1e3) | 0;
        HEAP32[(buf + 76) >> 2] = 0;
        (tempI64 = [
            stat.ino >>> 0,
            ((tempDouble = stat.ino), +Math_abs(tempDouble) >= +1 ? (tempDouble > +0 ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / +4294967296) >>> 0) : 0),
        ]),
            (HEAP32[(buf + 80) >> 2] = tempI64[0]),
            (HEAP32[(buf + 84) >> 2] = tempI64[1]);
        return 0;
    },
    doMsync: function (addr, stream, len, flags) {
        var buffer = new Uint8Array(HEAPU8.subarray(addr, addr + len));
        FS.msync(stream, buffer, 0, len, flags);
    },
    doMkdir: function (path, mode) {
        path = PATH.normalize(path);
        if (path[path.length - 1] === "/") path = path.substr(0, path.length - 1);
        FS.mkdir(path, mode, 0);
        return 0;
    },
    doMknod: function (path, mode, dev) {
        switch (mode & 61440) {
            case 32768:
            case 8192:
            case 24576:
            case 4096:
            case 49152:
                break;
            default:
                return -22;
        }
        FS.mknod(path, mode, dev);
        return 0;
    },
    doReadlink: function (path, buf, bufsize) {
        if (bufsize <= 0) return -22;
        var ret = FS.readlink(path);
        var len = Math.min(bufsize, lengthBytesUTF8(ret));
        var endChar = HEAP8[buf + len];
        stringToUTF8(ret, buf, bufsize + 1);
        HEAP8[buf + len] = endChar;
        return len;
    },
    doAccess: function (path, amode) {
        if (amode & ~7) {
            return -22;
        }
        var node;
        var lookup = FS.lookupPath(path, { follow: true });
        node = lookup.node;
        if (!node) {
            return -2;
        }
        var perms = "";
        if (amode & 4) perms += "r";
        if (amode & 2) perms += "w";
        if (amode & 1) perms += "x";
        if (perms && FS.nodePermissions(node, perms)) {
            return -13;
        }
        return 0;
    },
    doDup: function (path, flags, suggestFD) {
        var suggest = FS.getStream(suggestFD);
        if (suggest) FS.close(suggest);
        return FS.open(path, flags, 0, suggestFD, suggestFD).fd;
    },
    doReadv: function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
            var ptr = HEAP32[(iov + i * 8) >> 2];
            var len = HEAP32[(iov + (i * 8 + 4)) >> 2];
            var curr = FS.read(stream, HEAP8, ptr, len, offset);
            if (curr < 0) return -1;
            ret += curr;
            if (curr < len) break;
        }
        return ret;
    },
    doWritev: function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
            var ptr = HEAP32[(iov + i * 8) >> 2];
            var len = HEAP32[(iov + (i * 8 + 4)) >> 2];
            var curr = FS.write(stream, HEAP8, ptr, len, offset);
            if (curr < 0) return -1;
            ret += curr;
        }
        return ret;
    },
    varargs: 0,
    get: function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(SYSCALLS.varargs - 4) >> 2];
        return ret;
    },
    getStr: function () {
        var ret = UTF8ToString(SYSCALLS.get());
        return ret;
    },
    getStreamFromFD: function () {
        var stream = FS.getStream(SYSCALLS.get());
        if (!stream) throw new FS.ErrnoError(9);
        return stream;
    },
    get64: function () {
        var low = SYSCALLS.get(),
            high = SYSCALLS.get();
        return low;
    },
    getZero: function () {
        SYSCALLS.get();
    },
};
function ___syscall10(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr();
        FS.unlink(path);
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
var SOCKFS = {
    mount: function (mount) {
        Module["websocket"] = Module["websocket"] && "object" === typeof Module["websocket"] ? Module["websocket"] : {};
        Module["websocket"]._callbacks = {};
        Module["websocket"]["on"] = function (event, callback) {
            if ("function" === typeof callback) {
                this._callbacks[event] = callback;
            }
            return this;
        };
        Module["websocket"].emit = function (event, param) {
            if ("function" === typeof this._callbacks[event]) {
                this._callbacks[event].call(this, param);
            }
        };
        return FS.createNode(null, "/", 16384 | 511, 0);
    },
    createSocket: function (family, type, protocol) {
        var streaming = type == 1;
        if (protocol) {
            assert(streaming == (protocol == 6));
        }
        var sock = { family: family, type: type, protocol: protocol, server: null, error: null, peers: {}, pending: [], recv_queue: [], sock_ops: SOCKFS.websocket_sock_ops };
        var name = SOCKFS.nextname();
        var node = FS.createNode(SOCKFS.root, name, 49152, 0);
        node.sock = sock;
        var stream = FS.createStream({ path: name, node: node, flags: FS.modeStringToFlags("r+"), seekable: false, stream_ops: SOCKFS.stream_ops });
        sock.stream = stream;
        return sock;
    },
    getSocket: function (fd) {
        var stream = FS.getStream(fd);
        if (!stream || !FS.isSocket(stream.node.mode)) {
            return null;
        }
        return stream.node.sock;
    },
    stream_ops: {
        poll: function (stream) {
            var sock = stream.node.sock;
            return sock.sock_ops.poll(sock);
        },
        ioctl: function (stream, request, varargs) {
            var sock = stream.node.sock;
            return sock.sock_ops.ioctl(sock, request, varargs);
        },
        read: function (stream, buffer, offset, length, position) {
            var sock = stream.node.sock;
            var msg = sock.sock_ops.recvmsg(sock, length);
            if (!msg) {
                return 0;
            }
            buffer.set(msg.buffer, offset);
            return msg.buffer.length;
        },
        write: function (stream, buffer, offset, length, position) {
            var sock = stream.node.sock;
            return sock.sock_ops.sendmsg(sock, buffer, offset, length);
        },
        close: function (stream) {
            var sock = stream.node.sock;
            sock.sock_ops.close(sock);
        },
    },
    nextname: function () {
        if (!SOCKFS.nextname.current) {
            SOCKFS.nextname.current = 0;
        }
        return "socket[" + SOCKFS.nextname.current++ + "]";
    },
    websocket_sock_ops: {
        createPeer: function (sock, addr, port) {
            var ws;
            if (typeof addr === "object") {
                ws = addr;
                addr = null;
                port = null;
            }
            if (ws) {
                if (ws._socket) {
                    addr = ws._socket.remoteAddress;
                    port = ws._socket.remotePort;
                } else {
                    var result = /ws[s]?:\/\/([^:]+):(\d+)/.exec(ws.url);
                    if (!result) {
                        throw new Error("WebSocket URL must be in the format ws(s)://address:port");
                    }
                    addr = result[1];
                    port = parseInt(result[2], 10);
                }
            } else {
                try {
                    var runtimeConfig = Module["websocket"] && "object" === typeof Module["websocket"];
                    var url = "ws:#".replace("#", "//");
                    if (runtimeConfig) {
                        if ("string" === typeof Module["websocket"]["url"]) {
                            url = Module["websocket"]["url"];
                        }
                    }
                    if (url === "ws://" || url === "wss://") {
                        var parts = addr.split("/");
                        url = url + parts[0] + ":" + port + "/" + parts.slice(1).join("/");
                    }
                    var subProtocols = "binary";
                    if (runtimeConfig) {
                        if ("string" === typeof Module["websocket"]["subprotocol"]) {
                            subProtocols = Module["websocket"]["subprotocol"];
                        }
                    }
                    var opts = undefined;
                    if (subProtocols !== "null") {
                        subProtocols = subProtocols.replace(/^ +| +$/g, "").split(/ *, */);
                        opts = ENVIRONMENT_IS_NODE ? { protocol: subProtocols.toString() } : subProtocols;
                    }
                    if (runtimeConfig && null === Module["websocket"]["subprotocol"]) {
                        subProtocols = "null";
                        opts = undefined;
                    }
                    var WebSocketConstructor;
                    if (ENVIRONMENT_IS_WEB) {
                        WebSocketConstructor = window["WebSocket"];
                    } else {
                        WebSocketConstructor = WebSocket;
                    }
                    ws = new WebSocketConstructor(url, opts);
                    ws.binaryType = "arraybuffer";
                } catch (e) {
                    throw new FS.ErrnoError(ERRNO_CODES.EHOSTUNREACH);
                }
            }
            var peer = { addr: addr, port: port, socket: ws, dgram_send_queue: [] };
            SOCKFS.websocket_sock_ops.addPeer(sock, peer);
            SOCKFS.websocket_sock_ops.handlePeerEvents(sock, peer);
            if (sock.type === 2 && typeof sock.sport !== "undefined") {
                peer.dgram_send_queue.push(new Uint8Array([255, 255, 255, 255, "p".charCodeAt(0), "o".charCodeAt(0), "r".charCodeAt(0), "t".charCodeAt(0), (sock.sport & 65280) >> 8, sock.sport & 255]));
            }
            return peer;
        },
        getPeer: function (sock, addr, port) {
            return sock.peers[addr + ":" + port];
        },
        addPeer: function (sock, peer) {
            sock.peers[peer.addr + ":" + peer.port] = peer;
        },
        removePeer: function (sock, peer) {
            delete sock.peers[peer.addr + ":" + peer.port];
        },
        handlePeerEvents: function (sock, peer) {
            var first = true;
            var handleOpen = function () {
                Module["websocket"].emit("open", sock.stream.fd);
                try {
                    var queued = peer.dgram_send_queue.shift();
                    while (queued) {
                        peer.socket.send(queued);
                        queued = peer.dgram_send_queue.shift();
                    }
                } catch (e) {
                    peer.socket.close();
                }
            };
            function handleMessage(data) {
                if (typeof data === "string") {
                    var encoder = new TextEncoder();
                    data = encoder.encode(data);
                } else {
                    assert(data.byteLength !== undefined);
                    if (data.byteLength == 0) {
                        return;
                    } else {
                        data = new Uint8Array(data);
                    }
                }
                var wasfirst = first;
                first = false;
                if (
                    wasfirst &&
                    data.length === 10 &&
                    data[0] === 255 &&
                    data[1] === 255 &&
                    data[2] === 255 &&
                    data[3] === 255 &&
                    data[4] === "p".charCodeAt(0) &&
                    data[5] === "o".charCodeAt(0) &&
                    data[6] === "r".charCodeAt(0) &&
                    data[7] === "t".charCodeAt(0)
                ) {
                    var newport = (data[8] << 8) | data[9];
                    SOCKFS.websocket_sock_ops.removePeer(sock, peer);
                    peer.port = newport;
                    SOCKFS.websocket_sock_ops.addPeer(sock, peer);
                    return;
                }
                sock.recv_queue.push({ addr: peer.addr, port: peer.port, data: data });
                Module["websocket"].emit("message", sock.stream.fd);
            }
            if (ENVIRONMENT_IS_NODE) {
                peer.socket.on("open", handleOpen);
                peer.socket.on("message", function (data, flags) {
                    if (!flags.binary) {
                        return;
                    }
                    handleMessage(new Uint8Array(data).buffer);
                });
                peer.socket.on("close", function () {
                    Module["websocket"].emit("close", sock.stream.fd);
                });
                peer.socket.on("error", function (error) {
                    sock.error = ERRNO_CODES.ECONNREFUSED;
                    Module["websocket"].emit("error", [sock.stream.fd, sock.error, "ECONNREFUSED: Connection refused"]);
                });
            } else {
                peer.socket.onopen = handleOpen;
                peer.socket.onclose = function () {
                    Module["websocket"].emit("close", sock.stream.fd);
                };
                peer.socket.onmessage = function peer_socket_onmessage(event) {
                    handleMessage(event.data);
                };
                peer.socket.onerror = function (error) {
                    sock.error = ERRNO_CODES.ECONNREFUSED;
                    Module["websocket"].emit("error", [sock.stream.fd, sock.error, "ECONNREFUSED: Connection refused"]);
                };
            }
        },
        poll: function (sock) {
            if (sock.type === 1 && sock.server) {
                return sock.pending.length ? 64 | 1 : 0;
            }
            var mask = 0;
            var dest = sock.type === 1 ? SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport) : null;
            if (sock.recv_queue.length || !dest || (dest && dest.socket.readyState === dest.socket.CLOSING) || (dest && dest.socket.readyState === dest.socket.CLOSED)) {
                mask |= 64 | 1;
            }
            if (!dest || (dest && dest.socket.readyState === dest.socket.OPEN)) {
                mask |= 4;
            }
            if ((dest && dest.socket.readyState === dest.socket.CLOSING) || (dest && dest.socket.readyState === dest.socket.CLOSED)) {
                mask |= 16;
            }
            return mask;
        },
        ioctl: function (sock, request, arg) {
            switch (request) {
                case 21531:
                    var bytes = 0;
                    if (sock.recv_queue.length) {
                        bytes = sock.recv_queue[0].data.length;
                    }
                    HEAP32[arg >> 2] = bytes;
                    return 0;
                default:
                    return ERRNO_CODES.EINVAL;
            }
        },
        close: function (sock) {
            if (sock.server) {
                try {
                    sock.server.close();
                } catch (e) {}
                sock.server = null;
            }
            var peers = Object.keys(sock.peers);
            for (var i = 0; i < peers.length; i++) {
                var peer = sock.peers[peers[i]];
                try {
                    peer.socket.close();
                } catch (e) {}
                SOCKFS.websocket_sock_ops.removePeer(sock, peer);
            }
            return 0;
        },
        bind: function (sock, addr, port) {
            if (typeof sock.saddr !== "undefined" || typeof sock.sport !== "undefined") {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
            }
            sock.saddr = addr;
            sock.sport = port;
            if (sock.type === 2) {
                if (sock.server) {
                    sock.server.close();
                    sock.server = null;
                }
                try {
                    sock.sock_ops.listen(sock, 0);
                } catch (e) {
                    if (!(e instanceof FS.ErrnoError)) throw e;
                    if (e.errno !== ERRNO_CODES.EOPNOTSUPP) throw e;
                }
            }
        },
        connect: function (sock, addr, port) {
            if (sock.server) {
                throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP);
            }
            if (typeof sock.daddr !== "undefined" && typeof sock.dport !== "undefined") {
                var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);
                if (dest) {
                    if (dest.socket.readyState === dest.socket.CONNECTING) {
                        throw new FS.ErrnoError(ERRNO_CODES.EALREADY);
                    } else {
                        throw new FS.ErrnoError(ERRNO_CODES.EISCONN);
                    }
                }
            }
            var peer = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
            sock.daddr = peer.addr;
            sock.dport = peer.port;
            throw new FS.ErrnoError(ERRNO_CODES.EINPROGRESS);
        },
        listen: function (sock, backlog) {
            if (!ENVIRONMENT_IS_NODE) {
                throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP);
            }
        },
        accept: function (listensock) {
            if (!listensock.server) {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
            }
            var newsock = listensock.pending.shift();
            newsock.stream.flags = listensock.stream.flags;
            return newsock;
        },
        getname: function (sock, peer) {
            var addr, port;
            if (peer) {
                if (sock.daddr === undefined || sock.dport === undefined) {
                    throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN);
                }
                addr = sock.daddr;
                port = sock.dport;
            } else {
                addr = sock.saddr || 0;
                port = sock.sport || 0;
            }
            return { addr: addr, port: port };
        },
        sendmsg: function (sock, buffer, offset, length, addr, port) {
            if (sock.type === 2) {
                if (addr === undefined || port === undefined) {
                    addr = sock.daddr;
                    port = sock.dport;
                }
                if (addr === undefined || port === undefined) {
                    throw new FS.ErrnoError(ERRNO_CODES.EDESTADDRREQ);
                }
            } else {
                addr = sock.daddr;
                port = sock.dport;
            }
            var dest = SOCKFS.websocket_sock_ops.getPeer(sock, addr, port);
            if (sock.type === 1) {
                if (!dest || dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
                    throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN);
                } else if (dest.socket.readyState === dest.socket.CONNECTING) {
                    throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
                }
            }
            if (ArrayBuffer.isView(buffer)) {
                offset += buffer.byteOffset;
                buffer = buffer.buffer;
            }
            var data;
            data = buffer.slice(offset, offset + length);
            if (sock.type === 2) {
                if (!dest || dest.socket.readyState !== dest.socket.OPEN) {
                    if (!dest || dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
                        dest = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
                    }
                    dest.dgram_send_queue.push(data);
                    return length;
                }
            }
            try {
                dest.socket.send(data);
                return length;
            } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
            }
        },
        recvmsg: function (sock, length) {
            if (sock.type === 1 && sock.server) {
                throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN);
            }
            var queued = sock.recv_queue.shift();
            if (!queued) {
                if (sock.type === 1) {
                    var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);
                    if (!dest) {
                        throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN);
                    } else if (dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
                        return null;
                    } else {
                        throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
                    }
                } else {
                    throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
                }
            }
            var queuedLength = queued.data.byteLength || queued.data.length;
            var queuedOffset = queued.data.byteOffset || 0;
            var queuedBuffer = queued.data.buffer || queued.data;
            var bytesRead = Math.min(length, queuedLength);
            var res = { buffer: new Uint8Array(queuedBuffer, queuedOffset, bytesRead), addr: queued.addr, port: queued.port };
            if (sock.type === 1 && bytesRead < queuedLength) {
                var bytesRemaining = queuedLength - bytesRead;
                queued.data = new Uint8Array(queuedBuffer, queuedOffset + bytesRead, bytesRemaining);
                sock.recv_queue.unshift(queued);
            }
            return res;
        },
    },
};
function __inet_pton4_raw(str) {
    var b = str.split(".");
    for (var i = 0; i < 4; i++) {
        var tmp = Number(b[i]);
        if (isNaN(tmp)) return null;
        b[i] = tmp;
    }
    return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
}
function __inet_pton6_raw(str) {
    var words;
    var w, offset, z;
    var valid6regx = /^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/i;
    var parts = [];
    if (!valid6regx.test(str)) {
        return null;
    }
    if (str === "::") {
        return [0, 0, 0, 0, 0, 0, 0, 0];
    }
    if (str.indexOf("::") === 0) {
        str = str.replace("::", "Z:");
    } else {
        str = str.replace("::", ":Z:");
    }
    if (str.indexOf(".") > 0) {
        str = str.replace(new RegExp("[.]", "g"), ":");
        words = str.split(":");
        words[words.length - 4] = parseInt(words[words.length - 4]) + parseInt(words[words.length - 3]) * 256;
        words[words.length - 3] = parseInt(words[words.length - 2]) + parseInt(words[words.length - 1]) * 256;
        words = words.slice(0, words.length - 2);
    } else {
        words = str.split(":");
    }
    offset = 0;
    z = 0;
    for (w = 0; w < words.length; w++) {
        if (typeof words[w] === "string") {
            if (words[w] === "Z") {
                for (z = 0; z < 8 - words.length + 1; z++) {
                    parts[w + z] = 0;
                }
                offset = z - 1;
            } else {
                parts[w + offset] = _htons(parseInt(words[w], 16));
            }
        } else {
            parts[w + offset] = words[w];
        }
    }
    return [(parts[1] << 16) | parts[0], (parts[3] << 16) | parts[2], (parts[5] << 16) | parts[4], (parts[7] << 16) | parts[6]];
}
var DNS = {
    address_map: { id: 1, addrs: {}, names: {} },
    lookup_name: function (name) {
        var res = __inet_pton4_raw(name);
        if (res !== null) {
            return name;
        }
        res = __inet_pton6_raw(name);
        if (res !== null) {
            return name;
        }
        var addr;
        if (DNS.address_map.addrs[name]) {
            addr = DNS.address_map.addrs[name];
        } else {
            var id = DNS.address_map.id++;
            assert(id < 65535, "exceeded max address mappings of 65535");
            addr = "172.29." + (id & 255) + "." + (id & 65280);
            DNS.address_map.names[addr] = name;
            DNS.address_map.addrs[name] = addr;
        }
        return addr;
    },
    lookup_addr: function (addr) {
        if (DNS.address_map.names[addr]) {
            return DNS.address_map.names[addr];
        }
        return null;
    },
};
function __inet_ntop4_raw(addr) {
    return (addr & 255) + "." + ((addr >> 8) & 255) + "." + ((addr >> 16) & 255) + "." + ((addr >> 24) & 255);
}
function __inet_ntop6_raw(ints) {
    var str = "";
    var word = 0;
    var longest = 0;
    var lastzero = 0;
    var zstart = 0;
    var len = 0;
    var i = 0;
    var parts = [ints[0] & 65535, ints[0] >> 16, ints[1] & 65535, ints[1] >> 16, ints[2] & 65535, ints[2] >> 16, ints[3] & 65535, ints[3] >> 16];
    var hasipv4 = true;
    var v4part = "";
    for (i = 0; i < 5; i++) {
        if (parts[i] !== 0) {
            hasipv4 = false;
            break;
        }
    }
    if (hasipv4) {
        v4part = __inet_ntop4_raw(parts[6] | (parts[7] << 16));
        if (parts[5] === -1) {
            str = "::ffff:";
            str += v4part;
            return str;
        }
        if (parts[5] === 0) {
            str = "::";
            if (v4part === "0.0.0.0") v4part = "";
            if (v4part === "0.0.0.1") v4part = "1";
            str += v4part;
            return str;
        }
    }
    for (word = 0; word < 8; word++) {
        if (parts[word] === 0) {
            if (word - lastzero > 1) {
                len = 0;
            }
            lastzero = word;
            len++;
        }
        if (len > longest) {
            longest = len;
            zstart = word - longest + 1;
        }
    }
    for (word = 0; word < 8; word++) {
        if (longest > 1) {
            if (parts[word] === 0 && word >= zstart && word < zstart + longest) {
                if (word === zstart) {
                    str += ":";
                    if (zstart === 0) str += ":";
                }
                continue;
            }
        }
        str += Number(_ntohs(parts[word] & 65535)).toString(16);
        str += word < 7 ? ":" : "";
    }
    return str;
}
function __read_sockaddr(sa, salen) {
    var family = HEAP16[sa >> 1];
    var port = _ntohs(HEAPU16[(sa + 2) >> 1]);
    var addr;
    switch (family) {
        case 2:
            if (salen !== 16) {
                return { errno: 22 };
            }
            addr = HEAP32[(sa + 4) >> 2];
            addr = __inet_ntop4_raw(addr);
            break;
        case 10:
            if (salen !== 28) {
                return { errno: 22 };
            }
            addr = [HEAP32[(sa + 8) >> 2], HEAP32[(sa + 12) >> 2], HEAP32[(sa + 16) >> 2], HEAP32[(sa + 20) >> 2]];
            addr = __inet_ntop6_raw(addr);
            break;
        default:
            return { errno: 97 };
    }
    return { family: family, addr: addr, port: port };
}
function __write_sockaddr(sa, family, addr, port) {
    switch (family) {
        case 2:
            addr = __inet_pton4_raw(addr);
            HEAP16[sa >> 1] = family;
            HEAP32[(sa + 4) >> 2] = addr;
            HEAP16[(sa + 2) >> 1] = _htons(port);
            break;
        case 10:
            addr = __inet_pton6_raw(addr);
            HEAP32[sa >> 2] = family;
            HEAP32[(sa + 8) >> 2] = addr[0];
            HEAP32[(sa + 12) >> 2] = addr[1];
            HEAP32[(sa + 16) >> 2] = addr[2];
            HEAP32[(sa + 20) >> 2] = addr[3];
            HEAP16[(sa + 2) >> 1] = _htons(port);
            HEAP32[(sa + 4) >> 2] = 0;
            HEAP32[(sa + 24) >> 2] = 0;
            break;
        default:
            return { errno: 97 };
    }
    return {};
}
function ___syscall102(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var call = SYSCALLS.get(),
            socketvararg = SYSCALLS.get();
        SYSCALLS.varargs = socketvararg;
        var getSocketFromFD = function () {
            var socket = SOCKFS.getSocket(SYSCALLS.get());
            if (!socket) throw new FS.ErrnoError(9);
            return socket;
        };
        var getSocketAddress = function (allowNull) {
            var addrp = SYSCALLS.get(),
                addrlen = SYSCALLS.get();
            if (allowNull && addrp === 0) return null;
            var info = __read_sockaddr(addrp, addrlen);
            if (info.errno) throw new FS.ErrnoError(info.errno);
            info.addr = DNS.lookup_addr(info.addr) || info.addr;
            return info;
        };
        switch (call) {
            case 1: {
                var domain = SYSCALLS.get(),
                    type = SYSCALLS.get(),
                    protocol = SYSCALLS.get();
                var sock = SOCKFS.createSocket(domain, type, protocol);
                return sock.stream.fd;
            }
            case 2: {
                var sock = getSocketFromFD(),
                    info = getSocketAddress();
                sock.sock_ops.bind(sock, info.addr, info.port);
                return 0;
            }
            case 3: {
                var sock = getSocketFromFD(),
                    info = getSocketAddress();
                sock.sock_ops.connect(sock, info.addr, info.port);
                return 0;
            }
            case 4: {
                var sock = getSocketFromFD(),
                    backlog = SYSCALLS.get();
                sock.sock_ops.listen(sock, backlog);
                return 0;
            }
            case 5: {
                var sock = getSocketFromFD(),
                    addr = SYSCALLS.get(),
                    addrlen = SYSCALLS.get();
                var newsock = sock.sock_ops.accept(sock);
                if (addr) {
                    var res = __write_sockaddr(addr, newsock.family, DNS.lookup_name(newsock.daddr), newsock.dport);
                }
                return newsock.stream.fd;
            }
            case 6: {
                var sock = getSocketFromFD(),
                    addr = SYSCALLS.get(),
                    addrlen = SYSCALLS.get();
                var res = __write_sockaddr(addr, sock.family, DNS.lookup_name(sock.saddr || "0.0.0.0"), sock.sport);
                return 0;
            }
            case 7: {
                var sock = getSocketFromFD(),
                    addr = SYSCALLS.get(),
                    addrlen = SYSCALLS.get();
                if (!sock.daddr) {
                    return -107;
                }
                var res = __write_sockaddr(addr, sock.family, DNS.lookup_name(sock.daddr), sock.dport);
                return 0;
            }
            case 11: {
                var sock = getSocketFromFD(),
                    message = SYSCALLS.get(),
                    length = SYSCALLS.get(),
                    flags = SYSCALLS.get(),
                    dest = getSocketAddress(true);
                if (!dest) {
                    return FS.write(sock.stream, HEAP8, message, length);
                } else {
                    return sock.sock_ops.sendmsg(sock, HEAP8, message, length, dest.addr, dest.port);
                }
            }
            case 12: {
                var sock = getSocketFromFD(),
                    buf = SYSCALLS.get(),
                    len = SYSCALLS.get(),
                    flags = SYSCALLS.get(),
                    addr = SYSCALLS.get(),
                    addrlen = SYSCALLS.get();
                var msg = sock.sock_ops.recvmsg(sock, len);
                if (!msg) return 0;
                if (addr) {
                    var res = __write_sockaddr(addr, sock.family, DNS.lookup_name(msg.addr), msg.port);
                }
                HEAPU8.set(msg.buffer, buf);
                return msg.buffer.byteLength;
            }
            case 14: {
                return -92;
            }
            case 15: {
                var sock = getSocketFromFD(),
                    level = SYSCALLS.get(),
                    optname = SYSCALLS.get(),
                    optval = SYSCALLS.get(),
                    optlen = SYSCALLS.get();
                if (level === 1) {
                    if (optname === 4) {
                        HEAP32[optval >> 2] = sock.error;
                        HEAP32[optlen >> 2] = 4;
                        sock.error = null;
                        return 0;
                    }
                }
                return -92;
            }
            case 16: {
                var sock = getSocketFromFD(),
                    message = SYSCALLS.get(),
                    flags = SYSCALLS.get();
                var iov = HEAP32[(message + 8) >> 2];
                var num = HEAP32[(message + 12) >> 2];
                var addr, port;
                var name = HEAP32[message >> 2];
                var namelen = HEAP32[(message + 4) >> 2];
                if (name) {
                    var info = __read_sockaddr(name, namelen);
                    if (info.errno) return -info.errno;
                    port = info.port;
                    addr = DNS.lookup_addr(info.addr) || info.addr;
                }
                var total = 0;
                for (var i = 0; i < num; i++) {
                    total += HEAP32[(iov + (8 * i + 4)) >> 2];
                }
                var view = new Uint8Array(total);
                var offset = 0;
                for (var i = 0; i < num; i++) {
                    var iovbase = HEAP32[(iov + (8 * i + 0)) >> 2];
                    var iovlen = HEAP32[(iov + (8 * i + 4)) >> 2];
                    for (var j = 0; j < iovlen; j++) {
                        view[offset++] = HEAP8[(iovbase + j) >> 0];
                    }
                }
                return sock.sock_ops.sendmsg(sock, view, 0, total, addr, port);
            }
            case 17: {
                var sock = getSocketFromFD(),
                    message = SYSCALLS.get(),
                    flags = SYSCALLS.get();
                var iov = HEAP32[(message + 8) >> 2];
                var num = HEAP32[(message + 12) >> 2];
                var total = 0;
                for (var i = 0; i < num; i++) {
                    total += HEAP32[(iov + (8 * i + 4)) >> 2];
                }
                var msg = sock.sock_ops.recvmsg(sock, total);
                if (!msg) return 0;
                var name = HEAP32[message >> 2];
                if (name) {
                    var res = __write_sockaddr(name, sock.family, DNS.lookup_name(msg.addr), msg.port);
                }
                var bytesRead = 0;
                var bytesRemaining = msg.buffer.byteLength;
                for (var i = 0; bytesRemaining > 0 && i < num; i++) {
                    var iovbase = HEAP32[(iov + (8 * i + 0)) >> 2];
                    var iovlen = HEAP32[(iov + (8 * i + 4)) >> 2];
                    if (!iovlen) {
                        continue;
                    }
                    var length = Math.min(iovlen, bytesRemaining);
                    var buf = msg.buffer.subarray(bytesRead, bytesRead + length);
                    HEAPU8.set(buf, iovbase + bytesRead);
                    bytesRead += length;
                    bytesRemaining -= length;
                }
                return bytesRead;
            }
            default:
                abort("unsupported socketcall syscall " + call);
        }
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function _emscripten_set_main_loop_timing(mode, value) {
    Browser.mainLoop.timingMode = mode;
    Browser.mainLoop.timingValue = value;
    if (!Browser.mainLoop.func) {
        return 1;
    }
    if (mode == 0) {
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setTimeout() {
            var timeUntilNextTick = Math.max(0, Browser.mainLoop.tickStartTime + value - _emscripten_get_now()) | 0;
            setTimeout(Browser.mainLoop.runner, timeUntilNextTick);
        };
        Browser.mainLoop.method = "timeout";
    } else if (mode == 1) {
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_rAF() {
            Browser.requestAnimationFrame(Browser.mainLoop.runner);
        };
        Browser.mainLoop.method = "rAF";
    } else if (mode == 2) {
        if (typeof setImmediate === "undefined") {
            var setImmediates = [];
            var emscriptenMainLoopMessageId = "setimmediate";
            var Browser_setImmediate_messageHandler = function (event) {
                if (event.data === emscriptenMainLoopMessageId || event.data.target === emscriptenMainLoopMessageId) {
                    event.stopPropagation();
                    setImmediates.shift()();
                }
            };
            addEventListener("message", Browser_setImmediate_messageHandler, true);
            setImmediate = function Browser_emulated_setImmediate(func) {
                setImmediates.push(func);
                if (ENVIRONMENT_IS_WORKER) {
                    if (Module["setImmediates"] === undefined) Module["setImmediates"] = [];
                    Module["setImmediates"].push(func);
                    postMessage({ target: emscriptenMainLoopMessageId });
                } else postMessage(emscriptenMainLoopMessageId, "*");
            };
        }
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setImmediate() {
            setImmediate(Browser.mainLoop.runner);
        };
        Browser.mainLoop.method = "immediate";
    }
    return 0;
}
function _emscripten_set_main_loop(func, fps, simulateInfiniteLoop, arg, noSetTiming) {
    noExitRuntime = true;
    assert(!Browser.mainLoop.func, "emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.");
    Browser.mainLoop.func = func;
    Browser.mainLoop.arg = arg;
    var browserIterationFunc;
    if (typeof arg !== "undefined") {
        browserIterationFunc = function () {
            Module["dynCall_vi"](func, arg);
        };
    } else {
        browserIterationFunc = function () {
            Module["dynCall_v"](func);
        };
    }
    var thisMainLoopId = Browser.mainLoop.currentlyRunningMainloop;
    Browser.mainLoop.runner = function Browser_mainLoop_runner() {
        if (ABORT) return;
        if (Browser.mainLoop.queue.length > 0) {
            var start = Date.now();
            var blocker = Browser.mainLoop.queue.shift();
            blocker.func(blocker.arg);
            if (Browser.mainLoop.remainingBlockers) {
                var remaining = Browser.mainLoop.remainingBlockers;
                var next = remaining % 1 == 0 ? remaining - 1 : Math.floor(remaining);
                if (blocker.counted) {
                    Browser.mainLoop.remainingBlockers = next;
                } else {
                    next = next + 0.5;
                    Browser.mainLoop.remainingBlockers = (8 * remaining + next) / 9;
                }
            }
            console.log('main loop blocker "' + blocker.name + '" took ' + (Date.now() - start) + " ms");
            Browser.mainLoop.updateStatus();
            if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
            setTimeout(Browser.mainLoop.runner, 0);
            return;
        }
        if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
        Browser.mainLoop.currentFrameNumber = (Browser.mainLoop.currentFrameNumber + 1) | 0;
        if (Browser.mainLoop.timingMode == 1 && Browser.mainLoop.timingValue > 1 && Browser.mainLoop.currentFrameNumber % Browser.mainLoop.timingValue != 0) {
            Browser.mainLoop.scheduler();
            return;
        } else if (Browser.mainLoop.timingMode == 0) {
            Browser.mainLoop.tickStartTime = _emscripten_get_now();
        }
        GL.newRenderingFrameStarted();
        if (Browser.mainLoop.method === "timeout" && Module.ctx) {
            err(
                "Looks like you are rendering without using requestAnimationFrame for the main loop. You should use 0 for the frame rate in emscripten_set_main_loop in order to use requestAnimationFrame, as that can greatly improve your frame rates!"
            );
            Browser.mainLoop.method = "";
        }
        Browser.mainLoop.runIter(browserIterationFunc);
        if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
        if (typeof SDL === "object" && SDL.audio && SDL.audio.queueNewAudioData) SDL.audio.queueNewAudioData();
        Browser.mainLoop.scheduler();
    };
    if (!noSetTiming) {
        if (fps && fps > 0) _emscripten_set_main_loop_timing(0, 1e3 / fps);
        else _emscripten_set_main_loop_timing(1, 1);
        Browser.mainLoop.scheduler();
    }
    if (simulateInfiniteLoop) {
        throw "SimulateInfiniteLoop";
    }
}
var Browser = {
    mainLoop: {
        scheduler: null,
        method: "",
        currentlyRunningMainloop: 0,
        func: null,
        arg: 0,
        timingMode: 0,
        timingValue: 0,
        currentFrameNumber: 0,
        queue: [],
        pause: function () {
            Browser.mainLoop.scheduler = null;
            Browser.mainLoop.currentlyRunningMainloop++;
        },
        resume: function () {
            Browser.mainLoop.currentlyRunningMainloop++;
            var timingMode = Browser.mainLoop.timingMode;
            var timingValue = Browser.mainLoop.timingValue;
            var func = Browser.mainLoop.func;
            Browser.mainLoop.func = null;
            _emscripten_set_main_loop(func, 0, false, Browser.mainLoop.arg, true);
            _emscripten_set_main_loop_timing(timingMode, timingValue);
            Browser.mainLoop.scheduler();
        },
        updateStatus: function () {
            if (Module["setStatus"]) {
                var message = Module["statusMessage"] || "Please wait...";
                var remaining = Browser.mainLoop.remainingBlockers;
                var expected = Browser.mainLoop.expectedBlockers;
                if (remaining) {
                    if (remaining < expected) {
                        Module["setStatus"](message + " (" + (expected - remaining) + "/" + expected + ")");
                    } else {
                        Module["setStatus"](message);
                    }
                } else {
                    Module["setStatus"]("");
                }
            }
        },
        runIter: function (func) {
            if (ABORT) return;
            if (Module["preMainLoop"]) {
                var preRet = Module["preMainLoop"]();
                if (preRet === false) {
                    return;
                }
            }
            try {
                func();
            } catch (e) {
                if (e instanceof ExitStatus) {
                    return;
                } else {
                    if (e && typeof e === "object" && e.stack) err("exception thrown: " + [e, e.stack]);
                    throw e;
                }
            }
            if (Module["postMainLoop"]) Module["postMainLoop"]();
        },
    },
    isFullscreen: false,
    pointerLock: false,
    moduleContextCreatedCallbacks: [],
    workers: [],
    init: function () {
        if (!Module["preloadPlugins"]) Module["preloadPlugins"] = [];
        if (Browser.initted) return;
        Browser.initted = true;
        try {
            new Blob();
            Browser.hasBlobConstructor = true;
        } catch (e) {
            Browser.hasBlobConstructor = false;
            console.log("warning: no blob constructor, cannot create blobs with mimetypes");
        }
        Browser.BlobBuilder = typeof MozBlobBuilder != "undefined" ? MozBlobBuilder : typeof WebKitBlobBuilder != "undefined" ? WebKitBlobBuilder : !Browser.hasBlobConstructor ? console.log("warning: no BlobBuilder") : null;
        Browser.URLObject = typeof window != "undefined" ? (window.URL ? window.URL : window.webkitURL) : undefined;
        if (!Module.noImageDecoding && typeof Browser.URLObject === "undefined") {
            console.log("warning: Browser does not support creating object URLs. Built-in browser image decoding will not be available.");
            Module.noImageDecoding = true;
        }
        var imagePlugin = {};
        imagePlugin["canHandle"] = function imagePlugin_canHandle(name) {
            return !Module.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/i.test(name);
        };
        imagePlugin["handle"] = function imagePlugin_handle(byteArray, name, onload, onerror) {
            var b = null;
            if (Browser.hasBlobConstructor) {
                try {
                    b = new Blob([byteArray], { type: Browser.getMimetype(name) });
                    if (b.size !== byteArray.length) {
                        b = new Blob([new Uint8Array(byteArray).buffer], { type: Browser.getMimetype(name) });
                    }
                } catch (e) {
                    warnOnce("Blob constructor present but fails: " + e + "; falling back to blob builder");
                }
            }
            if (!b) {
                var bb = new Browser.BlobBuilder();
                bb.append(new Uint8Array(byteArray).buffer);
                b = bb.getBlob();
            }
            var url = Browser.URLObject.createObjectURL(b);
            var img = new Image();
            img.onload = function img_onload() {
                assert(img.complete, "Image " + name + " could not be decoded");
                var canvas = document.createElement("canvas");
                canvas.width = img.width;
                canvas.height = img.height;
                var ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0);
                Module["preloadedImages"][name] = canvas;
                Browser.URLObject.revokeObjectURL(url);
                if (onload) onload(byteArray);
            };
            img.onerror = function img_onerror(event) {
                console.log("Image " + url + " could not be decoded");
                if (onerror) onerror();
            };
            img.src = url;
        };
        Module["preloadPlugins"].push(imagePlugin);
        var audioPlugin = {};
        audioPlugin["canHandle"] = function audioPlugin_canHandle(name) {
            return !Module.noAudioDecoding && name.substr(-4) in { ".ogg": 1, ".wav": 1, ".mp3": 1 };
        };
        audioPlugin["handle"] = function audioPlugin_handle(byteArray, name, onload, onerror) {
            var done = false;
            function finish(audio) {
                if (done) return;
                done = true;
                Module["preloadedAudios"][name] = audio;
                if (onload) onload(byteArray);
            }
            function fail() {
                if (done) return;
                done = true;
                Module["preloadedAudios"][name] = new Audio();
                if (onerror) onerror();
            }
            if (Browser.hasBlobConstructor) {
                try {
                    var b = new Blob([byteArray], { type: Browser.getMimetype(name) });
                } catch (e) {
                    return fail();
                }
                var url = Browser.URLObject.createObjectURL(b);
                var audio = new Audio();
                audio.addEventListener(
                    "canplaythrough",
                    function () {
                        finish(audio);
                    },
                    false
                );
                audio.onerror = function audio_onerror(event) {
                    if (done) return;
                    console.log("warning: browser could not fully decode audio " + name + ", trying slower base64 approach");
                    function encode64(data) {
                        var BASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
                        var PAD = "=";
                        var ret = "";
                        var leftchar = 0;
                        var leftbits = 0;
                        for (var i = 0; i < data.length; i++) {
                            leftchar = (leftchar << 8) | data[i];
                            leftbits += 8;
                            while (leftbits >= 6) {
                                var curr = (leftchar >> (leftbits - 6)) & 63;
                                leftbits -= 6;
                                ret += BASE[curr];
                            }
                        }
                        if (leftbits == 2) {
                            ret += BASE[(leftchar & 3) << 4];
                            ret += PAD + PAD;
                        } else if (leftbits == 4) {
                            ret += BASE[(leftchar & 15) << 2];
                            ret += PAD;
                        }
                        return ret;
                    }
                    audio.src = "data:audio/x-" + name.substr(-3) + ";base64," + encode64(byteArray);
                    finish(audio);
                };
                audio.src = url;
                Browser.safeSetTimeout(function () {
                    finish(audio);
                }, 1e4);
            } else {
                return fail();
            }
        };
        Module["preloadPlugins"].push(audioPlugin);
        function pointerLockChange() {
            Browser.pointerLock =
                document["pointerLockElement"] === Module["canvas"] ||
                document["mozPointerLockElement"] === Module["canvas"] ||
                document["webkitPointerLockElement"] === Module["canvas"] ||
                document["msPointerLockElement"] === Module["canvas"];
        }
        var canvas = Module["canvas"];
        if (canvas) {
            canvas.requestPointerLock = canvas["requestPointerLock"] || canvas["mozRequestPointerLock"] || canvas["webkitRequestPointerLock"] || canvas["msRequestPointerLock"] || function () {};
            canvas.exitPointerLock = document["exitPointerLock"] || document["mozExitPointerLock"] || document["webkitExitPointerLock"] || document["msExitPointerLock"] || function () {};
            canvas.exitPointerLock = canvas.exitPointerLock.bind(document);
            document.addEventListener("pointerlockchange", pointerLockChange, false);
            document.addEventListener("mozpointerlockchange", pointerLockChange, false);
            document.addEventListener("webkitpointerlockchange", pointerLockChange, false);
            document.addEventListener("mspointerlockchange", pointerLockChange, false);
            if (Module["elementPointerLock"]) {
                canvas.addEventListener(
                    "click",
                    function (ev) {
                        if (!Browser.pointerLock && Module["canvas"].requestPointerLock) {
                            Module["canvas"].requestPointerLock();
                            ev.preventDefault();
                        }
                    },
                    false
                );
            }
        }
    },
    createContext: function (canvas, useWebGL, setInModule, webGLContextAttributes) {
        if (useWebGL && Module.ctx && canvas == Module.canvas) return Module.ctx;
        var ctx;
        var contextHandle;
        if (useWebGL) {
            var contextAttributes = { antialias: false, alpha: false, majorVersion: 1 };
            if (webGLContextAttributes) {
                for (var attribute in webGLContextAttributes) {
                    contextAttributes[attribute] = webGLContextAttributes[attribute];
                }
            }
            if (typeof GL !== "undefined") {
                contextHandle = GL.createContext(canvas, contextAttributes);
                if (contextHandle) {
                    ctx = GL.getContext(contextHandle).GLctx;
                }
            }
        } else {
            ctx = canvas.getContext("2d");
        }
        if (!ctx) return null;
        if (setInModule) {
            if (!useWebGL) assert(typeof GLctx === "undefined", "cannot set in module if GLctx is used, but we are a non-GL context that would replace it");
            Module.ctx = ctx;
            if (useWebGL) GL.makeContextCurrent(contextHandle);
            Module.useWebGL = useWebGL;
            Browser.moduleContextCreatedCallbacks.forEach(function (callback) {
                callback();
            });
            Browser.init();
        }
        return ctx;
    },
    destroyContext: function (canvas, useWebGL, setInModule) {},
    fullscreenHandlersInstalled: false,
    lockPointer: undefined,
    resizeCanvas: undefined,
    requestFullscreen: function (lockPointer, resizeCanvas, vrDevice) {
        Browser.lockPointer = lockPointer;
        Browser.resizeCanvas = resizeCanvas;
        Browser.vrDevice = vrDevice;
        if (typeof Browser.lockPointer === "undefined") Browser.lockPointer = true;
        if (typeof Browser.resizeCanvas === "undefined") Browser.resizeCanvas = false;
        if (typeof Browser.vrDevice === "undefined") Browser.vrDevice = null;
        var canvas = Module["canvas"];
        function fullscreenChange() {
            Browser.isFullscreen = false;
            var canvasContainer = canvas.parentNode;
            if ((document["fullscreenElement"] || document["mozFullScreenElement"] || document["msFullscreenElement"] || document["webkitFullscreenElement"] || document["webkitCurrentFullScreenElement"]) === canvasContainer) {
                canvas.exitFullscreen = Browser.exitFullscreen;
                if (Browser.lockPointer) canvas.requestPointerLock();
                Browser.isFullscreen = true;
                if (Browser.resizeCanvas) {
                    Browser.setFullscreenCanvasSize();
                } else {
                    Browser.updateCanvasDimensions(canvas);
                }
            } else {
                canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
                canvasContainer.parentNode.removeChild(canvasContainer);
                if (Browser.resizeCanvas) {
                    Browser.setWindowedCanvasSize();
                } else {
                    Browser.updateCanvasDimensions(canvas);
                }
            }
            if (Module["onFullScreen"]) Module["onFullScreen"](Browser.isFullscreen);
            if (Module["onFullscreen"]) Module["onFullscreen"](Browser.isFullscreen);
        }
        if (!Browser.fullscreenHandlersInstalled) {
            Browser.fullscreenHandlersInstalled = true;
            document.addEventListener("fullscreenchange", fullscreenChange, false);
            document.addEventListener("mozfullscreenchange", fullscreenChange, false);
            document.addEventListener("webkitfullscreenchange", fullscreenChange, false);
            document.addEventListener("MSFullscreenChange", fullscreenChange, false);
        }
        var canvasContainer = document.createElement("div");
        canvas.parentNode.insertBefore(canvasContainer, canvas);
        canvasContainer.appendChild(canvas);
        canvasContainer.requestFullscreen =
            canvasContainer["requestFullscreen"] ||
            canvasContainer["mozRequestFullScreen"] ||
            canvasContainer["msRequestFullscreen"] ||
            (canvasContainer["webkitRequestFullscreen"]
                ? function () {
                      canvasContainer["webkitRequestFullscreen"](Element["ALLOW_KEYBOARD_INPUT"]);
                  }
                : null) ||
            (canvasContainer["webkitRequestFullScreen"]
                ? function () {
                      canvasContainer["webkitRequestFullScreen"](Element["ALLOW_KEYBOARD_INPUT"]);
                  }
                : null);
        if (vrDevice) {
            canvasContainer.requestFullscreen({ vrDisplay: vrDevice });
        } else {
            canvasContainer.requestFullscreen();
        }
    },
    requestFullScreen: function (lockPointer, resizeCanvas, vrDevice) {
        err("Browser.requestFullScreen() is deprecated. Please call Browser.requestFullscreen instead.");
        Browser.requestFullScreen = function (lockPointer, resizeCanvas, vrDevice) {
            return Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice);
        };
        return Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice);
    },
    exitFullscreen: function () {
        if (!Browser.isFullscreen) {
            return false;
        }
        var CFS = document["exitFullscreen"] || document["cancelFullScreen"] || document["mozCancelFullScreen"] || document["msExitFullscreen"] || document["webkitCancelFullScreen"] || function () {};
        CFS.apply(document, []);
        return true;
    },
    nextRAF: 0,
    fakeRequestAnimationFrame: function (func) {
        var now = Date.now();
        if (Browser.nextRAF === 0) {
            Browser.nextRAF = now + 1e3 / 60;
        } else {
            while (now + 2 >= Browser.nextRAF) {
                Browser.nextRAF += 1e3 / 60;
            }
        }
        var delay = Math.max(Browser.nextRAF - now, 0);
        setTimeout(func, delay);
    },
    requestAnimationFrame: function (func) {
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(func);
            return;
        }
        var RAF = Browser.fakeRequestAnimationFrame;
        RAF(func);
    },
    safeCallback: function (func) {
        return function () {
            if (!ABORT) return func.apply(null, arguments);
        };
    },
    allowAsyncCallbacks: true,
    queuedAsyncCallbacks: [],
    pauseAsyncCallbacks: function () {
        Browser.allowAsyncCallbacks = false;
    },
    resumeAsyncCallbacks: function () {
        Browser.allowAsyncCallbacks = true;
        if (Browser.queuedAsyncCallbacks.length > 0) {
            var callbacks = Browser.queuedAsyncCallbacks;
            Browser.queuedAsyncCallbacks = [];
            callbacks.forEach(function (func) {
                func();
            });
        }
    },
    safeRequestAnimationFrame: function (func) {
        return Browser.requestAnimationFrame(function () {
            if (ABORT) return;
            if (Browser.allowAsyncCallbacks) {
                func();
            } else {
                Browser.queuedAsyncCallbacks.push(func);
            }
        });
    },
    safeSetTimeout: function (func, timeout) {
        noExitRuntime = true;
        return setTimeout(function () {
            if (ABORT) return;
            if (Browser.allowAsyncCallbacks) {
                func();
            } else {
                Browser.queuedAsyncCallbacks.push(func);
            }
        }, timeout);
    },
    safeSetInterval: function (func, timeout) {
        noExitRuntime = true;
        return setInterval(function () {
            if (ABORT) return;
            if (Browser.allowAsyncCallbacks) {
                func();
            }
        }, timeout);
    },
    getMimetype: function (name) {
        return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", bmp: "image/bmp", ogg: "audio/ogg", wav: "audio/wav", mp3: "audio/mpeg" }[name.substr(name.lastIndexOf(".") + 1)];
    },
    getUserMedia: function (func) {
        if (!window.getUserMedia) {
            window.getUserMedia = navigator["getUserMedia"] || navigator["mozGetUserMedia"];
        }
        window.getUserMedia(func);
    },
    getMovementX: function (event) {
        return event["movementX"] || event["mozMovementX"] || event["webkitMovementX"] || 0;
    },
    getMovementY: function (event) {
        return event["movementY"] || event["mozMovementY"] || event["webkitMovementY"] || 0;
    },
    getMouseWheelDelta: function (event) {
        var delta = 0;
        switch (event.type) {
            case "DOMMouseScroll":
                delta = event.detail / 3;
                break;
            case "mousewheel":
                delta = event.wheelDelta / 120;
                break;
            case "wheel":
                delta = event.deltaY;
                switch (event.deltaMode) {
                    case 0:
                        delta /= 100;
                        break;
                    case 1:
                        delta /= 3;
                        break;
                    case 2:
                        delta *= 80;
                        break;
                    default:
                        throw "unrecognized mouse wheel delta mode: " + event.deltaMode;
                }
                break;
            default:
                throw "unrecognized mouse wheel event: " + event.type;
        }
        return delta;
    },
    mouseX: 0,
    mouseY: 0,
    mouseMovementX: 0,
    mouseMovementY: 0,
    touches: {},
    lastTouches: {},
    calculateMouseEvent: function (event) {
        if (Browser.pointerLock) {
            if (event.type != "mousemove" && "mozMovementX" in event) {
                Browser.mouseMovementX = Browser.mouseMovementY = 0;
            } else {
                Browser.mouseMovementX = Browser.getMovementX(event);
                Browser.mouseMovementY = Browser.getMovementY(event);
            }
            if (typeof SDL != "undefined") {
                Browser.mouseX = SDL.mouseX + Browser.mouseMovementX;
                Browser.mouseY = SDL.mouseY + Browser.mouseMovementY;
            } else {
                Browser.mouseX += Browser.mouseMovementX;
                Browser.mouseY += Browser.mouseMovementY;
            }
        } else {
            var rect = Module["canvas"].getBoundingClientRect();
            var cw = Module["canvas"].width;
            var ch = Module["canvas"].height;
            var scrollX = typeof window.scrollX !== "undefined" ? window.scrollX : window.pageXOffset;
            var scrollY = typeof window.scrollY !== "undefined" ? window.scrollY : window.pageYOffset;
            if (event.type === "touchstart" || event.type === "touchend" || event.type === "touchmove") {
                var touch = event.touch;
                if (touch === undefined) {
                    return;
                }
                var adjustedX = touch.pageX - (scrollX + rect.left);
                var adjustedY = touch.pageY - (scrollY + rect.top);
                adjustedX = adjustedX * (cw / rect.width);
                adjustedY = adjustedY * (ch / rect.height);
                var coords = { x: adjustedX, y: adjustedY };
                if (event.type === "touchstart") {
                    Browser.lastTouches[touch.identifier] = coords;
                    Browser.touches[touch.identifier] = coords;
                } else if (event.type === "touchend" || event.type === "touchmove") {
                    var last = Browser.touches[touch.identifier];
                    if (!last) last = coords;
                    Browser.lastTouches[touch.identifier] = last;
                    Browser.touches[touch.identifier] = coords;
                }
                return;
            }
            var x = event.pageX - (scrollX + rect.left);
            var y = event.pageY - (scrollY + rect.top);
            x = x * (cw / rect.width);
            y = y * (ch / rect.height);
            Browser.mouseMovementX = x - Browser.mouseX;
            Browser.mouseMovementY = y - Browser.mouseY;
            Browser.mouseX = x;
            Browser.mouseY = y;
        }
    },
    asyncLoad: function (url, onload, onerror, noRunDep) {
        var dep = !noRunDep ? getUniqueRunDependency("al " + url) : "";
        readAsync(
            url,
            function (arrayBuffer) {
                assert(arrayBuffer, 'Loading data file "' + url + '" failed (no arrayBuffer).');
                onload(new Uint8Array(arrayBuffer));
                if (dep) removeRunDependency(dep);
            },
            function (event) {
                if (onerror) {
                    onerror();
                } else {
                    throw 'Loading data file "' + url + '" failed.';
                }
            }
        );
        if (dep) addRunDependency(dep);
    },
    resizeListeners: [],
    updateResizeListeners: function () {
        var canvas = Module["canvas"];
        Browser.resizeListeners.forEach(function (listener) {
            listener(canvas.width, canvas.height);
        });
    },
    setCanvasSize: function (width, height, noUpdates) {
        var canvas = Module["canvas"];
        Browser.updateCanvasDimensions(canvas, width, height);
        if (!noUpdates) Browser.updateResizeListeners();
    },
    windowedWidth: 0,
    windowedHeight: 0,
    setFullscreenCanvasSize: function () {
        if (typeof SDL != "undefined") {
            var flags = HEAPU32[SDL.screen >> 2];
            flags = flags | 8388608;
            HEAP32[SDL.screen >> 2] = flags;
        }
        Browser.updateCanvasDimensions(Module["canvas"]);
        Browser.updateResizeListeners();
    },
    setWindowedCanvasSize: function () {
        if (typeof SDL != "undefined") {
            var flags = HEAPU32[SDL.screen >> 2];
            flags = flags & ~8388608;
            HEAP32[SDL.screen >> 2] = flags;
        }
        Browser.updateCanvasDimensions(Module["canvas"]);
        Browser.updateResizeListeners();
    },
    updateCanvasDimensions: function (canvas, wNative, hNative) {
        if (wNative && hNative) {
            canvas.widthNative = wNative;
            canvas.heightNative = hNative;
        } else {
            wNative = canvas.widthNative;
            hNative = canvas.heightNative;
        }
        var w = wNative;
        var h = hNative;
        if (Module["forcedAspectRatio"] && Module["forcedAspectRatio"] > 0) {
            if (w / h < Module["forcedAspectRatio"]) {
                w = Math.round(h * Module["forcedAspectRatio"]);
            } else {
                h = Math.round(w / Module["forcedAspectRatio"]);
            }
        }
        if (
            (document["fullscreenElement"] || document["mozFullScreenElement"] || document["msFullscreenElement"] || document["webkitFullscreenElement"] || document["webkitCurrentFullScreenElement"]) === canvas.parentNode &&
            typeof screen != "undefined"
        ) {
            var factor = Math.min(screen.width / w, screen.height / h);
            w = Math.round(w * factor);
            h = Math.round(h * factor);
        }
        if (Browser.resizeCanvas) {
            if (canvas.width != w) canvas.width = w;
            if (canvas.height != h) canvas.height = h;
            if (typeof canvas.style != "undefined") {
                canvas.style.removeProperty("width");
                canvas.style.removeProperty("height");
            }
        } else {
            if (canvas.width != wNative) canvas.width = wNative;
            if (canvas.height != hNative) canvas.height = hNative;
            if (typeof canvas.style != "undefined") {
                if (w != wNative || h != hNative) {
                    canvas.style.setProperty("width", w + "px", "important");
                    canvas.style.setProperty("height", h + "px", "important");
                } else {
                    canvas.style.removeProperty("width");
                    canvas.style.removeProperty("height");
                }
            }
        }
    },
    wgetRequests: {},
    nextWgetRequestHandle: 0,
    getNextWgetRequestHandle: function () {
        var handle = Browser.nextWgetRequestHandle;
        Browser.nextWgetRequestHandle++;
        return handle;
    },
};
var EmterpreterAsync = {
    initted: false,
    state: 0,
    saveStack: "",
    yieldCallbacks: [],
    postAsync: null,
    restartFunc: null,
    asyncFinalizers: [],
    ensureInit: function () {
        if (this.initted) return;
        this.initted = true;
    },
    setState: function (s) {
        this.ensureInit();
        this.state = s;
        Module["setAsyncState"](s);
    },
    handle: function (doAsyncOp, yieldDuring) {
        noExitRuntime = true;
        if (EmterpreterAsync.state === 0) {
            var stack = new Int32Array(HEAP32.subarray(EMTSTACKTOP >> 2, Module["emtStackSave"]() >> 2));
            var resumedCallbacksForYield = false;
            function resumeCallbacksForYield() {
                if (resumedCallbacksForYield) return;
                resumedCallbacksForYield = true;
                EmterpreterAsync.yieldCallbacks.forEach(function (func) {
                    func();
                });
                Browser.resumeAsyncCallbacks();
            }
            var callingDoAsyncOp = 1;
            doAsyncOp(function resume(post) {
                if (ABORT) {
                    return;
                }
                if (callingDoAsyncOp) {
                    assert(callingDoAsyncOp === 1);
                    callingDoAsyncOp++;
                    setTimeout(function () {
                        resume(post);
                    }, 0);
                    return;
                }
                assert(EmterpreterAsync.state === 1 || EmterpreterAsync.state === 3);
                EmterpreterAsync.setState(3);
                if (yieldDuring) {
                    resumeCallbacksForYield();
                }
                HEAP32.set(stack, EMTSTACKTOP >> 2);
                EmterpreterAsync.setState(2);
                if (Browser.mainLoop.func) {
                    Browser.mainLoop.resume();
                }
                assert(!EmterpreterAsync.postAsync);
                EmterpreterAsync.postAsync = post || null;
                var asyncReturnValue;
                if (!EmterpreterAsync.restartFunc) {
                    Module["emterpret"](stack[0]);
                } else {
                    asyncReturnValue = EmterpreterAsync.restartFunc();
                }
                if (!yieldDuring && EmterpreterAsync.state === 0) {
                    Browser.resumeAsyncCallbacks();
                }
                if (EmterpreterAsync.state === 0) {
                    EmterpreterAsync.restartFunc = null;
                    var asyncFinalizers = EmterpreterAsync.asyncFinalizers;
                    EmterpreterAsync.asyncFinalizers = [];
                    asyncFinalizers.forEach(function (func) {
                        func(asyncReturnValue);
                    });
                }
            });
            callingDoAsyncOp = 0;
            EmterpreterAsync.setState(1);
            if (Browser.mainLoop.func) {
                Browser.mainLoop.pause();
            }
            if (yieldDuring) {
                setTimeout(function () {
                    resumeCallbacksForYield();
                }, 0);
            } else {
                Browser.pauseAsyncCallbacks();
            }
        } else {
            assert(EmterpreterAsync.state === 2);
            EmterpreterAsync.setState(0);
            if (EmterpreterAsync.postAsync) {
                var ret = EmterpreterAsync.postAsync();
                EmterpreterAsync.postAsync = null;
                return ret;
            }
        }
    },
};
function ___syscall118(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD();
        return EmterpreterAsync.handle(function (resume) {
            var mount = stream.node.mount;
            if (!mount.type.syncfs) {
                resume(function () {
                    return 0;
                });
                return;
            }
            mount.type.syncfs(mount, false, function (err) {
                if (err) {
                    resume(function () {
                        return -5;
                    });
                    return;
                }
                resume(function () {
                    return 0;
                });
            });
        });
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall12(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr();
        FS.chdir(path);
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall122(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var buf = SYSCALLS.get();
        if (!buf) return -14;
        var layout = { sysname: 0, nodename: 65, domainname: 325, machine: 260, version: 195, release: 130, __size__: 390 };
        var copyString = function (element, value) {
            var offset = layout[element];
            writeAsciiToMemory(value, buf + offset);
        };
        copyString("sysname", "Emscripten");
        copyString("nodename", "emscripten");
        copyString("release", "1.0");
        copyString("version", "#1");
        copyString("machine", "x86-JS");
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
var PROCINFO = { ppid: 1, pid: 42, sid: 42, pgid: 42 };
function ___syscall132(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var pid = SYSCALLS.get();
        if (pid && pid !== PROCINFO.pid) return -3;
        return PROCINFO.pgid;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall133(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD();
        FS.chdir(stream.path);
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall14(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr(),
            mode = SYSCALLS.get(),
            dev = SYSCALLS.get();
        return SYSCALLS.doMknod(path, mode, dev);
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall140(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            offset_high = SYSCALLS.get(),
            offset_low = SYSCALLS.get(),
            result = SYSCALLS.get(),
            whence = SYSCALLS.get();
        var HIGH_OFFSET = 4294967296;
        var offset = offset_high * HIGH_OFFSET + (offset_low >>> 0);
        var DOUBLE_LIMIT = 9007199254740992;
        if (offset <= -DOUBLE_LIMIT || offset >= DOUBLE_LIMIT) {
            return -75;
        }
        FS.llseek(stream, offset, whence);
        (tempI64 = [
            stream.position >>> 0,
            ((tempDouble = stream.position),
            +Math_abs(tempDouble) >= +1 ? (tempDouble > +0 ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / +4294967296) >>> 0) : 0),
        ]),
            (HEAP32[result >> 2] = tempI64[0]),
            (HEAP32[(result + 4) >> 2] = tempI64[1]);
        if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null;
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall142(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var nfds = SYSCALLS.get(),
            readfds = SYSCALLS.get(),
            writefds = SYSCALLS.get(),
            exceptfds = SYSCALLS.get(),
            timeout = SYSCALLS.get();
        var total = 0;
        var srcReadLow = readfds ? HEAP32[readfds >> 2] : 0,
            srcReadHigh = readfds ? HEAP32[(readfds + 4) >> 2] : 0;
        var srcWriteLow = writefds ? HEAP32[writefds >> 2] : 0,
            srcWriteHigh = writefds ? HEAP32[(writefds + 4) >> 2] : 0;
        var srcExceptLow = exceptfds ? HEAP32[exceptfds >> 2] : 0,
            srcExceptHigh = exceptfds ? HEAP32[(exceptfds + 4) >> 2] : 0;
        var dstReadLow = 0,
            dstReadHigh = 0;
        var dstWriteLow = 0,
            dstWriteHigh = 0;
        var dstExceptLow = 0,
            dstExceptHigh = 0;
        var allLow = (readfds ? HEAP32[readfds >> 2] : 0) | (writefds ? HEAP32[writefds >> 2] : 0) | (exceptfds ? HEAP32[exceptfds >> 2] : 0);
        var allHigh = (readfds ? HEAP32[(readfds + 4) >> 2] : 0) | (writefds ? HEAP32[(writefds + 4) >> 2] : 0) | (exceptfds ? HEAP32[(exceptfds + 4) >> 2] : 0);
        var check = function (fd, low, high, val) {
            return fd < 32 ? low & val : high & val;
        };
        for (var fd = 0; fd < nfds; fd++) {
            var mask = 1 << fd % 32;
            if (!check(fd, allLow, allHigh, mask)) {
                continue;
            }
            var stream = FS.getStream(fd);
            if (!stream) throw new FS.ErrnoError(9);
            var flags = SYSCALLS.DEFAULT_POLLMASK;
            if (stream.stream_ops.poll) {
                flags = stream.stream_ops.poll(stream);
            }
            if (flags & 1 && check(fd, srcReadLow, srcReadHigh, mask)) {
                fd < 32 ? (dstReadLow = dstReadLow | mask) : (dstReadHigh = dstReadHigh | mask);
                total++;
            }
            if (flags & 4 && check(fd, srcWriteLow, srcWriteHigh, mask)) {
                fd < 32 ? (dstWriteLow = dstWriteLow | mask) : (dstWriteHigh = dstWriteHigh | mask);
                total++;
            }
            if (flags & 2 && check(fd, srcExceptLow, srcExceptHigh, mask)) {
                fd < 32 ? (dstExceptLow = dstExceptLow | mask) : (dstExceptHigh = dstExceptHigh | mask);
                total++;
            }
        }
        if (readfds) {
            HEAP32[readfds >> 2] = dstReadLow;
            HEAP32[(readfds + 4) >> 2] = dstReadHigh;
        }
        if (writefds) {
            HEAP32[writefds >> 2] = dstWriteLow;
            HEAP32[(writefds + 4) >> 2] = dstWriteHigh;
        }
        if (exceptfds) {
            HEAP32[exceptfds >> 2] = dstExceptLow;
            HEAP32[(exceptfds + 4) >> 2] = dstExceptHigh;
        }
        return total;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall145(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            iov = SYSCALLS.get(),
            iovcnt = SYSCALLS.get();
        return SYSCALLS.doReadv(stream, iov, iovcnt);
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall147(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var pid = SYSCALLS.get();
        if (pid && pid !== PROCINFO.pid) return -3;
        return PROCINFO.sid;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall148(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD();
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall15(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr(),
            mode = SYSCALLS.get();
        FS.chmod(path, mode);
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall168(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var fds = SYSCALLS.get(),
            nfds = SYSCALLS.get(),
            timeout = SYSCALLS.get();
        var nonzero = 0;
        for (var i = 0; i < nfds; i++) {
            var pollfd = fds + 8 * i;
            var fd = HEAP32[pollfd >> 2];
            var events = HEAP16[(pollfd + 4) >> 1];
            var mask = 32;
            var stream = FS.getStream(fd);
            if (stream) {
                mask = SYSCALLS.DEFAULT_POLLMASK;
                if (stream.stream_ops.poll) {
                    mask = stream.stream_ops.poll(stream);
                }
            }
            mask &= events | 8 | 16;
            if (mask) nonzero++;
            HEAP16[(pollfd + 6) >> 1] = mask;
        }
        return nonzero;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall183(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var buf = SYSCALLS.get(),
            size = SYSCALLS.get();
        if (size === 0) return -22;
        var cwd = FS.cwd();
        var cwdLengthInBytes = lengthBytesUTF8(cwd);
        if (size < cwdLengthInBytes + 1) return -34;
        stringToUTF8(cwd, buf, size);
        return buf;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall194(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var fd = SYSCALLS.get(),
            zero = SYSCALLS.getZero(),
            length = SYSCALLS.get64();
        FS.ftruncate(fd, length);
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall195(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr(),
            buf = SYSCALLS.get();
        return SYSCALLS.doStat(FS.stat, path, buf);
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall196(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr(),
            buf = SYSCALLS.get();
        return SYSCALLS.doStat(FS.lstat, path, buf);
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall197(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            buf = SYSCALLS.get();
        return SYSCALLS.doStat(FS.stat, stream.path, buf);
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall198(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr(),
            owner = SYSCALLS.get(),
            group = SYSCALLS.get();
        FS.chown(path, owner, group);
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall202(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall199(a0, a1) {
    return ___syscall202(a0, a1);
}
function ___syscall20(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        return PROCINFO.pid;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall200(a0, a1) {
    return ___syscall202(a0, a1);
}
function ___syscall201(a0, a1) {
    return ___syscall202(a0, a1);
}
function ___syscall205(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var size = SYSCALLS.get(),
            list = SYSCALLS.get();
        if (size < 1) return -22;
        HEAP32[list >> 2] = 0;
        return 1;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall207(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var fd = SYSCALLS.get(),
            owner = SYSCALLS.get(),
            group = SYSCALLS.get();
        FS.fchown(fd, owner, group);
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall211(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var ruid = SYSCALLS.get(),
            euid = SYSCALLS.get(),
            suid = SYSCALLS.get();
        HEAP32[ruid >> 2] = 0;
        HEAP32[euid >> 2] = 0;
        HEAP32[suid >> 2] = 0;
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall209(a0, a1) {
    return ___syscall211(a0, a1);
}
function ___syscall212(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr(),
            owner = SYSCALLS.get(),
            group = SYSCALLS.get();
        FS.chown(path, owner, group);
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall220(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            dirp = SYSCALLS.get(),
            count = SYSCALLS.get();
        if (!stream.getdents) {
            stream.getdents = FS.readdir(stream.path);
        }
        var struct_size = 280;
        var pos = 0;
        var off = FS.llseek(stream, 0, 1);
        var idx = Math.floor(off / struct_size);
        while (idx < stream.getdents.length && pos + struct_size <= count) {
            var id;
            var type;
            var name = stream.getdents[idx];
            if (name[0] === ".") {
                id = 1;
                type = 4;
            } else {
                var child = FS.lookupNode(stream.node, name);
                id = child.id;
                type = FS.isChrdev(child.mode) ? 2 : FS.isDir(child.mode) ? 4 : FS.isLink(child.mode) ? 10 : 8;
            }
            (tempI64 = [
                id >>> 0,
                ((tempDouble = id), +Math_abs(tempDouble) >= +1 ? (tempDouble > +0 ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / +4294967296) >>> 0) : 0),
            ]),
                (HEAP32[(dirp + pos) >> 2] = tempI64[0]),
                (HEAP32[(dirp + pos + 4) >> 2] = tempI64[1]);
            (tempI64 = [
                ((idx + 1) * struct_size) >>> 0,
                ((tempDouble = (idx + 1) * struct_size),
                +Math_abs(tempDouble) >= +1 ? (tempDouble > +0 ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / +4294967296) >>> 0) : 0),
            ]),
                (HEAP32[(dirp + pos + 8) >> 2] = tempI64[0]),
                (HEAP32[(dirp + pos + 12) >> 2] = tempI64[1]);
            HEAP16[(dirp + pos + 16) >> 1] = 280;
            HEAP8[(dirp + pos + 18) >> 0] = type;
            stringToUTF8(name, dirp + pos + 19, 256);
            pos += struct_size;
            idx += 1;
        }
        FS.llseek(stream, idx * struct_size, 0);
        return pos;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall221(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            cmd = SYSCALLS.get();
        switch (cmd) {
            case 0: {
                var arg = SYSCALLS.get();
                if (arg < 0) {
                    return -22;
                }
                var newStream;
                newStream = FS.open(stream.path, stream.flags, 0, arg);
                return newStream.fd;
            }
            case 1:
            case 2:
                return 0;
            case 3:
                return stream.flags;
            case 4: {
                var arg = SYSCALLS.get();
                stream.flags |= arg;
                return 0;
            }
            case 12: {
                var arg = SYSCALLS.get();
                var offset = 0;
                HEAP16[(arg + offset) >> 1] = 2;
                return 0;
            }
            case 13:
            case 14:
                return 0;
            case 16:
            case 8:
                return -22;
            case 9:
                ___setErrNo(22);
                return -1;
            default: {
                return -22;
            }
        }
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall268(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr(),
            size = SYSCALLS.get(),
            buf = SYSCALLS.get();
        HEAP32[(buf + 4) >> 2] = 4096;
        HEAP32[(buf + 40) >> 2] = 4096;
        HEAP32[(buf + 8) >> 2] = 1e6;
        HEAP32[(buf + 12) >> 2] = 5e5;
        HEAP32[(buf + 16) >> 2] = 5e5;
        HEAP32[(buf + 20) >> 2] = FS.nextInode;
        HEAP32[(buf + 24) >> 2] = 1e6;
        HEAP32[(buf + 28) >> 2] = 42;
        HEAP32[(buf + 44) >> 2] = 2;
        HEAP32[(buf + 36) >> 2] = 255;
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall269(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            size = SYSCALLS.get(),
            buf = SYSCALLS.get();
        return ___syscall([268, 0, size, buf], 0);
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall295(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var dirfd = SYSCALLS.get(),
            path = SYSCALLS.getStr(),
            flags = SYSCALLS.get(),
            mode = SYSCALLS.get();
        path = SYSCALLS.calculateAt(dirfd, path);
        return FS.open(path, flags, mode).fd;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall3(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            buf = SYSCALLS.get(),
            count = SYSCALLS.get();
        return FS.read(stream, HEAP8, buf, count);
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall300(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var dirfd = SYSCALLS.get(),
            path = SYSCALLS.getStr(),
            buf = SYSCALLS.get(),
            flags = SYSCALLS.get();
        var nofollow = flags & 256;
        flags = flags & ~256;
        path = SYSCALLS.calculateAt(dirfd, path);
        return SYSCALLS.doStat(nofollow ? FS.lstat : FS.stat, path, buf);
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall306(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var dirfd = SYSCALLS.get(),
            path = SYSCALLS.getStr(),
            mode = SYSCALLS.get(),
            flags = SYSCALLS.get();
        path = SYSCALLS.calculateAt(dirfd, path);
        FS.chmod(path, mode);
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall33(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr(),
            amode = SYSCALLS.get();
        return SYSCALLS.doAccess(path, amode);
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall331(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        return -38;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall34(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var inc = SYSCALLS.get();
        return -1;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall38(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var old_path = SYSCALLS.getStr(),
            new_path = SYSCALLS.getStr();
        FS.rename(old_path, new_path);
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall39(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr(),
            mode = SYSCALLS.get();
        return SYSCALLS.doMkdir(path, mode);
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall4(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            buf = SYSCALLS.get(),
            count = SYSCALLS.get();
        return FS.write(stream, HEAP8, buf, count);
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall40(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr();
        FS.rmdir(path);
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall41(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var old = SYSCALLS.getStreamFromFD();
        return FS.open(old.path, old.flags, 0).fd;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
var PIPEFS = {
    BUCKET_BUFFER_SIZE: 8192,
    mount: function (mount) {
        return FS.createNode(null, "/", 16384 | 511, 0);
    },
    createPipe: function () {
        var pipe = { buckets: [] };
        pipe.buckets.push({ buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE), offset: 0, roffset: 0 });
        var rName = PIPEFS.nextname();
        var wName = PIPEFS.nextname();
        var rNode = FS.createNode(PIPEFS.root, rName, 4096, 0);
        var wNode = FS.createNode(PIPEFS.root, wName, 4096, 0);
        rNode.pipe = pipe;
        wNode.pipe = pipe;
        var readableStream = FS.createStream({ path: rName, node: rNode, flags: FS.modeStringToFlags("r"), seekable: false, stream_ops: PIPEFS.stream_ops });
        rNode.stream = readableStream;
        var writableStream = FS.createStream({ path: wName, node: wNode, flags: FS.modeStringToFlags("w"), seekable: false, stream_ops: PIPEFS.stream_ops });
        wNode.stream = writableStream;
        return { readable_fd: readableStream.fd, writable_fd: writableStream.fd };
    },
    stream_ops: {
        poll: function (stream) {
            var pipe = stream.node.pipe;
            if ((stream.flags & 2097155) === 1) {
                return 256 | 4;
            } else {
                if (pipe.buckets.length > 0) {
                    for (var i = 0; i < pipe.buckets.length; i++) {
                        var bucket = pipe.buckets[i];
                        if (bucket.offset - bucket.roffset > 0) {
                            return 64 | 1;
                        }
                    }
                }
            }
            return 0;
        },
        ioctl: function (stream, request, varargs) {
            return ERRNO_CODES.EINVAL;
        },
        fsync: function (stream) {
            return ERRNO_CODES.EINVAL;
        },
        read: function (stream, buffer, offset, length, position) {
            var pipe = stream.node.pipe;
            var currentLength = 0;
            for (var i = 0; i < pipe.buckets.length; i++) {
                var bucket = pipe.buckets[i];
                currentLength += bucket.offset - bucket.roffset;
            }
            assert(buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer));
            var data = buffer.subarray(offset, offset + length);
            if (length <= 0) {
                return 0;
            }
            if (currentLength == 0) {
                throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
            }
            var toRead = Math.min(currentLength, length);
            var totalRead = toRead;
            var toRemove = 0;
            for (var i = 0; i < pipe.buckets.length; i++) {
                var currBucket = pipe.buckets[i];
                var bucketSize = currBucket.offset - currBucket.roffset;
                if (toRead <= bucketSize) {
                    var tmpSlice = currBucket.buffer.subarray(currBucket.roffset, currBucket.offset);
                    if (toRead < bucketSize) {
                        tmpSlice = tmpSlice.subarray(0, toRead);
                        currBucket.roffset += toRead;
                    } else {
                        toRemove++;
                    }
                    data.set(tmpSlice);
                    break;
                } else {
                    var tmpSlice = currBucket.buffer.subarray(currBucket.roffset, currBucket.offset);
                    data.set(tmpSlice);
                    data = data.subarray(tmpSlice.byteLength);
                    toRead -= tmpSlice.byteLength;
                    toRemove++;
                }
            }
            if (toRemove && toRemove == pipe.buckets.length) {
                toRemove--;
                pipe.buckets[toRemove].offset = 0;
                pipe.buckets[toRemove].roffset = 0;
            }
            pipe.buckets.splice(0, toRemove);
            return totalRead;
        },
        write: function (stream, buffer, offset, length, position) {
            var pipe = stream.node.pipe;
            assert(buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer));
            var data = buffer.subarray(offset, offset + length);
            var dataLen = data.byteLength;
            if (dataLen <= 0) {
                return 0;
            }
            var currBucket = null;
            if (pipe.buckets.length == 0) {
                currBucket = { buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE), offset: 0, roffset: 0 };
                pipe.buckets.push(currBucket);
            } else {
                currBucket = pipe.buckets[pipe.buckets.length - 1];
            }
            assert(currBucket.offset <= PIPEFS.BUCKET_BUFFER_SIZE);
            var freeBytesInCurrBuffer = PIPEFS.BUCKET_BUFFER_SIZE - currBucket.offset;
            if (freeBytesInCurrBuffer >= dataLen) {
                currBucket.buffer.set(data, currBucket.offset);
                currBucket.offset += dataLen;
                return dataLen;
            } else if (freeBytesInCurrBuffer > 0) {
                currBucket.buffer.set(data.subarray(0, freeBytesInCurrBuffer), currBucket.offset);
                currBucket.offset += freeBytesInCurrBuffer;
                data = data.subarray(freeBytesInCurrBuffer, data.byteLength);
            }
            var numBuckets = (data.byteLength / PIPEFS.BUCKET_BUFFER_SIZE) | 0;
            var remElements = data.byteLength % PIPEFS.BUCKET_BUFFER_SIZE;
            for (var i = 0; i < numBuckets; i++) {
                var newBucket = { buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE), offset: PIPEFS.BUCKET_BUFFER_SIZE, roffset: 0 };
                pipe.buckets.push(newBucket);
                newBucket.buffer.set(data.subarray(0, PIPEFS.BUCKET_BUFFER_SIZE));
                data = data.subarray(PIPEFS.BUCKET_BUFFER_SIZE, data.byteLength);
            }
            if (remElements > 0) {
                var newBucket = { buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE), offset: data.byteLength, roffset: 0 };
                pipe.buckets.push(newBucket);
                newBucket.buffer.set(data);
            }
            return dataLen;
        },
        close: function (stream) {
            var pipe = stream.node.pipe;
            pipe.buckets = null;
        },
    },
    nextname: function () {
        if (!PIPEFS.nextname.current) {
            PIPEFS.nextname.current = 0;
        }
        return "pipe[" + PIPEFS.nextname.current++ + "]";
    },
};
function ___syscall42(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var fdPtr = SYSCALLS.get();
        if (fdPtr == 0) {
            throw new FS.ErrnoError(14);
        }
        var res = PIPEFS.createPipe();
        HEAP32[fdPtr >> 2] = res.readable_fd;
        HEAP32[(fdPtr + 4) >> 2] = res.writable_fd;
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall5(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var pathname = SYSCALLS.getStr(),
            flags = SYSCALLS.get(),
            mode = SYSCALLS.get();
        var stream = FS.open(pathname, flags, mode);
        return stream.fd;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall54(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            op = SYSCALLS.get();
        switch (op) {
            case 21509:
            case 21505: {
                if (!stream.tty) return -25;
                return 0;
            }
            case 21510:
            case 21511:
            case 21512:
            case 21506:
            case 21507:
            case 21508: {
                if (!stream.tty) return -25;
                return 0;
            }
            case 21519: {
                if (!stream.tty) return -25;
                var argp = SYSCALLS.get();
                HEAP32[argp >> 2] = 0;
                return 0;
            }
            case 21520: {
                if (!stream.tty) return -25;
                return -22;
            }
            case 21531: {
                var argp = SYSCALLS.get();
                return FS.ioctl(stream, op, argp);
            }
            case 21523: {
                if (!stream.tty) return -25;
                return 0;
            }
            case 21524: {
                if (!stream.tty) return -25;
                return 0;
            }
            default:
                abort("bad ioctl syscall " + op);
        }
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall57(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var pid = SYSCALLS.get(),
            pgid = SYSCALLS.get();
        if (pid && pid !== PROCINFO.pid) return -3;
        if (pgid && pgid !== PROCINFO.pgid) return -1;
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall6(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD();
        FS.close(stream);
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall60(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var mask = SYSCALLS.get();
        var old = SYSCALLS.umask;
        SYSCALLS.umask = mask;
        return old;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall63(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var old = SYSCALLS.getStreamFromFD(),
            suggestFD = SYSCALLS.get();
        if (old.fd === suggestFD) return suggestFD;
        return SYSCALLS.doDup(old.path, old.flags, suggestFD);
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall64(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        return PROCINFO.ppid;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall66(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall83(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var target = SYSCALLS.getStr(),
            linkpath = SYSCALLS.getStr();
        FS.symlink(target, linkpath);
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall85(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr(),
            buf = SYSCALLS.get(),
            bufsize = SYSCALLS.get();
        return SYSCALLS.doReadlink(path, buf, bufsize);
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall9(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var oldpath = SYSCALLS.get(),
            newpath = SYSCALLS.get();
        return -31;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function __emscripten_syscall_munmap(addr, len) {
    if (addr === -1 || len === 0) {
        return -22;
    }
    var info = SYSCALLS.mappings[addr];
    if (!info) return 0;
    if (len === info.len) {
        var stream = FS.getStream(info.fd);
        SYSCALLS.doMsync(addr, stream, len, info.flags);
        FS.munmap(stream);
        SYSCALLS.mappings[addr] = null;
        if (info.allocated) {
            _free(info.malloc);
        }
    }
    return 0;
}
function ___syscall91(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var addr = SYSCALLS.get(),
            len = SYSCALLS.get();
        return __emscripten_syscall_munmap(addr, len);
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___syscall94(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var fd = SYSCALLS.get(),
            mode = SYSCALLS.get();
        FS.fchmod(fd, mode);
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___unlock() {}
function ___wait() {}
function _fd_write(stream, iov, iovcnt, pnum) {
    try {
        stream = FS.getStream(stream);
        if (!stream) throw new FS.ErrnoError(9);
        var num = SYSCALLS.doWritev(stream, iov, iovcnt);
        HEAP32[pnum >> 2] = num;
        return 0;
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno;
    }
}
function ___wasi_fd_write() {
    return _fd_write.apply(null, arguments);
}
function _exit(status) {
    exit(status);
}
function __exit(a0) {
    return _exit(a0);
}
function _abort() {
    Module["abort"]();
}
function _arc4random() {
    return _rand.apply(null, arguments);
}
var ___tm_formatted = 2607056;
function _tzset() {
    if (_tzset.called) return;
    _tzset.called = true;
    HEAP32[__get_timezone() >> 2] = new Date().getTimezoneOffset() * 60;
    var winter = new Date(2e3, 0, 1);
    var summer = new Date(2e3, 6, 1);
    HEAP32[__get_daylight() >> 2] = Number(winter.getTimezoneOffset() != summer.getTimezoneOffset());
    function extractZone(date) {
        var match = date.toTimeString().match(/\(([A-Za-z ]+)\)$/);
        return match ? match[1] : "GMT";
    }
    var winterName = extractZone(winter);
    var summerName = extractZone(summer);
    var winterNamePtr = allocate(intArrayFromString(winterName), "i8", ALLOC_NORMAL);
    var summerNamePtr = allocate(intArrayFromString(summerName), "i8", ALLOC_NORMAL);
    if (summer.getTimezoneOffset() < winter.getTimezoneOffset()) {
        HEAP32[__get_tzname() >> 2] = winterNamePtr;
        HEAP32[(__get_tzname() + 4) >> 2] = summerNamePtr;
    } else {
        HEAP32[__get_tzname() >> 2] = summerNamePtr;
        HEAP32[(__get_tzname() + 4) >> 2] = winterNamePtr;
    }
}
function _mktime(tmPtr) {
    _tzset();
    var date = new Date(HEAP32[(tmPtr + 20) >> 2] + 1900, HEAP32[(tmPtr + 16) >> 2], HEAP32[(tmPtr + 12) >> 2], HEAP32[(tmPtr + 8) >> 2], HEAP32[(tmPtr + 4) >> 2], HEAP32[tmPtr >> 2], 0);
    var dst = HEAP32[(tmPtr + 32) >> 2];
    var guessedOffset = date.getTimezoneOffset();
    var start = new Date(date.getFullYear(), 0, 1);
    var summerOffset = new Date(2e3, 6, 1).getTimezoneOffset();
    var winterOffset = start.getTimezoneOffset();
    var dstOffset = Math.min(winterOffset, summerOffset);
    if (dst < 0) {
        HEAP32[(tmPtr + 32) >> 2] = Number(summerOffset != winterOffset && dstOffset == guessedOffset);
    } else if (dst > 0 != (dstOffset == guessedOffset)) {
        var nonDstOffset = Math.max(winterOffset, summerOffset);
        var trueOffset = dst > 0 ? dstOffset : nonDstOffset;
        date.setTime(date.getTime() + (trueOffset - guessedOffset) * 6e4);
    }
    HEAP32[(tmPtr + 24) >> 2] = date.getDay();
    var yday = ((date.getTime() - start.getTime()) / (1e3 * 60 * 60 * 24)) | 0;
    HEAP32[(tmPtr + 28) >> 2] = yday;
    return (date.getTime() / 1e3) | 0;
}
function _asctime_r(tmPtr, buf) {
    var date = {
        tm_sec: HEAP32[tmPtr >> 2],
        tm_min: HEAP32[(tmPtr + 4) >> 2],
        tm_hour: HEAP32[(tmPtr + 8) >> 2],
        tm_mday: HEAP32[(tmPtr + 12) >> 2],
        tm_mon: HEAP32[(tmPtr + 16) >> 2],
        tm_year: HEAP32[(tmPtr + 20) >> 2],
        tm_wday: HEAP32[(tmPtr + 24) >> 2],
    };
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var s =
        days[date.tm_wday] +
        " " +
        months[date.tm_mon] +
        (date.tm_mday < 10 ? "  " : " ") +
        date.tm_mday +
        (date.tm_hour < 10 ? " 0" : " ") +
        date.tm_hour +
        (date.tm_min < 10 ? ":0" : ":") +
        date.tm_min +
        (date.tm_sec < 10 ? ":0" : ":") +
        date.tm_sec +
        " " +
        (1900 + date.tm_year) +
        "\n";
    stringToUTF8(s, buf, 26);
    return buf;
}
function _asctime(tmPtr) {
    return _asctime_r(tmPtr, ___tm_formatted);
}
function _chroot(path) {
    ___setErrNo(13);
    return -1;
}
function _clock() {
    if (_clock.start === undefined) _clock.start = Date.now();
    return ((Date.now() - _clock.start) * (1e6 / 1e3)) | 0;
}
function _confstr(name, buf, len) {
    var value;
    switch (name) {
        case 0:
            value = ENV["PATH"] || "/";
            break;
        case 1:
            value = "POSIX_V6_ILP32_OFF32\nPOSIX_V6_ILP32_OFFBIG";
            break;
        case 2:
            value = "glibc 2.14";
            break;
        case 3:
            value = "";
            break;
        case 1118:
        case 1122:
        case 1124:
        case 1125:
        case 1126:
        case 1128:
        case 1129:
        case 1130:
            value = "";
            break;
        case 1116:
        case 1117:
        case 1121:
            value = "-m32";
            break;
        case 1120:
            value = "-m32 -D_LARGEFILE_SOURCE -D_FILE_OFFSET_BITS=64";
            break;
        default:
            ___setErrNo(22);
            return 0;
    }
    if (len == 0 || buf == 0) {
        return value.length + 1;
    } else {
        var length = Math.min(len, value.length);
        for (var i = 0; i < length; i++) {
            HEAP8[(buf + i) >> 0] = value.charCodeAt(i);
        }
        if (len > length) HEAP8[(buf + i++) >> 0] = 0;
        return i;
    }
}
var ___tm_current = 2606992;
var ___tm_timezone = (stringToUTF8("GMT", 2607040, 4), 2607040);
function _localtime_r(time, tmPtr) {
    _tzset();
    var date = new Date(HEAP32[time >> 2] * 1e3);
    HEAP32[tmPtr >> 2] = date.getSeconds();
    HEAP32[(tmPtr + 4) >> 2] = date.getMinutes();
    HEAP32[(tmPtr + 8) >> 2] = date.getHours();
    HEAP32[(tmPtr + 12) >> 2] = date.getDate();
    HEAP32[(tmPtr + 16) >> 2] = date.getMonth();
    HEAP32[(tmPtr + 20) >> 2] = date.getFullYear() - 1900;
    HEAP32[(tmPtr + 24) >> 2] = date.getDay();
    var start = new Date(date.getFullYear(), 0, 1);
    var yday = ((date.getTime() - start.getTime()) / (1e3 * 60 * 60 * 24)) | 0;
    HEAP32[(tmPtr + 28) >> 2] = yday;
    HEAP32[(tmPtr + 36) >> 2] = -(date.getTimezoneOffset() * 60);
    var summerOffset = new Date(2e3, 6, 1).getTimezoneOffset();
    var winterOffset = start.getTimezoneOffset();
    var dst = (summerOffset != winterOffset && date.getTimezoneOffset() == Math.min(winterOffset, summerOffset)) | 0;
    HEAP32[(tmPtr + 32) >> 2] = dst;
    var zonePtr = HEAP32[(__get_tzname() + (dst ? 4 : 0)) >> 2];
    HEAP32[(tmPtr + 40) >> 2] = zonePtr;
    return tmPtr;
}
function _ctime_r(time, buf) {
    var stack = stackSave();
    var rv = _asctime_r(_localtime_r(time, stackAlloc(44)), buf);
    stackRestore(stack);
    return rv;
}
function _ctime(timer) {
    return _ctime_r(timer, ___tm_current);
}
function _dlopen() {
    abort("To use dlopen, you need to use Emscripten's linking support, see https://github.com/emscripten-core/emscripten/wiki/Linking");
}
function _dlclose() {
    return _dlopen.apply(null, arguments);
}
function _dlerror() {
    return _dlopen.apply(null, arguments);
}
function _dlsym() {
    return _dlopen.apply(null, arguments);
}
var EGL = {
    errorCode: 12288,
    defaultDisplayInitialized: false,
    currentContext: 0,
    currentReadSurface: 0,
    currentDrawSurface: 0,
    contextAttributes: { alpha: false, depth: false, stencil: false, antialias: false },
    stringCache: {},
    setErrorCode: function (code) {
        EGL.errorCode = code;
    },
    chooseConfig: function (display, attribList, config, config_size, numConfigs) {
        if (display != 62e3) {
            EGL.setErrorCode(12296);
            return 0;
        }
        if (attribList) {
            for (;;) {
                var param = HEAP32[attribList >> 2];
                if (param == 12321) {
                    var alphaSize = HEAP32[(attribList + 4) >> 2];
                    EGL.contextAttributes.alpha = alphaSize > 0;
                } else if (param == 12325) {
                    var depthSize = HEAP32[(attribList + 4) >> 2];
                    EGL.contextAttributes.depth = depthSize > 0;
                } else if (param == 12326) {
                    var stencilSize = HEAP32[(attribList + 4) >> 2];
                    EGL.contextAttributes.stencil = stencilSize > 0;
                } else if (param == 12337) {
                    var samples = HEAP32[(attribList + 4) >> 2];
                    EGL.contextAttributes.antialias = samples > 0;
                } else if (param == 12338) {
                    var samples = HEAP32[(attribList + 4) >> 2];
                    EGL.contextAttributes.antialias = samples == 1;
                } else if (param == 12544) {
                    var requestedPriority = HEAP32[(attribList + 4) >> 2];
                    EGL.contextAttributes.lowLatency = requestedPriority != 12547;
                } else if (param == 12344) {
                    break;
                }
                attribList += 8;
            }
        }
        if ((!config || !config_size) && !numConfigs) {
            EGL.setErrorCode(12300);
            return 0;
        }
        if (numConfigs) {
            HEAP32[numConfigs >> 2] = 1;
        }
        if (config && config_size > 0) {
            HEAP32[config >> 2] = 62002;
        }
        EGL.setErrorCode(12288);
        return 1;
    },
};
function _eglBindAPI(api) {
    if (api == 12448) {
        EGL.setErrorCode(12288);
        return 1;
    } else {
        EGL.setErrorCode(12300);
        return 0;
    }
}
function _eglChooseConfig(display, attrib_list, configs, config_size, numConfigs) {
    return EGL.chooseConfig(display, attrib_list, configs, config_size, numConfigs);
}
var GL = {
    counter: 1,
    lastError: 0,
    buffers: [],
    mappedBuffers: {},
    programs: [],
    framebuffers: [],
    renderbuffers: [],
    textures: [],
    uniforms: [],
    shaders: [],
    vaos: [],
    contexts: {},
    currentContext: null,
    offscreenCanvases: {},
    timerQueriesEXT: [],
    currArrayBuffer: 0,
    currElementArrayBuffer: 0,
    byteSizeByTypeRoot: 5120,
    byteSizeByType: [1, 1, 2, 2, 4, 4, 4, 2, 3, 4, 8],
    programInfos: {},
    stringCache: {},
    unpackAlignment: 4,
    init: function () {
        GL.createLog2ceilLookup(GL.MAX_TEMP_BUFFER_SIZE);
        GL.miniTempBuffer = new Float32Array(GL.MINI_TEMP_BUFFER_SIZE);
        for (var i = 0; i < GL.MINI_TEMP_BUFFER_SIZE; i++) {
            GL.miniTempBufferViews[i] = GL.miniTempBuffer.subarray(0, i + 1);
        }
    },
    recordError: function recordError(errorCode) {
        if (!GL.lastError) {
            GL.lastError = errorCode;
        }
    },
    getNewId: function (table) {
        var ret = GL.counter++;
        for (var i = table.length; i < ret; i++) {
            table[i] = null;
        }
        return ret;
    },
    MINI_TEMP_BUFFER_SIZE: 256,
    miniTempBuffer: null,
    miniTempBufferViews: [0],
    MAX_TEMP_BUFFER_SIZE: 2097152,
    numTempVertexBuffersPerSize: 64,
    log2ceilLookup: null,
    createLog2ceilLookup: function (maxValue) {
        GL.log2ceilLookup = new Uint8Array(maxValue + 1);
        var log2 = 0;
        var pow2 = 1;
        GL.log2ceilLookup[0] = 0;
        for (var i = 1; i <= maxValue; ++i) {
            if (i > pow2) {
                pow2 <<= 1;
                ++log2;
            }
            GL.log2ceilLookup[i] = log2;
        }
    },
    generateTempBuffers: function (quads, context) {
        var largestIndex = GL.log2ceilLookup[GL.MAX_TEMP_BUFFER_SIZE];
        context.tempVertexBufferCounters1 = [];
        context.tempVertexBufferCounters2 = [];
        context.tempVertexBufferCounters1.length = context.tempVertexBufferCounters2.length = largestIndex + 1;
        context.tempVertexBuffers1 = [];
        context.tempVertexBuffers2 = [];
        context.tempVertexBuffers1.length = context.tempVertexBuffers2.length = largestIndex + 1;
        context.tempIndexBuffers = [];
        context.tempIndexBuffers.length = largestIndex + 1;
        for (var i = 0; i <= largestIndex; ++i) {
            context.tempIndexBuffers[i] = null;
            context.tempVertexBufferCounters1[i] = context.tempVertexBufferCounters2[i] = 0;
            var ringbufferLength = GL.numTempVertexBuffersPerSize;
            context.tempVertexBuffers1[i] = [];
            context.tempVertexBuffers2[i] = [];
            var ringbuffer1 = context.tempVertexBuffers1[i];
            var ringbuffer2 = context.tempVertexBuffers2[i];
            ringbuffer1.length = ringbuffer2.length = ringbufferLength;
            for (var j = 0; j < ringbufferLength; ++j) {
                ringbuffer1[j] = ringbuffer2[j] = null;
            }
        }
        if (quads) {
            context.tempQuadIndexBuffer = GLctx.createBuffer();
            context.GLctx.bindBuffer(context.GLctx.ELEMENT_ARRAY_BUFFER, context.tempQuadIndexBuffer);
            var numIndexes = GL.MAX_TEMP_BUFFER_SIZE >> 1;
            var quadIndexes = new Uint16Array(numIndexes);
            var i = 0,
                v = 0;
            while (1) {
                quadIndexes[i++] = v;
                if (i >= numIndexes) break;
                quadIndexes[i++] = v + 1;
                if (i >= numIndexes) break;
                quadIndexes[i++] = v + 2;
                if (i >= numIndexes) break;
                quadIndexes[i++] = v;
                if (i >= numIndexes) break;
                quadIndexes[i++] = v + 2;
                if (i >= numIndexes) break;
                quadIndexes[i++] = v + 3;
                if (i >= numIndexes) break;
                v += 4;
            }
            context.GLctx.bufferData(context.GLctx.ELEMENT_ARRAY_BUFFER, quadIndexes, context.GLctx.STATIC_DRAW);
            context.GLctx.bindBuffer(context.GLctx.ELEMENT_ARRAY_BUFFER, null);
        }
    },
    getTempVertexBuffer: function getTempVertexBuffer(sizeBytes) {
        var idx = GL.log2ceilLookup[sizeBytes];
        var ringbuffer = GL.currentContext.tempVertexBuffers1[idx];
        var nextFreeBufferIndex = GL.currentContext.tempVertexBufferCounters1[idx];
        GL.currentContext.tempVertexBufferCounters1[idx] = (GL.currentContext.tempVertexBufferCounters1[idx] + 1) & (GL.numTempVertexBuffersPerSize - 1);
        var vbo = ringbuffer[nextFreeBufferIndex];
        if (vbo) {
            return vbo;
        }
        var prevVBO = GLctx.getParameter(GLctx.ARRAY_BUFFER_BINDING);
        ringbuffer[nextFreeBufferIndex] = GLctx.createBuffer();
        GLctx.bindBuffer(GLctx.ARRAY_BUFFER, ringbuffer[nextFreeBufferIndex]);
        GLctx.bufferData(GLctx.ARRAY_BUFFER, 1 << idx, GLctx.DYNAMIC_DRAW);
        GLctx.bindBuffer(GLctx.ARRAY_BUFFER, prevVBO);
        return ringbuffer[nextFreeBufferIndex];
    },
    getTempIndexBuffer: function getTempIndexBuffer(sizeBytes) {
        var idx = GL.log2ceilLookup[sizeBytes];
        var ibo = GL.currentContext.tempIndexBuffers[idx];
        if (ibo) {
            return ibo;
        }
        var prevIBO = GLctx.getParameter(GLctx.ELEMENT_ARRAY_BUFFER_BINDING);
        GL.currentContext.tempIndexBuffers[idx] = GLctx.createBuffer();
        GLctx.bindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, GL.currentContext.tempIndexBuffers[idx]);
        GLctx.bufferData(GLctx.ELEMENT_ARRAY_BUFFER, 1 << idx, GLctx.DYNAMIC_DRAW);
        GLctx.bindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, prevIBO);
        return GL.currentContext.tempIndexBuffers[idx];
    },
    newRenderingFrameStarted: function newRenderingFrameStarted() {
        if (!GL.currentContext) {
            return;
        }
        var vb = GL.currentContext.tempVertexBuffers1;
        GL.currentContext.tempVertexBuffers1 = GL.currentContext.tempVertexBuffers2;
        GL.currentContext.tempVertexBuffers2 = vb;
        vb = GL.currentContext.tempVertexBufferCounters1;
        GL.currentContext.tempVertexBufferCounters1 = GL.currentContext.tempVertexBufferCounters2;
        GL.currentContext.tempVertexBufferCounters2 = vb;
        var largestIndex = GL.log2ceilLookup[GL.MAX_TEMP_BUFFER_SIZE];
        for (var i = 0; i <= largestIndex; ++i) {
            GL.currentContext.tempVertexBufferCounters1[i] = 0;
        }
    },
    getSource: function (shader, count, string, length) {
        var source = "";
        for (var i = 0; i < count; ++i) {
            var len = length ? HEAP32[(length + i * 4) >> 2] : -1;
            source += UTF8ToString(HEAP32[(string + i * 4) >> 2], len < 0 ? undefined : len);
        }
        return source;
    },
    calcBufLength: function calcBufLength(size, type, stride, count) {
        if (stride > 0) {
            return count * stride;
        }
        var typeSize = GL.byteSizeByType[type - GL.byteSizeByTypeRoot];
        return size * typeSize * count;
    },
    usedTempBuffers: [],
    preDrawHandleClientVertexAttribBindings: function preDrawHandleClientVertexAttribBindings(count) {
        GL.resetBufferBinding = false;
        for (var i = 0; i < GL.currentContext.maxVertexAttribs; ++i) {
            var cb = GL.currentContext.clientBuffers[i];
            if (!cb.clientside || !cb.enabled) continue;
            GL.resetBufferBinding = true;
            var size = GL.calcBufLength(cb.size, cb.type, cb.stride, count);
            var buf = GL.getTempVertexBuffer(size);
            GLctx.bindBuffer(GLctx.ARRAY_BUFFER, buf);
            GLctx.bufferSubData(GLctx.ARRAY_BUFFER, 0, HEAPU8.subarray(cb.ptr, cb.ptr + size));
            cb.vertexAttribPointerAdaptor.call(GLctx, i, cb.size, cb.type, cb.normalized, cb.stride, 0);
        }
    },
    postDrawHandleClientVertexAttribBindings: function postDrawHandleClientVertexAttribBindings() {
        if (GL.resetBufferBinding) {
            GLctx.bindBuffer(GLctx.ARRAY_BUFFER, GL.buffers[GL.currArrayBuffer]);
        }
    },
    createContext: function (canvas, webGLContextAttributes) {
        var ctx = canvas.getContext("webgl", webGLContextAttributes) || canvas.getContext("experimental-webgl", webGLContextAttributes);
        if (!ctx) return 0;
        var handle = GL.registerContext(ctx, webGLContextAttributes);
        return handle;
    },
    registerContext: function (ctx, webGLContextAttributes) {
        var handle = _malloc(8);
        var context = { handle: handle, attributes: webGLContextAttributes, version: webGLContextAttributes.majorVersion, GLctx: ctx };
        if (ctx.canvas) ctx.canvas.GLctxObject = context;
        GL.contexts[handle] = context;
        if (typeof webGLContextAttributes.enableExtensionsByDefault === "undefined" || webGLContextAttributes.enableExtensionsByDefault) {
            GL.initExtensions(context);
        }
        context.maxVertexAttribs = context.GLctx.getParameter(context.GLctx.MAX_VERTEX_ATTRIBS);
        context.clientBuffers = [];
        for (var i = 0; i < context.maxVertexAttribs; i++) {
            context.clientBuffers[i] = { enabled: false, clientside: false, size: 0, type: 0, normalized: 0, stride: 0, ptr: 0, vertexAttribPointerAdaptor: null };
        }
        GL.generateTempBuffers(false, context);
        return handle;
    },
    makeContextCurrent: function (contextHandle) {
        GL.currentContext = GL.contexts[contextHandle];
        Module.ctx = GLctx = GL.currentContext && GL.currentContext.GLctx;
        return !(contextHandle && !GLctx);
    },
    getContext: function (contextHandle) {
        return GL.contexts[contextHandle];
    },
    deleteContext: function (contextHandle) {
        if (GL.currentContext === GL.contexts[contextHandle]) GL.currentContext = null;
        if (typeof JSEvents === "object") JSEvents.removeAllHandlersOnTarget(GL.contexts[contextHandle].GLctx.canvas);
        if (GL.contexts[contextHandle] && GL.contexts[contextHandle].GLctx.canvas) GL.contexts[contextHandle].GLctx.canvas.GLctxObject = undefined;
        _free(GL.contexts[contextHandle]);
        GL.contexts[contextHandle] = null;
    },
    acquireInstancedArraysExtension: function (ctx) {
        var ext = ctx.getExtension("ANGLE_instanced_arrays");
        if (ext) {
            ctx["vertexAttribDivisor"] = function (index, divisor) {
                ext["vertexAttribDivisorANGLE"](index, divisor);
            };
            ctx["drawArraysInstanced"] = function (mode, first, count, primcount) {
                ext["drawArraysInstancedANGLE"](mode, first, count, primcount);
            };
            ctx["drawElementsInstanced"] = function (mode, count, type, indices, primcount) {
                ext["drawElementsInstancedANGLE"](mode, count, type, indices, primcount);
            };
        }
    },
    acquireVertexArrayObjectExtension: function (ctx) {
        var ext = ctx.getExtension("OES_vertex_array_object");
        if (ext) {
            ctx["createVertexArray"] = function () {
                return ext["createVertexArrayOES"]();
            };
            ctx["deleteVertexArray"] = function (vao) {
                ext["deleteVertexArrayOES"](vao);
            };
            ctx["bindVertexArray"] = function (vao) {
                ext["bindVertexArrayOES"](vao);
            };
            ctx["isVertexArray"] = function (vao) {
                return ext["isVertexArrayOES"](vao);
            };
        }
    },
    acquireDrawBuffersExtension: function (ctx) {
        var ext = ctx.getExtension("WEBGL_draw_buffers");
        if (ext) {
            ctx["drawBuffers"] = function (n, bufs) {
                ext["drawBuffersWEBGL"](n, bufs);
            };
        }
    },
    initExtensions: function (context) {
        if (!context) context = GL.currentContext;
        if (context.initExtensionsDone) return;
        context.initExtensionsDone = true;
        var GLctx = context.GLctx;
        if (context.version < 2) {
            GL.acquireInstancedArraysExtension(GLctx);
            GL.acquireVertexArrayObjectExtension(GLctx);
            GL.acquireDrawBuffersExtension(GLctx);
        }
        GLctx.disjointTimerQueryExt = GLctx.getExtension("EXT_disjoint_timer_query");
        var automaticallyEnabledExtensions = [
            "OES_texture_float",
            "OES_texture_half_float",
            "OES_standard_derivatives",
            "OES_vertex_array_object",
            "WEBGL_compressed_texture_s3tc",
            "WEBGL_depth_texture",
            "OES_element_index_uint",
            "EXT_texture_filter_anisotropic",
            "EXT_frag_depth",
            "WEBGL_draw_buffers",
            "ANGLE_instanced_arrays",
            "OES_texture_float_linear",
            "OES_texture_half_float_linear",
            "EXT_blend_minmax",
            "EXT_shader_texture_lod",
            "WEBGL_compressed_texture_pvrtc",
            "EXT_color_buffer_half_float",
            "WEBGL_color_buffer_float",
            "EXT_sRGB",
            "WEBGL_compressed_texture_etc1",
            "EXT_disjoint_timer_query",
            "WEBGL_compressed_texture_etc",
            "WEBGL_compressed_texture_astc",
            "EXT_color_buffer_float",
            "WEBGL_compressed_texture_s3tc_srgb",
            "EXT_disjoint_timer_query_webgl2",
        ];
        var exts = GLctx.getSupportedExtensions() || [];
        exts.forEach(function (ext) {
            if (automaticallyEnabledExtensions.indexOf(ext) != -1) {
                GLctx.getExtension(ext);
            }
        });
    },
    populateUniformTable: function (program) {
        var p = GL.programs[program];
        var ptable = (GL.programInfos[program] = { uniforms: {}, maxUniformLength: 0, maxAttributeLength: -1, maxUniformBlockNameLength: -1 });
        var utable = ptable.uniforms;
        var numUniforms = GLctx.getProgramParameter(p, 35718);
        for (var i = 0; i < numUniforms; ++i) {
            var u = GLctx.getActiveUniform(p, i);
            var name = u.name;
            ptable.maxUniformLength = Math.max(ptable.maxUniformLength, name.length + 1);
            if (name.slice(-1) == "]") {
                name = name.slice(0, name.lastIndexOf("["));
            }
            var loc = GLctx.getUniformLocation(p, name);
            if (loc) {
                var id = GL.getNewId(GL.uniforms);
                utable[name] = [u.size, id];
                GL.uniforms[id] = loc;
                for (var j = 1; j < u.size; ++j) {
                    var n = name + "[" + j + "]";
                    loc = GLctx.getUniformLocation(p, n);
                    id = GL.getNewId(GL.uniforms);
                    GL.uniforms[id] = loc;
                }
            }
        }
    },
};
function _eglCreateContext(display, config, hmm, contextAttribs) {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0;
    }
    var glesContextVersion = 1;
    for (;;) {
        var param = HEAP32[contextAttribs >> 2];
        if (param == 12440) {
            glesContextVersion = HEAP32[(contextAttribs + 4) >> 2];
        } else if (param == 12344) {
            break;
        } else {
            EGL.setErrorCode(12292);
            return 0;
        }
        contextAttribs += 8;
    }
    if (glesContextVersion != 2) {
        EGL.setErrorCode(12293);
        return 0;
    }
    EGL.contextAttributes.majorVersion = glesContextVersion - 1;
    EGL.contextAttributes.minorVersion = 0;
    EGL.context = GL.createContext(Module["canvas"], EGL.contextAttributes);
    if (EGL.context != 0) {
        EGL.setErrorCode(12288);
        GL.makeContextCurrent(EGL.context);
        Module.useWebGL = true;
        Browser.moduleContextCreatedCallbacks.forEach(function (callback) {
            callback();
        });
        GL.makeContextCurrent(null);
        return 62004;
    } else {
        EGL.setErrorCode(12297);
        return 0;
    }
}
function _eglCreateWindowSurface(display, config, win, attrib_list) {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0;
    }
    if (config != 62002) {
        EGL.setErrorCode(12293);
        return 0;
    }
    EGL.setErrorCode(12288);
    return 62006;
}
function _eglDestroyContext(display, context) {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0;
    }
    if (context != 62004) {
        EGL.setErrorCode(12294);
        return 0;
    }
    GL.deleteContext(EGL.context);
    EGL.setErrorCode(12288);
    if (EGL.currentContext == context) {
        EGL.currentContext = 0;
    }
    return 1;
}
function _eglDestroySurface(display, surface) {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0;
    }
    if (surface != 62006) {
        EGL.setErrorCode(12301);
        return 1;
    }
    if (EGL.currentReadSurface == surface) {
        EGL.currentReadSurface = 0;
    }
    if (EGL.currentDrawSurface == surface) {
        EGL.currentDrawSurface = 0;
    }
    EGL.setErrorCode(12288);
    return 1;
}
function _eglGetConfigAttrib(display, config, attribute, value) {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0;
    }
    if (config != 62002) {
        EGL.setErrorCode(12293);
        return 0;
    }
    if (!value) {
        EGL.setErrorCode(12300);
        return 0;
    }
    EGL.setErrorCode(12288);
    switch (attribute) {
        case 12320:
            HEAP32[value >> 2] = EGL.contextAttributes.alpha ? 32 : 24;
            return 1;
        case 12321:
            HEAP32[value >> 2] = EGL.contextAttributes.alpha ? 8 : 0;
            return 1;
        case 12322:
            HEAP32[value >> 2] = 8;
            return 1;
        case 12323:
            HEAP32[value >> 2] = 8;
            return 1;
        case 12324:
            HEAP32[value >> 2] = 8;
            return 1;
        case 12325:
            HEAP32[value >> 2] = EGL.contextAttributes.depth ? 24 : 0;
            return 1;
        case 12326:
            HEAP32[value >> 2] = EGL.contextAttributes.stencil ? 8 : 0;
            return 1;
        case 12327:
            HEAP32[value >> 2] = 12344;
            return 1;
        case 12328:
            HEAP32[value >> 2] = 62002;
            return 1;
        case 12329:
            HEAP32[value >> 2] = 0;
            return 1;
        case 12330:
            HEAP32[value >> 2] = 4096;
            return 1;
        case 12331:
            HEAP32[value >> 2] = 16777216;
            return 1;
        case 12332:
            HEAP32[value >> 2] = 4096;
            return 1;
        case 12333:
            HEAP32[value >> 2] = 0;
            return 1;
        case 12334:
            HEAP32[value >> 2] = 0;
            return 1;
        case 12335:
            HEAP32[value >> 2] = 12344;
            return 1;
        case 12337:
            HEAP32[value >> 2] = EGL.contextAttributes.antialias ? 4 : 0;
            return 1;
        case 12338:
            HEAP32[value >> 2] = EGL.contextAttributes.antialias ? 1 : 0;
            return 1;
        case 12339:
            HEAP32[value >> 2] = 4;
            return 1;
        case 12340:
            HEAP32[value >> 2] = 12344;
            return 1;
        case 12341:
        case 12342:
        case 12343:
            HEAP32[value >> 2] = -1;
            return 1;
        case 12345:
        case 12346:
            HEAP32[value >> 2] = 0;
            return 1;
        case 12347:
            HEAP32[value >> 2] = 0;
            return 1;
        case 12348:
            HEAP32[value >> 2] = 1;
            return 1;
        case 12349:
        case 12350:
            HEAP32[value >> 2] = 0;
            return 1;
        case 12351:
            HEAP32[value >> 2] = 12430;
            return 1;
        case 12352:
            HEAP32[value >> 2] = 4;
            return 1;
        case 12354:
            HEAP32[value >> 2] = 0;
            return 1;
        default:
            EGL.setErrorCode(12292);
            return 0;
    }
}
function _eglGetDisplay(nativeDisplayType) {
    EGL.setErrorCode(12288);
    return 62e3;
}
function _eglGetError() {
    return EGL.errorCode;
}
function _eglGetProcAddress(name_) {
    return _emscripten_GetProcAddress(name_);
}
function _eglInitialize(display, majorVersion, minorVersion) {
    if (display == 62e3) {
        if (majorVersion) {
            HEAP32[majorVersion >> 2] = 1;
        }
        if (minorVersion) {
            HEAP32[minorVersion >> 2] = 4;
        }
        EGL.defaultDisplayInitialized = true;
        EGL.setErrorCode(12288);
        return 1;
    } else {
        EGL.setErrorCode(12296);
        return 0;
    }
}
function _eglMakeCurrent(display, draw, read, context) {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0;
    }
    if (context != 0 && context != 62004) {
        EGL.setErrorCode(12294);
        return 0;
    }
    if ((read != 0 && read != 62006) || (draw != 0 && draw != 62006)) {
        EGL.setErrorCode(12301);
        return 0;
    }
    GL.makeContextCurrent(context ? EGL.context : null);
    EGL.currentContext = context;
    EGL.currentDrawSurface = draw;
    EGL.currentReadSurface = read;
    EGL.setErrorCode(12288);
    return 1;
}
function _eglQueryString(display, name) {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0;
    }
    EGL.setErrorCode(12288);
    if (EGL.stringCache[name]) return EGL.stringCache[name];
    var ret;
    switch (name) {
        case 12371:
            ret = allocate(intArrayFromString("Emscripten"), "i8", ALLOC_NORMAL);
            break;
        case 12372:
            ret = allocate(intArrayFromString("1.4 Emscripten EGL"), "i8", ALLOC_NORMAL);
            break;
        case 12373:
            ret = allocate(intArrayFromString(""), "i8", ALLOC_NORMAL);
            break;
        case 12429:
            ret = allocate(intArrayFromString("OpenGL_ES"), "i8", ALLOC_NORMAL);
            break;
        default:
            EGL.setErrorCode(12300);
            return 0;
    }
    EGL.stringCache[name] = ret;
    return ret;
}
function _eglSwapBuffers() {
    if (!EGL.defaultDisplayInitialized) {
        EGL.setErrorCode(12289);
    } else if (!Module.ctx) {
        EGL.setErrorCode(12290);
    } else if (Module.ctx.isContextLost()) {
        EGL.setErrorCode(12302);
    } else {
        EGL.setErrorCode(12288);
        return 1;
    }
    return 0;
}
function _eglSwapInterval(display, interval) {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0;
    }
    if (interval == 0) _emscripten_set_main_loop_timing(0, 0);
    else _emscripten_set_main_loop_timing(1, interval);
    EGL.setErrorCode(12288);
    return 1;
}
function _eglTerminate(display) {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0;
    }
    EGL.currentContext = 0;
    EGL.currentReadSurface = 0;
    EGL.currentDrawSurface = 0;
    EGL.defaultDisplayInitialized = false;
    EGL.setErrorCode(12288);
    return 1;
}
function _eglWaitClient() {
    EGL.setErrorCode(12288);
    return 1;
}
function _eglWaitGL() {
    return _eglWaitClient.apply(null, arguments);
}
function _eglWaitNative(nativeEngineId) {
    EGL.setErrorCode(12288);
    return 1;
}
function _emscripten_async_call(func, arg, millis) {
    noExitRuntime = true;
    function wrapper() {
        getFuncWrapper(func, "vi")(arg);
    }
    if (millis >= 0) {
        Browser.safeSetTimeout(wrapper, millis);
    } else {
        Browser.safeRequestAnimationFrame(wrapper);
    }
}
var JSEvents = {
    keyEvent: 0,
    mouseEvent: 0,
    wheelEvent: 0,
    uiEvent: 0,
    focusEvent: 0,
    deviceOrientationEvent: 0,
    deviceMotionEvent: 0,
    fullscreenChangeEvent: 0,
    pointerlockChangeEvent: 0,
    visibilityChangeEvent: 0,
    touchEvent: 0,
    previousFullscreenElement: null,
    previousScreenX: null,
    previousScreenY: null,
    removeEventListenersRegistered: false,
    removeAllEventListeners: function () {
        for (var i = JSEvents.eventHandlers.length - 1; i >= 0; --i) {
            JSEvents._removeHandler(i);
        }
        JSEvents.eventHandlers = [];
        JSEvents.deferredCalls = [];
    },
    registerRemoveEventListeners: function () {
        if (!JSEvents.removeEventListenersRegistered) {
            __ATEXIT__.push(JSEvents.removeAllEventListeners);
            JSEvents.removeEventListenersRegistered = true;
        }
    },
    deferredCalls: [],
    deferCall: function (targetFunction, precedence, argsList) {
        function arraysHaveEqualContent(arrA, arrB) {
            if (arrA.length != arrB.length) return false;
            for (var i in arrA) {
                if (arrA[i] != arrB[i]) return false;
            }
            return true;
        }
        for (var i in JSEvents.deferredCalls) {
            var call = JSEvents.deferredCalls[i];
            if (call.targetFunction == targetFunction && arraysHaveEqualContent(call.argsList, argsList)) {
                return;
            }
        }
        JSEvents.deferredCalls.push({ targetFunction: targetFunction, precedence: precedence, argsList: argsList });
        JSEvents.deferredCalls.sort(function (x, y) {
            return x.precedence < y.precedence;
        });
    },
    removeDeferredCalls: function (targetFunction) {
        for (var i = 0; i < JSEvents.deferredCalls.length; ++i) {
            if (JSEvents.deferredCalls[i].targetFunction == targetFunction) {
                JSEvents.deferredCalls.splice(i, 1);
                --i;
            }
        }
    },
    canPerformEventHandlerRequests: function () {
        return JSEvents.inEventHandler && JSEvents.currentEventHandler.allowsDeferredCalls;
    },
    runDeferredCalls: function () {
        if (!JSEvents.canPerformEventHandlerRequests()) {
            return;
        }
        for (var i = 0; i < JSEvents.deferredCalls.length; ++i) {
            var call = JSEvents.deferredCalls[i];
            JSEvents.deferredCalls.splice(i, 1);
            --i;
            call.targetFunction.apply(this, call.argsList);
        }
    },
    inEventHandler: 0,
    currentEventHandler: null,
    eventHandlers: [],
    isInternetExplorer: function () {
        return navigator.userAgent.indexOf("MSIE") !== -1 || navigator.appVersion.indexOf("Trident/") > 0;
    },
    removeAllHandlersOnTarget: function (target, eventTypeString) {
        for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
            if (JSEvents.eventHandlers[i].target == target && (!eventTypeString || eventTypeString == JSEvents.eventHandlers[i].eventTypeString)) {
                JSEvents._removeHandler(i--);
            }
        }
    },
    _removeHandler: function (i) {
        var h = JSEvents.eventHandlers[i];
        h.target.removeEventListener(h.eventTypeString, h.eventListenerFunc, h.useCapture);
        JSEvents.eventHandlers.splice(i, 1);
    },
    registerOrRemoveHandler: function (eventHandler) {
        var jsEventHandler = function jsEventHandler(event) {
            ++JSEvents.inEventHandler;
            JSEvents.currentEventHandler = eventHandler;
            JSEvents.runDeferredCalls();
            eventHandler.handlerFunc(event);
            JSEvents.runDeferredCalls();
            --JSEvents.inEventHandler;
        };
        if (eventHandler.callbackfunc) {
            eventHandler.eventListenerFunc = jsEventHandler;
            eventHandler.target.addEventListener(eventHandler.eventTypeString, jsEventHandler, eventHandler.useCapture);
            JSEvents.eventHandlers.push(eventHandler);
            JSEvents.registerRemoveEventListeners();
        } else {
            for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
                if (JSEvents.eventHandlers[i].target == eventHandler.target && JSEvents.eventHandlers[i].eventTypeString == eventHandler.eventTypeString) {
                    JSEvents._removeHandler(i--);
                }
            }
        }
    },
    getBoundingClientRectOrZeros: function (target) {
        return target.getBoundingClientRect ? target.getBoundingClientRect() : { left: 0, top: 0 };
    },
    pageScrollPos: function () {
        if (pageXOffset > 0 || pageYOffset > 0) {
            return [pageXOffset, pageYOffset];
        }
        if (typeof document.documentElement.scrollLeft !== "undefined" || typeof document.documentElement.scrollTop !== "undefined") {
            return [document.documentElement.scrollLeft, document.documentElement.scrollTop];
        }
        return [document.body.scrollLeft | 0, document.body.scrollTop | 0];
    },
    getNodeNameForTarget: function (target) {
        if (!target) return "";
        if (target == window) return "#window";
        if (target == screen) return "#screen";
        return target && target.nodeName ? target.nodeName : "";
    },
    tick: function () {
        if (window["performance"] && window["performance"]["now"]) return window["performance"]["now"]();
        else return Date.now();
    },
    fullscreenEnabled: function () {
        return document.fullscreenEnabled || document.mozFullScreenEnabled || document.webkitFullscreenEnabled || document.msFullscreenEnabled;
    },
};
var __currentFullscreenStrategy = {};
var __specialEventTargets = [0, document, window];
function __findEventTarget(target) {
    try {
        if (!target) return window;
        if (typeof target === "number") target = __specialEventTargets[target] || UTF8ToString(target);
        if (target === "#window") return window;
        else if (target === "#document") return document;
        else if (target === "#screen") return screen;
        else if (target === "#canvas") return Module["canvas"];
        return typeof target === "string" ? document.getElementById(target) : target;
    } catch (e) {
        return null;
    }
}
function __findCanvasEventTarget(target) {
    if (typeof target === "number") target = UTF8ToString(target);
    if (!target || target === "#canvas") {
        if (typeof GL !== "undefined" && GL.offscreenCanvases["canvas"]) return GL.offscreenCanvases["canvas"];
        return Module["canvas"];
    }
    if (typeof GL !== "undefined" && GL.offscreenCanvases[target]) return GL.offscreenCanvases[target];
    return __findEventTarget(target);
}
function _emscripten_get_canvas_element_size(target, width, height) {
    var canvas = __findCanvasEventTarget(target);
    if (!canvas) return -4;
    HEAP32[width >> 2] = canvas.width;
    HEAP32[height >> 2] = canvas.height;
}
function __get_canvas_element_size(target) {
    var stackTop = stackSave();
    var w = stackAlloc(8);
    var h = w + 4;
    var targetInt = stackAlloc(target.id.length + 1);
    stringToUTF8(target.id, targetInt, target.id.length + 1);
    var ret = _emscripten_get_canvas_element_size(targetInt, w, h);
    var size = [HEAP32[w >> 2], HEAP32[h >> 2]];
    stackRestore(stackTop);
    return size;
}
function _emscripten_set_canvas_element_size(target, width, height) {
    var canvas = __findCanvasEventTarget(target);
    if (!canvas) return -4;
    canvas.width = width;
    canvas.height = height;
    return 0;
}
function __set_canvas_element_size(target, width, height) {
    if (!target.controlTransferredOffscreen) {
        target.width = width;
        target.height = height;
    } else {
        var stackTop = stackSave();
        var targetInt = stackAlloc(target.id.length + 1);
        stringToUTF8(target.id, targetInt, target.id.length + 1);
        _emscripten_set_canvas_element_size(targetInt, width, height);
        stackRestore(stackTop);
    }
}
function __registerRestoreOldStyle(canvas) {
    var canvasSize = __get_canvas_element_size(canvas);
    var oldWidth = canvasSize[0];
    var oldHeight = canvasSize[1];
    var oldCssWidth = canvas.style.width;
    var oldCssHeight = canvas.style.height;
    var oldBackgroundColor = canvas.style.backgroundColor;
    var oldDocumentBackgroundColor = document.body.style.backgroundColor;
    var oldPaddingLeft = canvas.style.paddingLeft;
    var oldPaddingRight = canvas.style.paddingRight;
    var oldPaddingTop = canvas.style.paddingTop;
    var oldPaddingBottom = canvas.style.paddingBottom;
    var oldMarginLeft = canvas.style.marginLeft;
    var oldMarginRight = canvas.style.marginRight;
    var oldMarginTop = canvas.style.marginTop;
    var oldMarginBottom = canvas.style.marginBottom;
    var oldDocumentBodyMargin = document.body.style.margin;
    var oldDocumentOverflow = document.documentElement.style.overflow;
    var oldDocumentScroll = document.body.scroll;
    var oldImageRendering = canvas.style.imageRendering;
    function restoreOldStyle() {
        var fullscreenElement = document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
        if (!fullscreenElement) {
            document.removeEventListener("fullscreenchange", restoreOldStyle);
            document.removeEventListener("mozfullscreenchange", restoreOldStyle);
            document.removeEventListener("webkitfullscreenchange", restoreOldStyle);
            document.removeEventListener("MSFullscreenChange", restoreOldStyle);
            __set_canvas_element_size(canvas, oldWidth, oldHeight);
            canvas.style.width = oldCssWidth;
            canvas.style.height = oldCssHeight;
            canvas.style.backgroundColor = oldBackgroundColor;
            if (!oldDocumentBackgroundColor) document.body.style.backgroundColor = "white";
            document.body.style.backgroundColor = oldDocumentBackgroundColor;
            canvas.style.paddingLeft = oldPaddingLeft;
            canvas.style.paddingRight = oldPaddingRight;
            canvas.style.paddingTop = oldPaddingTop;
            canvas.style.paddingBottom = oldPaddingBottom;
            canvas.style.marginLeft = oldMarginLeft;
            canvas.style.marginRight = oldMarginRight;
            canvas.style.marginTop = oldMarginTop;
            canvas.style.marginBottom = oldMarginBottom;
            document.body.style.margin = oldDocumentBodyMargin;
            document.documentElement.style.overflow = oldDocumentOverflow;
            document.body.scroll = oldDocumentScroll;
            canvas.style.imageRendering = oldImageRendering;
            if (canvas.GLctxObject) canvas.GLctxObject.GLctx.viewport(0, 0, oldWidth, oldHeight);
            if (__currentFullscreenStrategy.canvasResizedCallback) {
                dynCall_iiii(__currentFullscreenStrategy.canvasResizedCallback, 37, 0, __currentFullscreenStrategy.canvasResizedCallbackUserData);
            }
        }
    }
    document.addEventListener("fullscreenchange", restoreOldStyle);
    document.addEventListener("mozfullscreenchange", restoreOldStyle);
    document.addEventListener("webkitfullscreenchange", restoreOldStyle);
    document.addEventListener("MSFullscreenChange", restoreOldStyle);
    return restoreOldStyle;
}
function __setLetterbox(element, topBottom, leftRight) {
    if (JSEvents.isInternetExplorer()) {
        element.style.marginLeft = element.style.marginRight = leftRight + "px";
        element.style.marginTop = element.style.marginBottom = topBottom + "px";
    } else {
        element.style.paddingLeft = element.style.paddingRight = leftRight + "px";
        element.style.paddingTop = element.style.paddingBottom = topBottom + "px";
    }
}
function _JSEvents_resizeCanvasForFullscreen(target, strategy) {
    var restoreOldStyle = __registerRestoreOldStyle(target);
    var cssWidth = strategy.softFullscreen ? innerWidth : screen.width;
    var cssHeight = strategy.softFullscreen ? innerHeight : screen.height;
    var rect = target.getBoundingClientRect();
    var windowedCssWidth = rect.right - rect.left;
    var windowedCssHeight = rect.bottom - rect.top;
    var canvasSize = __get_canvas_element_size(target);
    var windowedRttWidth = canvasSize[0];
    var windowedRttHeight = canvasSize[1];
    if (strategy.scaleMode == 3) {
        __setLetterbox(target, (cssHeight - windowedCssHeight) / 2, (cssWidth - windowedCssWidth) / 2);
        cssWidth = windowedCssWidth;
        cssHeight = windowedCssHeight;
    } else if (strategy.scaleMode == 2) {
        if (cssWidth * windowedRttHeight < windowedRttWidth * cssHeight) {
            var desiredCssHeight = (windowedRttHeight * cssWidth) / windowedRttWidth;
            __setLetterbox(target, (cssHeight - desiredCssHeight) / 2, 0);
            cssHeight = desiredCssHeight;
        } else {
            var desiredCssWidth = (windowedRttWidth * cssHeight) / windowedRttHeight;
            __setLetterbox(target, 0, (cssWidth - desiredCssWidth) / 2);
            cssWidth = desiredCssWidth;
        }
    }
    if (!target.style.backgroundColor) target.style.backgroundColor = "black";
    if (!document.body.style.backgroundColor) document.body.style.backgroundColor = "black";
    target.style.width = cssWidth + "px";
    target.style.height = cssHeight + "px";
    if (strategy.filteringMode == 1) {
        target.style.imageRendering = "optimizeSpeed";
        target.style.imageRendering = "-moz-crisp-edges";
        target.style.imageRendering = "-o-crisp-edges";
        target.style.imageRendering = "-webkit-optimize-contrast";
        target.style.imageRendering = "optimize-contrast";
        target.style.imageRendering = "crisp-edges";
        target.style.imageRendering = "pixelated";
    }
    var dpiScale = strategy.canvasResolutionScaleMode == 2 ? devicePixelRatio : 1;
    if (strategy.canvasResolutionScaleMode != 0) {
        var newWidth = (cssWidth * dpiScale) | 0;
        var newHeight = (cssHeight * dpiScale) | 0;
        __set_canvas_element_size(target, newWidth, newHeight);
        if (target.GLctxObject) target.GLctxObject.GLctx.viewport(0, 0, newWidth, newHeight);
    }
    return restoreOldStyle;
}
function _JSEvents_requestFullscreen(target, strategy) {
    if (strategy.scaleMode != 0 || strategy.canvasResolutionScaleMode != 0) {
        _JSEvents_resizeCanvasForFullscreen(target, strategy);
    }
    if (target.requestFullscreen) {
        target.requestFullscreen();
    } else if (target.msRequestFullscreen) {
        target.msRequestFullscreen();
    } else if (target.mozRequestFullScreen) {
        target.mozRequestFullScreen();
    } else if (target.mozRequestFullscreen) {
        target.mozRequestFullscreen();
    } else if (target.webkitRequestFullscreen) {
        target.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
    } else {
        return JSEvents.fullscreenEnabled() ? -3 : -1;
    }
    if (strategy.canvasResizedCallback) {
        dynCall_iiii(strategy.canvasResizedCallback, 37, 0, strategy.canvasResizedCallbackUserData);
    }
    return 0;
}
function _emscripten_exit_fullscreen() {
    if (!JSEvents.fullscreenEnabled()) return -1;
    JSEvents.removeDeferredCalls(_JSEvents_requestFullscreen);
    var d = __specialEventTargets[1];
    if (d.exitFullscreen) {
        d.fullscreenElement && d.exitFullscreen();
    } else if (d.msExitFullscreen) {
        d.msFullscreenElement && d.msExitFullscreen();
    } else if (d.mozCancelFullScreen) {
        d.mozFullScreenElement && d.mozCancelFullScreen();
    } else if (d.webkitExitFullscreen) {
        d.webkitFullscreenElement && d.webkitExitFullscreen();
    } else {
        return -1;
    }
    if (false) {
        dynCall_iiii(__currentFullscreenStrategy.canvasResizedCallback, 37, 0, __currentFullscreenStrategy.canvasResizedCallbackUserData);
        __currentFullscreenStrategy = 0;
    }
    return 0;
}
function __requestPointerLock(target) {
    if (target.requestPointerLock) {
        target.requestPointerLock();
    } else if (target.mozRequestPointerLock) {
        target.mozRequestPointerLock();
    } else if (target.webkitRequestPointerLock) {
        target.webkitRequestPointerLock();
    } else if (target.msRequestPointerLock) {
        target.msRequestPointerLock();
    } else {
        if (document.body.requestPointerLock || document.body.mozRequestPointerLock || document.body.webkitRequestPointerLock || document.body.msRequestPointerLock) {
            return -3;
        } else {
            return -1;
        }
    }
    return 0;
}
function _emscripten_exit_pointerlock() {
    JSEvents.removeDeferredCalls(__requestPointerLock);
    if (document.exitPointerLock) {
        document.exitPointerLock();
    } else if (document.msExitPointerLock) {
        document.msExitPointerLock();
    } else if (document.mozExitPointerLock) {
        document.mozExitPointerLock();
    } else if (document.webkitExitPointerLock) {
        document.webkitExitPointerLock();
    } else {
        return -1;
    }
    return 0;
}
function _emscripten_exit_with_live_runtime() {
    noExitRuntime = true;
    throw "SimulateInfiniteLoop";
}
function __fillBatteryEventData(eventStruct, e) {
    HEAPF64[eventStruct >> 3] = e.chargingTime;
    HEAPF64[(eventStruct + 8) >> 3] = e.dischargingTime;
    HEAPF64[(eventStruct + 16) >> 3] = e.level;
    HEAP32[(eventStruct + 24) >> 2] = e.charging;
}
function __battery() {
    return navigator.battery || navigator.mozBattery || navigator.webkitBattery;
}
function _emscripten_get_battery_status(batteryState) {
    if (!__battery()) return -1;
    __fillBatteryEventData(batteryState, __battery());
    return 0;
}
function _emscripten_get_device_pixel_ratio() {
    return devicePixelRatio;
}
function _emscripten_get_element_css_size(target, width, height) {
    target = target ? __findEventTarget(target) : Module["canvas"];
    if (!target) return -4;
    if (target.getBoundingClientRect) {
        var rect = target.getBoundingClientRect();
        HEAPF64[width >> 3] = rect.right - rect.left;
        HEAPF64[height >> 3] = rect.bottom - rect.top;
    } else {
        HEAPF64[width >> 3] = target.clientWidth;
        HEAPF64[height >> 3] = target.clientHeight;
    }
    return 0;
}
function __fillGamepadEventData(eventStruct, e) {
    HEAPF64[eventStruct >> 3] = e.timestamp;
    for (var i = 0; i < e.axes.length; ++i) {
        HEAPF64[(eventStruct + i * 8 + 16) >> 3] = e.axes[i];
    }
    for (var i = 0; i < e.buttons.length; ++i) {
        if (typeof e.buttons[i] === "object") {
            HEAPF64[(eventStruct + i * 8 + 528) >> 3] = e.buttons[i].value;
        } else {
            HEAPF64[(eventStruct + i * 8 + 528) >> 3] = e.buttons[i];
        }
    }
    for (var i = 0; i < e.buttons.length; ++i) {
        if (typeof e.buttons[i] === "object") {
            HEAP32[(eventStruct + i * 4 + 1040) >> 2] = e.buttons[i].pressed;
        } else {
            HEAP32[(eventStruct + i * 4 + 1040) >> 2] = e.buttons[i] == 1;
        }
    }
    HEAP32[(eventStruct + 1296) >> 2] = e.connected;
    HEAP32[(eventStruct + 1300) >> 2] = e.index;
    HEAP32[(eventStruct + 8) >> 2] = e.axes.length;
    HEAP32[(eventStruct + 12) >> 2] = e.buttons.length;
    stringToUTF8(e.id, eventStruct + 1304, 64);
    stringToUTF8(e.mapping, eventStruct + 1368, 64);
}
function _emscripten_get_gamepad_status(index, gamepadState) {
    if (index < 0 || index >= JSEvents.lastGamepadState.length) return -5;
    if (!JSEvents.lastGamepadState[index]) return -7;
    __fillGamepadEventData(gamepadState, JSEvents.lastGamepadState[index]);
    return 0;
}
function _emscripten_get_heap_size() {
    return HEAP8.length;
}
function _emscripten_get_num_gamepads() {
    return JSEvents.lastGamepadState.length;
}
function _emscripten_glActiveTexture(x0) {
    GLctx["activeTexture"](x0);
}
function _emscripten_glAttachShader(program, shader) {
    GLctx.attachShader(GL.programs[program], GL.shaders[shader]);
}
function _emscripten_glBeginQueryEXT(target, id) {
    GLctx.disjointTimerQueryExt["beginQueryEXT"](target, GL.timerQueriesEXT[id]);
}
function _emscripten_glBindAttribLocation(program, index, name) {
    GLctx.bindAttribLocation(GL.programs[program], index, UTF8ToString(name));
}
function _emscripten_glBindBuffer(target, buffer) {
    if (target == GLctx.ARRAY_BUFFER) {
        GL.currArrayBuffer = buffer;
    } else if (target == GLctx.ELEMENT_ARRAY_BUFFER) {
        GL.currElementArrayBuffer = buffer;
    }
    GLctx.bindBuffer(target, GL.buffers[buffer]);
}
function _emscripten_glBindFramebuffer(target, framebuffer) {
    GLctx.bindFramebuffer(target, GL.framebuffers[framebuffer]);
}
function _emscripten_glBindRenderbuffer(target, renderbuffer) {
    GLctx.bindRenderbuffer(target, GL.renderbuffers[renderbuffer]);
}
function _emscripten_glBindTexture(target, texture) {
    GLctx.bindTexture(target, GL.textures[texture]);
}
function _emscripten_glBindVertexArrayOES(vao) {
    GLctx["bindVertexArray"](GL.vaos[vao]);
    var ibo = GLctx.getParameter(GLctx.ELEMENT_ARRAY_BUFFER_BINDING);
    GL.currElementArrayBuffer = ibo ? ibo.name | 0 : 0;
}
function _emscripten_glBlendColor(x0, x1, x2, x3) {
    GLctx["blendColor"](x0, x1, x2, x3);
}
function _emscripten_glBlendEquation(x0) {
    GLctx["blendEquation"](x0);
}
function _emscripten_glBlendEquationSeparate(x0, x1) {
    GLctx["blendEquationSeparate"](x0, x1);
}
function _emscripten_glBlendFunc(x0, x1) {
    GLctx["blendFunc"](x0, x1);
}
function _emscripten_glBlendFuncSeparate(x0, x1, x2, x3) {
    GLctx["blendFuncSeparate"](x0, x1, x2, x3);
}
function _emscripten_glBufferData(target, size, data, usage) {
    GLctx.bufferData(target, data ? HEAPU8.subarray(data, data + size) : size, usage);
}
function _emscripten_glBufferSubData(target, offset, size, data) {
    GLctx.bufferSubData(target, offset, HEAPU8.subarray(data, data + size));
}
function _emscripten_glCheckFramebufferStatus(x0) {
    return GLctx["checkFramebufferStatus"](x0);
}
function _emscripten_glClear(x0) {
    GLctx["clear"](x0);
}
function _emscripten_glClearColor(x0, x1, x2, x3) {
    GLctx["clearColor"](x0, x1, x2, x3);
}
function _emscripten_glClearDepthf(x0) {
    GLctx["clearDepth"](x0);
}
function _emscripten_glClearStencil(x0) {
    GLctx["clearStencil"](x0);
}
function _emscripten_glColorMask(red, green, blue, alpha) {
    GLctx.colorMask(!!red, !!green, !!blue, !!alpha);
}
function _emscripten_glCompileShader(shader) {
    GLctx.compileShader(GL.shaders[shader]);
}
function _emscripten_glCompressedTexImage2D(target, level, internalFormat, width, height, border, imageSize, data) {
    GLctx["compressedTexImage2D"](target, level, internalFormat, width, height, border, data ? HEAPU8.subarray(data, data + imageSize) : null);
}
function _emscripten_glCompressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, imageSize, data) {
    GLctx["compressedTexSubImage2D"](target, level, xoffset, yoffset, width, height, format, data ? HEAPU8.subarray(data, data + imageSize) : null);
}
function _emscripten_glCopyTexImage2D(x0, x1, x2, x3, x4, x5, x6, x7) {
    GLctx["copyTexImage2D"](x0, x1, x2, x3, x4, x5, x6, x7);
}
function _emscripten_glCopyTexSubImage2D(x0, x1, x2, x3, x4, x5, x6, x7) {
    GLctx["copyTexSubImage2D"](x0, x1, x2, x3, x4, x5, x6, x7);
}
function _emscripten_glCreateProgram() {
    var id = GL.getNewId(GL.programs);
    var program = GLctx.createProgram();
    program.name = id;
    GL.programs[id] = program;
    return id;
}
function _emscripten_glCreateShader(shaderType) {
    var id = GL.getNewId(GL.shaders);
    GL.shaders[id] = GLctx.createShader(shaderType);
    return id;
}
function _emscripten_glCullFace(x0) {
    GLctx["cullFace"](x0);
}
function _emscripten_glDeleteBuffers(n, buffers) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[(buffers + i * 4) >> 2];
        var buffer = GL.buffers[id];
        if (!buffer) continue;
        GLctx.deleteBuffer(buffer);
        buffer.name = 0;
        GL.buffers[id] = null;
        if (id == GL.currArrayBuffer) GL.currArrayBuffer = 0;
        if (id == GL.currElementArrayBuffer) GL.currElementArrayBuffer = 0;
    }
}
function _emscripten_glDeleteFramebuffers(n, framebuffers) {
    for (var i = 0; i < n; ++i) {
        var id = HEAP32[(framebuffers + i * 4) >> 2];
        var framebuffer = GL.framebuffers[id];
        if (!framebuffer) continue;
        GLctx.deleteFramebuffer(framebuffer);
        framebuffer.name = 0;
        GL.framebuffers[id] = null;
    }
}
function _emscripten_glDeleteProgram(id) {
    if (!id) return;
    var program = GL.programs[id];
    if (!program) {
        GL.recordError(1281);
        return;
    }
    GLctx.deleteProgram(program);
    program.name = 0;
    GL.programs[id] = null;
    GL.programInfos[id] = null;
}
function _emscripten_glDeleteQueriesEXT(n, ids) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[(ids + i * 4) >> 2];
        var query = GL.timerQueriesEXT[id];
        if (!query) continue;
        GLctx.disjointTimerQueryExt["deleteQueryEXT"](query);
        GL.timerQueriesEXT[id] = null;
    }
}
function _emscripten_glDeleteRenderbuffers(n, renderbuffers) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[(renderbuffers + i * 4) >> 2];
        var renderbuffer = GL.renderbuffers[id];
        if (!renderbuffer) continue;
        GLctx.deleteRenderbuffer(renderbuffer);
        renderbuffer.name = 0;
        GL.renderbuffers[id] = null;
    }
}
function _emscripten_glDeleteShader(id) {
    if (!id) return;
    var shader = GL.shaders[id];
    if (!shader) {
        GL.recordError(1281);
        return;
    }
    GLctx.deleteShader(shader);
    GL.shaders[id] = null;
}
function _emscripten_glDeleteTextures(n, textures) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[(textures + i * 4) >> 2];
        var texture = GL.textures[id];
        if (!texture) continue;
        GLctx.deleteTexture(texture);
        texture.name = 0;
        GL.textures[id] = null;
    }
}
function _emscripten_glDeleteVertexArraysOES(n, vaos) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[(vaos + i * 4) >> 2];
        GLctx["deleteVertexArray"](GL.vaos[id]);
        GL.vaos[id] = null;
    }
}
function _emscripten_glDepthFunc(x0) {
    GLctx["depthFunc"](x0);
}
function _emscripten_glDepthMask(flag) {
    GLctx.depthMask(!!flag);
}
function _emscripten_glDepthRangef(x0, x1) {
    GLctx["depthRange"](x0, x1);
}
function _emscripten_glDetachShader(program, shader) {
    GLctx.detachShader(GL.programs[program], GL.shaders[shader]);
}
function _emscripten_glDisable(x0) {
    GLctx["disable"](x0);
}
function _emscripten_glDisableVertexAttribArray(index) {
    var cb = GL.currentContext.clientBuffers[index];
    cb.enabled = false;
    GLctx.disableVertexAttribArray(index);
}
function _emscripten_glDrawArrays(mode, first, count) {
    GL.preDrawHandleClientVertexAttribBindings(first + count);
    GLctx.drawArrays(mode, first, count);
    GL.postDrawHandleClientVertexAttribBindings();
}
function _emscripten_glDrawArraysInstancedANGLE(mode, first, count, primcount) {
    GLctx["drawArraysInstanced"](mode, first, count, primcount);
}
var __tempFixedLengthArray = [];
function _emscripten_glDrawBuffersWEBGL(n, bufs) {
    var bufArray = __tempFixedLengthArray[n];
    for (var i = 0; i < n; i++) {
        bufArray[i] = HEAP32[(bufs + i * 4) >> 2];
    }
    GLctx["drawBuffers"](bufArray);
}
function _emscripten_glDrawElements(mode, count, type, indices) {
    var buf;
    if (!GL.currElementArrayBuffer) {
        var size = GL.calcBufLength(1, type, 0, count);
        buf = GL.getTempIndexBuffer(size);
        GLctx.bindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, buf);
        GLctx.bufferSubData(GLctx.ELEMENT_ARRAY_BUFFER, 0, HEAPU8.subarray(indices, indices + size));
        indices = 0;
    }
    GL.preDrawHandleClientVertexAttribBindings(count);
    GLctx.drawElements(mode, count, type, indices);
    GL.postDrawHandleClientVertexAttribBindings(count);
    if (!GL.currElementArrayBuffer) {
        GLctx.bindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, null);
    }
}
function _emscripten_glDrawElementsInstancedANGLE(mode, count, type, indices, primcount) {
    GLctx["drawElementsInstanced"](mode, count, type, indices, primcount);
}
function _emscripten_glEnable(x0) {
    GLctx["enable"](x0);
}
function _emscripten_glEnableVertexAttribArray(index) {
    var cb = GL.currentContext.clientBuffers[index];
    cb.enabled = true;
    GLctx.enableVertexAttribArray(index);
}
function _emscripten_glEndQueryEXT(target) {
    GLctx.disjointTimerQueryExt["endQueryEXT"](target);
}
function _emscripten_glFinish() {
    GLctx["finish"]();
}
function _emscripten_glFlush() {
    GLctx["flush"]();
}
function _emscripten_glFramebufferRenderbuffer(target, attachment, renderbuffertarget, renderbuffer) {
    GLctx.framebufferRenderbuffer(target, attachment, renderbuffertarget, GL.renderbuffers[renderbuffer]);
}
function _emscripten_glFramebufferTexture2D(target, attachment, textarget, texture, level) {
    GLctx.framebufferTexture2D(target, attachment, textarget, GL.textures[texture], level);
}
function _emscripten_glFrontFace(x0) {
    GLctx["frontFace"](x0);
}
function __glGenObject(n, buffers, createFunction, objectTable) {
    for (var i = 0; i < n; i++) {
        var buffer = GLctx[createFunction]();
        var id = buffer && GL.getNewId(objectTable);
        if (buffer) {
            buffer.name = id;
            objectTable[id] = buffer;
        } else {
            GL.recordError(1282);
        }
        HEAP32[(buffers + i * 4) >> 2] = id;
    }
}
function _emscripten_glGenBuffers(n, buffers) {
    __glGenObject(n, buffers, "createBuffer", GL.buffers);
}
function _emscripten_glGenFramebuffers(n, ids) {
    __glGenObject(n, ids, "createFramebuffer", GL.framebuffers);
}
function _emscripten_glGenQueriesEXT(n, ids) {
    for (var i = 0; i < n; i++) {
        var query = GLctx.disjointTimerQueryExt["createQueryEXT"]();
        if (!query) {
            GL.recordError(1282);
            while (i < n) HEAP32[(ids + i++ * 4) >> 2] = 0;
            return;
        }
        var id = GL.getNewId(GL.timerQueriesEXT);
        query.name = id;
        GL.timerQueriesEXT[id] = query;
        HEAP32[(ids + i * 4) >> 2] = id;
    }
}
function _emscripten_glGenRenderbuffers(n, renderbuffers) {
    __glGenObject(n, renderbuffers, "createRenderbuffer", GL.renderbuffers);
}
function _emscripten_glGenTextures(n, textures) {
    __glGenObject(n, textures, "createTexture", GL.textures);
}
function _emscripten_glGenVertexArraysOES(n, arrays) {
    __glGenObject(n, arrays, "createVertexArray", GL.vaos);
}
function _emscripten_glGenerateMipmap(x0) {
    GLctx["generateMipmap"](x0);
}
function _emscripten_glGetActiveAttrib(program, index, bufSize, length, size, type, name) {
    program = GL.programs[program];
    var info = GLctx.getActiveAttrib(program, index);
    if (!info) return;
    var numBytesWrittenExclNull = bufSize > 0 && name ? stringToUTF8(info.name, name, bufSize) : 0;
    if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
    if (size) HEAP32[size >> 2] = info.size;
    if (type) HEAP32[type >> 2] = info.type;
}
function _emscripten_glGetActiveUniform(program, index, bufSize, length, size, type, name) {
    program = GL.programs[program];
    var info = GLctx.getActiveUniform(program, index);
    if (!info) return;
    var numBytesWrittenExclNull = bufSize > 0 && name ? stringToUTF8(info.name, name, bufSize) : 0;
    if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
    if (size) HEAP32[size >> 2] = info.size;
    if (type) HEAP32[type >> 2] = info.type;
}
function _emscripten_glGetAttachedShaders(program, maxCount, count, shaders) {
    var result = GLctx.getAttachedShaders(GL.programs[program]);
    var len = result.length;
    if (len > maxCount) {
        len = maxCount;
    }
    HEAP32[count >> 2] = len;
    for (var i = 0; i < len; ++i) {
        var id = GL.shaders.indexOf(result[i]);
        HEAP32[(shaders + i * 4) >> 2] = id;
    }
}
function _emscripten_glGetAttribLocation(program, name) {
    return GLctx.getAttribLocation(GL.programs[program], UTF8ToString(name));
}
function emscriptenWebGLGet(name_, p, type) {
    if (!p) {
        GL.recordError(1281);
        return;
    }
    var ret = undefined;
    switch (name_) {
        case 36346:
            ret = 1;
            break;
        case 36344:
            if (type != 0 && type != 1) {
                GL.recordError(1280);
            }
            return;
        case 36345:
            ret = 0;
            break;
        case 34466:
            var formats = GLctx.getParameter(34467);
            ret = formats ? formats.length : 0;
            break;
    }
    if (ret === undefined) {
        var result = GLctx.getParameter(name_);
        switch (typeof result) {
            case "number":
                ret = result;
                break;
            case "boolean":
                ret = result ? 1 : 0;
                break;
            case "string":
                GL.recordError(1280);
                return;
            case "object":
                if (result === null) {
                    switch (name_) {
                        case 34964:
                        case 35725:
                        case 34965:
                        case 36006:
                        case 36007:
                        case 32873:
                        case 34229:
                        case 34068: {
                            ret = 0;
                            break;
                        }
                        default: {
                            GL.recordError(1280);
                            return;
                        }
                    }
                } else if (result instanceof Float32Array || result instanceof Uint32Array || result instanceof Int32Array || result instanceof Array) {
                    for (var i = 0; i < result.length; ++i) {
                        switch (type) {
                            case 0:
                                HEAP32[(p + i * 4) >> 2] = result[i];
                                break;
                            case 2:
                                HEAPF32[(p + i * 4) >> 2] = result[i];
                                break;
                            case 4:
                                HEAP8[(p + i) >> 0] = result[i] ? 1 : 0;
                                break;
                        }
                    }
                    return;
                } else {
                    try {
                        ret = result.name | 0;
                    } catch (e) {
                        GL.recordError(1280);
                        err("GL_INVALID_ENUM in glGet" + type + "v: Unknown object returned from WebGL getParameter(" + name_ + ")! (error: " + e + ")");
                        return;
                    }
                }
                break;
            default:
                GL.recordError(1280);
                err("GL_INVALID_ENUM in glGet" + type + "v: Native code calling glGet" + type + "v(" + name_ + ") and it returns " + result + " of type " + typeof result + "!");
                return;
        }
    }
    switch (type) {
        case 1:
            (tempI64 = [
                ret >>> 0,
                ((tempDouble = ret), +Math_abs(tempDouble) >= +1 ? (tempDouble > +0 ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / +4294967296) >>> 0) : 0),
            ]),
                (HEAP32[p >> 2] = tempI64[0]),
                (HEAP32[(p + 4) >> 2] = tempI64[1]);
            break;
        case 0:
            HEAP32[p >> 2] = ret;
            break;
        case 2:
            HEAPF32[p >> 2] = ret;
            break;
        case 4:
            HEAP8[p >> 0] = ret ? 1 : 0;
            break;
    }
}
function _emscripten_glGetBooleanv(name_, p) {
    emscriptenWebGLGet(name_, p, 4);
}
function _emscripten_glGetBufferParameteriv(target, value, data) {
    if (!data) {
        GL.recordError(1281);
        return;
    }
    HEAP32[data >> 2] = GLctx.getBufferParameter(target, value);
}
function _emscripten_glGetError() {
    var error = GLctx.getError() || GL.lastError;
    GL.lastError = 0;
    return error;
}
function _emscripten_glGetFloatv(name_, p) {
    emscriptenWebGLGet(name_, p, 2);
}
function _emscripten_glGetFramebufferAttachmentParameteriv(target, attachment, pname, params) {
    var result = GLctx.getFramebufferAttachmentParameter(target, attachment, pname);
    if (result instanceof WebGLRenderbuffer || result instanceof WebGLTexture) {
        result = result.name | 0;
    }
    HEAP32[params >> 2] = result;
}
function _emscripten_glGetIntegerv(name_, p) {
    emscriptenWebGLGet(name_, p, 0);
}
function _emscripten_glGetProgramInfoLog(program, maxLength, length, infoLog) {
    var log = GLctx.getProgramInfoLog(GL.programs[program]);
    if (log === null) log = "(unknown error)";
    var numBytesWrittenExclNull = maxLength > 0 && infoLog ? stringToUTF8(log, infoLog, maxLength) : 0;
    if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
}
function _emscripten_glGetProgramiv(program, pname, p) {
    if (!p) {
        GL.recordError(1281);
        return;
    }
    if (program >= GL.counter) {
        GL.recordError(1281);
        return;
    }
    var ptable = GL.programInfos[program];
    if (!ptable) {
        GL.recordError(1282);
        return;
    }
    if (pname == 35716) {
        var log = GLctx.getProgramInfoLog(GL.programs[program]);
        if (log === null) log = "(unknown error)";
        HEAP32[p >> 2] = log.length + 1;
    } else if (pname == 35719) {
        HEAP32[p >> 2] = ptable.maxUniformLength;
    } else if (pname == 35722) {
        if (ptable.maxAttributeLength == -1) {
            program = GL.programs[program];
            var numAttribs = GLctx.getProgramParameter(program, 35721);
            ptable.maxAttributeLength = 0;
            for (var i = 0; i < numAttribs; ++i) {
                var activeAttrib = GLctx.getActiveAttrib(program, i);
                ptable.maxAttributeLength = Math.max(ptable.maxAttributeLength, activeAttrib.name.length + 1);
            }
        }
        HEAP32[p >> 2] = ptable.maxAttributeLength;
    } else if (pname == 35381) {
        if (ptable.maxUniformBlockNameLength == -1) {
            program = GL.programs[program];
            var numBlocks = GLctx.getProgramParameter(program, 35382);
            ptable.maxUniformBlockNameLength = 0;
            for (var i = 0; i < numBlocks; ++i) {
                var activeBlockName = GLctx.getActiveUniformBlockName(program, i);
                ptable.maxUniformBlockNameLength = Math.max(ptable.maxUniformBlockNameLength, activeBlockName.length + 1);
            }
        }
        HEAP32[p >> 2] = ptable.maxUniformBlockNameLength;
    } else {
        HEAP32[p >> 2] = GLctx.getProgramParameter(GL.programs[program], pname);
    }
}
function _emscripten_glGetQueryObjecti64vEXT(id, pname, params) {
    if (!params) {
        GL.recordError(1281);
        return;
    }
    var query = GL.timerQueriesEXT[id];
    var param = GLctx.disjointTimerQueryExt["getQueryObjectEXT"](query, pname);
    var ret;
    if (typeof param == "boolean") {
        ret = param ? 1 : 0;
    } else {
        ret = param;
    }
    (tempI64 = [
        ret >>> 0,
        ((tempDouble = ret), +Math_abs(tempDouble) >= +1 ? (tempDouble > +0 ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / +4294967296) >>> 0) : 0),
    ]),
        (HEAP32[params >> 2] = tempI64[0]),
        (HEAP32[(params + 4) >> 2] = tempI64[1]);
}
function _emscripten_glGetQueryObjectivEXT(id, pname, params) {
    if (!params) {
        GL.recordError(1281);
        return;
    }
    var query = GL.timerQueriesEXT[id];
    var param = GLctx.disjointTimerQueryExt["getQueryObjectEXT"](query, pname);
    var ret;
    if (typeof param == "boolean") {
        ret = param ? 1 : 0;
    } else {
        ret = param;
    }
    HEAP32[params >> 2] = ret;
}
function _emscripten_glGetQueryObjectui64vEXT(id, pname, params) {
    if (!params) {
        GL.recordError(1281);
        return;
    }
    var query = GL.timerQueriesEXT[id];
    var param = GLctx.disjointTimerQueryExt["getQueryObjectEXT"](query, pname);
    var ret;
    if (typeof param == "boolean") {
        ret = param ? 1 : 0;
    } else {
        ret = param;
    }
    (tempI64 = [
        ret >>> 0,
        ((tempDouble = ret), +Math_abs(tempDouble) >= +1 ? (tempDouble > +0 ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / +4294967296) >>> 0) : 0),
    ]),
        (HEAP32[params >> 2] = tempI64[0]),
        (HEAP32[(params + 4) >> 2] = tempI64[1]);
}
function _emscripten_glGetQueryObjectuivEXT(id, pname, params) {
    if (!params) {
        GL.recordError(1281);
        return;
    }
    var query = GL.timerQueriesEXT[id];
    var param = GLctx.disjointTimerQueryExt["getQueryObjectEXT"](query, pname);
    var ret;
    if (typeof param == "boolean") {
        ret = param ? 1 : 0;
    } else {
        ret = param;
    }
    HEAP32[params >> 2] = ret;
}
function _emscripten_glGetQueryivEXT(target, pname, params) {
    if (!params) {
        GL.recordError(1281);
        return;
    }
    HEAP32[params >> 2] = GLctx.disjointTimerQueryExt["getQueryEXT"](target, pname);
}
function _emscripten_glGetRenderbufferParameteriv(target, pname, params) {
    if (!params) {
        GL.recordError(1281);
        return;
    }
    HEAP32[params >> 2] = GLctx.getRenderbufferParameter(target, pname);
}
function _emscripten_glGetShaderInfoLog(shader, maxLength, length, infoLog) {
    var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
    if (log === null) log = "(unknown error)";
    var numBytesWrittenExclNull = maxLength > 0 && infoLog ? stringToUTF8(log, infoLog, maxLength) : 0;
    if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
}
function _emscripten_glGetShaderPrecisionFormat(shaderType, precisionType, range, precision) {
    var result = GLctx.getShaderPrecisionFormat(shaderType, precisionType);
    HEAP32[range >> 2] = result.rangeMin;
    HEAP32[(range + 4) >> 2] = result.rangeMax;
    HEAP32[precision >> 2] = result.precision;
}
function _emscripten_glGetShaderSource(shader, bufSize, length, source) {
    var result = GLctx.getShaderSource(GL.shaders[shader]);
    if (!result) return;
    var numBytesWrittenExclNull = bufSize > 0 && source ? stringToUTF8(result, source, bufSize) : 0;
    if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
}
function _emscripten_glGetShaderiv(shader, pname, p) {
    if (!p) {
        GL.recordError(1281);
        return;
    }
    if (pname == 35716) {
        var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
        if (log === null) log = "(unknown error)";
        HEAP32[p >> 2] = log.length + 1;
    } else if (pname == 35720) {
        var source = GLctx.getShaderSource(GL.shaders[shader]);
        var sourceLength = source === null || source.length == 0 ? 0 : source.length + 1;
        HEAP32[p >> 2] = sourceLength;
    } else {
        HEAP32[p >> 2] = GLctx.getShaderParameter(GL.shaders[shader], pname);
    }
}
function stringToNewUTF8(jsString) {
    var length = lengthBytesUTF8(jsString) + 1;
    var cString = _malloc(length);
    stringToUTF8(jsString, cString, length);
    return cString;
}
function _emscripten_glGetString(name_) {
    if (GL.stringCache[name_]) return GL.stringCache[name_];
    var ret;
    switch (name_) {
        case 7939:
            var exts = GLctx.getSupportedExtensions() || [];
            exts = exts.concat(
                exts.map(function (e) {
                    return "GL_" + e;
                })
            );
            ret = stringToNewUTF8(exts.join(" "));
            break;
        case 7936:
        case 7937:
        case 37445:
        case 37446:
            var s = GLctx.getParameter(name_);
            if (!s) {
                GL.recordError(1280);
            }
            ret = stringToNewUTF8(s);
            break;
        case 7938:
            var glVersion = GLctx.getParameter(GLctx.VERSION);
            {
                glVersion = "OpenGL ES 2.0 (" + glVersion + ")";
            }
            ret = stringToNewUTF8(glVersion);
            break;
        case 35724:
            var glslVersion = GLctx.getParameter(GLctx.SHADING_LANGUAGE_VERSION);
            var ver_re = /^WebGL GLSL ES ([0-9]\.[0-9][0-9]?)(?:$| .*)/;
            var ver_num = glslVersion.match(ver_re);
            if (ver_num !== null) {
                if (ver_num[1].length == 3) ver_num[1] = ver_num[1] + "0";
                glslVersion = "OpenGL ES GLSL ES " + ver_num[1] + " (" + glslVersion + ")";
            }
            ret = stringToNewUTF8(glslVersion);
            break;
        default:
            GL.recordError(1280);
            return 0;
    }
    GL.stringCache[name_] = ret;
    return ret;
}
function _emscripten_glGetTexParameterfv(target, pname, params) {
    if (!params) {
        GL.recordError(1281);
        return;
    }
    HEAPF32[params >> 2] = GLctx.getTexParameter(target, pname);
}
function _emscripten_glGetTexParameteriv(target, pname, params) {
    if (!params) {
        GL.recordError(1281);
        return;
    }
    HEAP32[params >> 2] = GLctx.getTexParameter(target, pname);
}
function _emscripten_glGetUniformLocation(program, name) {
    name = UTF8ToString(name);
    var arrayIndex = 0;
    if (name[name.length - 1] == "]") {
        var leftBrace = name.lastIndexOf("[");
        arrayIndex = name[leftBrace + 1] != "]" ? parseInt(name.slice(leftBrace + 1)) : 0;
        name = name.slice(0, leftBrace);
    }
    var uniformInfo = GL.programInfos[program] && GL.programInfos[program].uniforms[name];
    if (uniformInfo && arrayIndex >= 0 && arrayIndex < uniformInfo[0]) {
        return uniformInfo[1] + arrayIndex;
    } else {
        return -1;
    }
}
function emscriptenWebGLGetUniform(program, location, params, type) {
    if (!params) {
        GL.recordError(1281);
        return;
    }
    var data = GLctx.getUniform(GL.programs[program], GL.uniforms[location]);
    if (typeof data == "number" || typeof data == "boolean") {
        switch (type) {
            case 0:
                HEAP32[params >> 2] = data;
                break;
            case 2:
                HEAPF32[params >> 2] = data;
                break;
            default:
                throw "internal emscriptenWebGLGetUniform() error, bad type: " + type;
        }
    } else {
        for (var i = 0; i < data.length; i++) {
            switch (type) {
                case 0:
                    HEAP32[(params + i * 4) >> 2] = data[i];
                    break;
                case 2:
                    HEAPF32[(params + i * 4) >> 2] = data[i];
                    break;
                default:
                    throw "internal emscriptenWebGLGetUniform() error, bad type: " + type;
            }
        }
    }
}
function _emscripten_glGetUniformfv(program, location, params) {
    emscriptenWebGLGetUniform(program, location, params, 2);
}
function _emscripten_glGetUniformiv(program, location, params) {
    emscriptenWebGLGetUniform(program, location, params, 0);
}
function _emscripten_glGetVertexAttribPointerv(index, pname, pointer) {
    if (!pointer) {
        GL.recordError(1281);
        return;
    }
    if (GL.currentContext.clientBuffers[index].enabled) {
        err("glGetVertexAttribPointer on client-side array: not supported, bad data returned");
    }
    HEAP32[pointer >> 2] = GLctx.getVertexAttribOffset(index, pname);
}
function emscriptenWebGLGetVertexAttrib(index, pname, params, type) {
    if (!params) {
        GL.recordError(1281);
        return;
    }
    if (GL.currentContext.clientBuffers[index].enabled) {
        err("glGetVertexAttrib*v on client-side array: not supported, bad data returned");
    }
    var data = GLctx.getVertexAttrib(index, pname);
    if (pname == 34975) {
        HEAP32[params >> 2] = data["name"];
    } else if (typeof data == "number" || typeof data == "boolean") {
        switch (type) {
            case 0:
                HEAP32[params >> 2] = data;
                break;
            case 2:
                HEAPF32[params >> 2] = data;
                break;
            case 5:
                HEAP32[params >> 2] = Math.fround(data);
                break;
            default:
                throw "internal emscriptenWebGLGetVertexAttrib() error, bad type: " + type;
        }
    } else {
        for (var i = 0; i < data.length; i++) {
            switch (type) {
                case 0:
                    HEAP32[(params + i * 4) >> 2] = data[i];
                    break;
                case 2:
                    HEAPF32[(params + i * 4) >> 2] = data[i];
                    break;
                case 5:
                    HEAP32[(params + i * 4) >> 2] = Math.fround(data[i]);
                    break;
                default:
                    throw "internal emscriptenWebGLGetVertexAttrib() error, bad type: " + type;
            }
        }
    }
}
function _emscripten_glGetVertexAttribfv(index, pname, params) {
    emscriptenWebGLGetVertexAttrib(index, pname, params, 2);
}
function _emscripten_glGetVertexAttribiv(index, pname, params) {
    emscriptenWebGLGetVertexAttrib(index, pname, params, 5);
}
function _emscripten_glHint(x0, x1) {
    GLctx["hint"](x0, x1);
}
function _emscripten_glIsBuffer(buffer) {
    var b = GL.buffers[buffer];
    if (!b) return 0;
    return GLctx.isBuffer(b);
}
function _emscripten_glIsEnabled(x0) {
    return GLctx["isEnabled"](x0);
}
function _emscripten_glIsFramebuffer(framebuffer) {
    var fb = GL.framebuffers[framebuffer];
    if (!fb) return 0;
    return GLctx.isFramebuffer(fb);
}
function _emscripten_glIsProgram(program) {
    program = GL.programs[program];
    if (!program) return 0;
    return GLctx.isProgram(program);
}
function _emscripten_glIsQueryEXT(id) {
    var query = GL.timerQueriesEXT[id];
    if (!query) return 0;
    return GLctx.disjointTimerQueryExt["isQueryEXT"](query);
}
function _emscripten_glIsRenderbuffer(renderbuffer) {
    var rb = GL.renderbuffers[renderbuffer];
    if (!rb) return 0;
    return GLctx.isRenderbuffer(rb);
}
function _emscripten_glIsShader(shader) {
    var s = GL.shaders[shader];
    if (!s) return 0;
    return GLctx.isShader(s);
}
function _emscripten_glIsTexture(id) {
    var texture = GL.textures[id];
    if (!texture) return 0;
    return GLctx.isTexture(texture);
}
function _emscripten_glIsVertexArrayOES(array) {
    var vao = GL.vaos[array];
    if (!vao) return 0;
    return GLctx["isVertexArray"](vao);
}
function _emscripten_glLineWidth(x0) {
    GLctx["lineWidth"](x0);
}
function _emscripten_glLinkProgram(program) {
    GLctx.linkProgram(GL.programs[program]);
    GL.populateUniformTable(program);
}
function _emscripten_glPixelStorei(pname, param) {
    if (pname == 3317) {
        GL.unpackAlignment = param;
    }
    GLctx.pixelStorei(pname, param);
}
function _emscripten_glPolygonOffset(x0, x1) {
    GLctx["polygonOffset"](x0, x1);
}
function _emscripten_glQueryCounterEXT(id, target) {
    GLctx.disjointTimerQueryExt["queryCounterEXT"](GL.timerQueriesEXT[id], target);
}
function __computeUnpackAlignedImageSize(width, height, sizePerPixel, alignment) {
    function roundedToNextMultipleOf(x, y) {
        return (x + y - 1) & -y;
    }
    var plainRowSize = width * sizePerPixel;
    var alignedRowSize = roundedToNextMultipleOf(plainRowSize, alignment);
    return height * alignedRowSize;
}
var __colorChannelsInGlTextureFormat = { 6402: 1, 6406: 1, 6407: 3, 6408: 4, 6409: 1, 6410: 2, 35904: 3, 35906: 4 };
var __sizeOfGlTextureElementType = { 5121: 1, 5123: 2, 5125: 4, 5126: 4, 32819: 2, 32820: 2, 33635: 2, 34042: 4, 36193: 2 };
function emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) {
    var sizePerPixel = __colorChannelsInGlTextureFormat[format] * __sizeOfGlTextureElementType[type];
    if (!sizePerPixel) {
        GL.recordError(1280);
        return;
    }
    var bytes = __computeUnpackAlignedImageSize(width, height, sizePerPixel, GL.unpackAlignment);
    var end = pixels + bytes;
    switch (type) {
        case 5121:
            return HEAPU8.subarray(pixels, end);
        case 5126:
            return HEAPF32.subarray(pixels >> 2, end >> 2);
        case 5125:
        case 34042:
            return HEAPU32.subarray(pixels >> 2, end >> 2);
        case 5123:
        case 33635:
        case 32819:
        case 32820:
        case 36193:
            return HEAPU16.subarray(pixels >> 1, end >> 1);
        default:
            GL.recordError(1280);
    }
}
function _emscripten_glReadPixels(x, y, width, height, format, type, pixels) {
    var pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, format);
    if (!pixelData) {
        GL.recordError(1280);
        return;
    }
    GLctx.readPixels(x, y, width, height, format, type, pixelData);
}
function _emscripten_glReleaseShaderCompiler() {}
function _emscripten_glRenderbufferStorage(x0, x1, x2, x3) {
    GLctx["renderbufferStorage"](x0, x1, x2, x3);
}
function _emscripten_glSampleCoverage(value, invert) {
    GLctx.sampleCoverage(value, !!invert);
}
function _emscripten_glScissor(x0, x1, x2, x3) {
    GLctx["scissor"](x0, x1, x2, x3);
}
function _emscripten_glShaderBinary() {
    GL.recordError(1280);
}
function _emscripten_glShaderSource(shader, count, string, length) {
    var source = GL.getSource(shader, count, string, length);
    GLctx.shaderSource(GL.shaders[shader], source);
}
function _emscripten_glStencilFunc(x0, x1, x2) {
    GLctx["stencilFunc"](x0, x1, x2);
}
function _emscripten_glStencilFuncSeparate(x0, x1, x2, x3) {
    GLctx["stencilFuncSeparate"](x0, x1, x2, x3);
}
function _emscripten_glStencilMask(x0) {
    GLctx["stencilMask"](x0);
}
function _emscripten_glStencilMaskSeparate(x0, x1) {
    GLctx["stencilMaskSeparate"](x0, x1);
}
function _emscripten_glStencilOp(x0, x1, x2) {
    GLctx["stencilOp"](x0, x1, x2);
}
function _emscripten_glStencilOpSeparate(x0, x1, x2, x3) {
    GLctx["stencilOpSeparate"](x0, x1, x2, x3);
}
function _emscripten_glTexImage2D(target, level, internalFormat, width, height, border, format, type, pixels) {
    GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels ? emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) : null);
}
function _emscripten_glTexParameterf(x0, x1, x2) {
    GLctx["texParameterf"](x0, x1, x2);
}
function _emscripten_glTexParameterfv(target, pname, params) {
    var param = HEAPF32[params >> 2];
    GLctx.texParameterf(target, pname, param);
}
function _emscripten_glTexParameteri(x0, x1, x2) {
    GLctx["texParameteri"](x0, x1, x2);
}
function _emscripten_glTexParameteriv(target, pname, params) {
    var param = HEAP32[params >> 2];
    GLctx.texParameteri(target, pname, param);
}
function _emscripten_glTexSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels) {
    var pixelData = null;
    if (pixels) pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, 0);
    GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixelData);
}
function _emscripten_glUniform1f(location, v0) {
    GLctx.uniform1f(GL.uniforms[location], v0);
}
function _emscripten_glUniform1fv(location, count, value) {
    if (count <= GL.MINI_TEMP_BUFFER_SIZE) {
        var view = GL.miniTempBufferViews[count - 1];
        for (var i = 0; i < count; ++i) {
            view[i] = HEAPF32[(value + 4 * i) >> 2];
        }
    } else {
        var view = HEAPF32.subarray(value >> 2, (value + count * 4) >> 2);
    }
    GLctx.uniform1fv(GL.uniforms[location], view);
}
function _emscripten_glUniform1i(location, v0) {
    GLctx.uniform1i(GL.uniforms[location], v0);
}
function _emscripten_glUniform1iv(location, count, value) {
    GLctx.uniform1iv(GL.uniforms[location], HEAP32.subarray(value >> 2, (value + count * 4) >> 2));
}
function _emscripten_glUniform2f(location, v0, v1) {
    GLctx.uniform2f(GL.uniforms[location], v0, v1);
}
function _emscripten_glUniform2fv(location, count, value) {
    if (2 * count <= GL.MINI_TEMP_BUFFER_SIZE) {
        var view = GL.miniTempBufferViews[2 * count - 1];
        for (var i = 0; i < 2 * count; i += 2) {
            view[i] = HEAPF32[(value + 4 * i) >> 2];
            view[i + 1] = HEAPF32[(value + (4 * i + 4)) >> 2];
        }
    } else {
        var view = HEAPF32.subarray(value >> 2, (value + count * 8) >> 2);
    }
    GLctx.uniform2fv(GL.uniforms[location], view);
}
function _emscripten_glUniform2i(location, v0, v1) {
    GLctx.uniform2i(GL.uniforms[location], v0, v1);
}
function _emscripten_glUniform2iv(location, count, value) {
    GLctx.uniform2iv(GL.uniforms[location], HEAP32.subarray(value >> 2, (value + count * 8) >> 2));
}
function _emscripten_glUniform3f(location, v0, v1, v2) {
    GLctx.uniform3f(GL.uniforms[location], v0, v1, v2);
}
function _emscripten_glUniform3fv(location, count, value) {
    if (3 * count <= GL.MINI_TEMP_BUFFER_SIZE) {
        var view = GL.miniTempBufferViews[3 * count - 1];
        for (var i = 0; i < 3 * count; i += 3) {
            view[i] = HEAPF32[(value + 4 * i) >> 2];
            view[i + 1] = HEAPF32[(value + (4 * i + 4)) >> 2];
            view[i + 2] = HEAPF32[(value + (4 * i + 8)) >> 2];
        }
    } else {
        var view = HEAPF32.subarray(value >> 2, (value + count * 12) >> 2);
    }
    GLctx.uniform3fv(GL.uniforms[location], view);
}
function _emscripten_glUniform3i(location, v0, v1, v2) {
    GLctx.uniform3i(GL.uniforms[location], v0, v1, v2);
}
function _emscripten_glUniform3iv(location, count, value) {
    GLctx.uniform3iv(GL.uniforms[location], HEAP32.subarray(value >> 2, (value + count * 12) >> 2));
}
function _emscripten_glUniform4f(location, v0, v1, v2, v3) {
    GLctx.uniform4f(GL.uniforms[location], v0, v1, v2, v3);
}
function _emscripten_glUniform4fv(location, count, value) {
    if (4 * count <= GL.MINI_TEMP_BUFFER_SIZE) {
        var view = GL.miniTempBufferViews[4 * count - 1];
        for (var i = 0; i < 4 * count; i += 4) {
            view[i] = HEAPF32[(value + 4 * i) >> 2];
            view[i + 1] = HEAPF32[(value + (4 * i + 4)) >> 2];
            view[i + 2] = HEAPF32[(value + (4 * i + 8)) >> 2];
            view[i + 3] = HEAPF32[(value + (4 * i + 12)) >> 2];
        }
    } else {
        var view = HEAPF32.subarray(value >> 2, (value + count * 16) >> 2);
    }
    GLctx.uniform4fv(GL.uniforms[location], view);
}
function _emscripten_glUniform4i(location, v0, v1, v2, v3) {
    GLctx.uniform4i(GL.uniforms[location], v0, v1, v2, v3);
}
function _emscripten_glUniform4iv(location, count, value) {
    GLctx.uniform4iv(GL.uniforms[location], HEAP32.subarray(value >> 2, (value + count * 16) >> 2));
}
function _emscripten_glUniformMatrix2fv(location, count, transpose, value) {
    if (4 * count <= GL.MINI_TEMP_BUFFER_SIZE) {
        var view = GL.miniTempBufferViews[4 * count - 1];
        for (var i = 0; i < 4 * count; i += 4) {
            view[i] = HEAPF32[(value + 4 * i) >> 2];
            view[i + 1] = HEAPF32[(value + (4 * i + 4)) >> 2];
            view[i + 2] = HEAPF32[(value + (4 * i + 8)) >> 2];
            view[i + 3] = HEAPF32[(value + (4 * i + 12)) >> 2];
        }
    } else {
        var view = HEAPF32.subarray(value >> 2, (value + count * 16) >> 2);
    }
    GLctx.uniformMatrix2fv(GL.uniforms[location], !!transpose, view);
}
function _emscripten_glUniformMatrix3fv(location, count, transpose, value) {
    if (9 * count <= GL.MINI_TEMP_BUFFER_SIZE) {
        var view = GL.miniTempBufferViews[9 * count - 1];
        for (var i = 0; i < 9 * count; i += 9) {
            view[i] = HEAPF32[(value + 4 * i) >> 2];
            view[i + 1] = HEAPF32[(value + (4 * i + 4)) >> 2];
            view[i + 2] = HEAPF32[(value + (4 * i + 8)) >> 2];
            view[i + 3] = HEAPF32[(value + (4 * i + 12)) >> 2];
            view[i + 4] = HEAPF32[(value + (4 * i + 16)) >> 2];
            view[i + 5] = HEAPF32[(value + (4 * i + 20)) >> 2];
            view[i + 6] = HEAPF32[(value + (4 * i + 24)) >> 2];
            view[i + 7] = HEAPF32[(value + (4 * i + 28)) >> 2];
            view[i + 8] = HEAPF32[(value + (4 * i + 32)) >> 2];
        }
    } else {
        var view = HEAPF32.subarray(value >> 2, (value + count * 36) >> 2);
    }
    GLctx.uniformMatrix3fv(GL.uniforms[location], !!transpose, view);
}
function _emscripten_glUniformMatrix4fv(location, count, transpose, value) {
    if (16 * count <= GL.MINI_TEMP_BUFFER_SIZE) {
        var view = GL.miniTempBufferViews[16 * count - 1];
        for (var i = 0; i < 16 * count; i += 16) {
            view[i] = HEAPF32[(value + 4 * i) >> 2];
            view[i + 1] = HEAPF32[(value + (4 * i + 4)) >> 2];
            view[i + 2] = HEAPF32[(value + (4 * i + 8)) >> 2];
            view[i + 3] = HEAPF32[(value + (4 * i + 12)) >> 2];
            view[i + 4] = HEAPF32[(value + (4 * i + 16)) >> 2];
            view[i + 5] = HEAPF32[(value + (4 * i + 20)) >> 2];
            view[i + 6] = HEAPF32[(value + (4 * i + 24)) >> 2];
            view[i + 7] = HEAPF32[(value + (4 * i + 28)) >> 2];
            view[i + 8] = HEAPF32[(value + (4 * i + 32)) >> 2];
            view[i + 9] = HEAPF32[(value + (4 * i + 36)) >> 2];
            view[i + 10] = HEAPF32[(value + (4 * i + 40)) >> 2];
            view[i + 11] = HEAPF32[(value + (4 * i + 44)) >> 2];
            view[i + 12] = HEAPF32[(value + (4 * i + 48)) >> 2];
            view[i + 13] = HEAPF32[(value + (4 * i + 52)) >> 2];
            view[i + 14] = HEAPF32[(value + (4 * i + 56)) >> 2];
            view[i + 15] = HEAPF32[(value + (4 * i + 60)) >> 2];
        }
    } else {
        var view = HEAPF32.subarray(value >> 2, (value + count * 64) >> 2);
    }
    GLctx.uniformMatrix4fv(GL.uniforms[location], !!transpose, view);
}
function _emscripten_glUseProgram(program) {
    GLctx.useProgram(GL.programs[program]);
}
function _emscripten_glValidateProgram(program) {
    GLctx.validateProgram(GL.programs[program]);
}
function _emscripten_glVertexAttrib1f(x0, x1) {
    GLctx["vertexAttrib1f"](x0, x1);
}
function _emscripten_glVertexAttrib1fv(index, v) {
    GLctx.vertexAttrib1f(index, HEAPF32[v >> 2]);
}
function _emscripten_glVertexAttrib2f(x0, x1, x2) {
    GLctx["vertexAttrib2f"](x0, x1, x2);
}
function _emscripten_glVertexAttrib2fv(index, v) {
    GLctx.vertexAttrib2f(index, HEAPF32[v >> 2], HEAPF32[(v + 4) >> 2]);
}
function _emscripten_glVertexAttrib3f(x0, x1, x2, x3) {
    GLctx["vertexAttrib3f"](x0, x1, x2, x3);
}
function _emscripten_glVertexAttrib3fv(index, v) {
    GLctx.vertexAttrib3f(index, HEAPF32[v >> 2], HEAPF32[(v + 4) >> 2], HEAPF32[(v + 8) >> 2]);
}
function _emscripten_glVertexAttrib4f(x0, x1, x2, x3, x4) {
    GLctx["vertexAttrib4f"](x0, x1, x2, x3, x4);
}
function _emscripten_glVertexAttrib4fv(index, v) {
    GLctx.vertexAttrib4f(index, HEAPF32[v >> 2], HEAPF32[(v + 4) >> 2], HEAPF32[(v + 8) >> 2], HEAPF32[(v + 12) >> 2]);
}
function _emscripten_glVertexAttribDivisorANGLE(index, divisor) {
    GLctx["vertexAttribDivisor"](index, divisor);
}
function _emscripten_glVertexAttribPointer(index, size, type, normalized, stride, ptr) {
    var cb = GL.currentContext.clientBuffers[index];
    if (!GL.currArrayBuffer) {
        cb.size = size;
        cb.type = type;
        cb.normalized = normalized;
        cb.stride = stride;
        cb.ptr = ptr;
        cb.clientside = true;
        cb.vertexAttribPointerAdaptor = function (index, size, type, normalized, stride, ptr) {
            this.vertexAttribPointer(index, size, type, normalized, stride, ptr);
        };
        return;
    }
    cb.clientside = false;
    GLctx.vertexAttribPointer(index, size, type, !!normalized, stride, ptr);
}
function _emscripten_glViewport(x0, x1, x2, x3) {
    GLctx["viewport"](x0, x1, x2, x3);
}
function _longjmp(env, value) {
    _setThrew(env, value || 1);
    throw "longjmp";
}
function _emscripten_longjmp(env, value) {
    _longjmp(env, value);
}
function __emscripten_do_request_fullscreen(target, strategy) {
    if (!JSEvents.fullscreenEnabled()) return -1;
    if (!target) target = "#canvas";
    target = __findEventTarget(target);
    if (!target) return -4;
    if (!target.requestFullscreen && !target.msRequestFullscreen && !target.mozRequestFullScreen && !target.mozRequestFullscreen && !target.webkitRequestFullscreen) {
        return -3;
    }
    var canPerformRequests = JSEvents.canPerformEventHandlerRequests();
    if (!canPerformRequests) {
        if (strategy.deferUntilInEventHandler) {
            JSEvents.deferCall(_JSEvents_requestFullscreen, 1, [target, strategy]);
            return 1;
        } else {
            return -2;
        }
    }
    return _JSEvents_requestFullscreen(target, strategy);
}
function _emscripten_request_fullscreen_strategy(target, deferUntilInEventHandler, fullscreenStrategy) {
    var strategy = {};
    strategy.scaleMode = HEAP32[fullscreenStrategy >> 2];
    strategy.canvasResolutionScaleMode = HEAP32[(fullscreenStrategy + 4) >> 2];
    strategy.filteringMode = HEAP32[(fullscreenStrategy + 8) >> 2];
    strategy.deferUntilInEventHandler = deferUntilInEventHandler;
    strategy.canvasResizedCallback = HEAP32[(fullscreenStrategy + 12) >> 2];
    strategy.canvasResizedCallbackUserData = HEAP32[(fullscreenStrategy + 16) >> 2];
    __currentFullscreenStrategy = strategy;
    return __emscripten_do_request_fullscreen(target, strategy);
}
function _emscripten_request_pointerlock(target, deferUntilInEventHandler) {
    if (!target) target = "#canvas";
    target = __findEventTarget(target);
    if (!target) return -4;
    if (!target.requestPointerLock && !target.mozRequestPointerLock && !target.webkitRequestPointerLock && !target.msRequestPointerLock) {
        return -1;
    }
    var canPerformRequests = JSEvents.canPerformEventHandlerRequests();
    if (!canPerformRequests) {
        if (deferUntilInEventHandler) {
            JSEvents.deferCall(__requestPointerLock, 2, [target]);
            return 1;
        } else {
            return -2;
        }
    }
    return __requestPointerLock(target);
}
function _emscripten_run_script(ptr) {
    eval(UTF8ToString(ptr));
}
function _emscripten_run_script_int(ptr) {
    return eval(UTF8ToString(ptr)) | 0;
}
function _emscripten_run_script_string(ptr) {
    var s = eval(UTF8ToString(ptr));
    if (s == null) {
        return 0;
    }
    s += "";
    var me = _emscripten_run_script_string;
    var len = lengthBytesUTF8(s);
    if (!me.bufferSize || me.bufferSize < len + 1) {
        if (me.bufferSize) _free(me.buffer);
        me.bufferSize = len + 1;
        me.buffer = _malloc(me.bufferSize);
    }
    stringToUTF8(s, me.buffer, me.bufferSize);
    return me.buffer;
}
function _emscripten_sample_gamepad_data() {
    return (JSEvents.lastGamepadState = navigator.getGamepads ? navigator.getGamepads() : navigator.webkitGetGamepads ? navigator.webkitGetGamepads() : null) ? 0 : -1;
}
function __registerBeforeUnloadEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
    var beforeUnloadEventHandlerFunc = function (ev) {
        var e = ev || event;
        var confirmationMessage = dynCall_iiii(callbackfunc, eventTypeId, 0, userData);
        if (confirmationMessage) {
            confirmationMessage = UTF8ToString(confirmationMessage);
        }
        if (confirmationMessage) {
            e.preventDefault();
            e.returnValue = confirmationMessage;
            return confirmationMessage;
        }
    };
    var eventHandler = { target: __findEventTarget(target), allowsDeferredCalls: false, eventTypeString: eventTypeString, callbackfunc: callbackfunc, handlerFunc: beforeUnloadEventHandlerFunc, useCapture: useCapture };
    JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_beforeunload_callback_on_thread(userData, callbackfunc, targetThread) {
    if (typeof onbeforeunload === "undefined") return -1;
    if (targetThread !== 1) return -5;
    __registerBeforeUnloadEventCallback(2, userData, true, callbackfunc, 28, "beforeunload");
    return 0;
}
function __registerFocusEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
    if (!JSEvents.focusEvent) JSEvents.focusEvent = _malloc(256);
    var focusEventHandlerFunc = function (ev) {
        var e = ev || event;
        var nodeName = JSEvents.getNodeNameForTarget(e.target);
        var id = e.target.id ? e.target.id : "";
        var focusEvent = JSEvents.focusEvent;
        stringToUTF8(nodeName, focusEvent + 0, 128);
        stringToUTF8(id, focusEvent + 128, 128);
        if (dynCall_iiii(callbackfunc, eventTypeId, focusEvent, userData)) e.preventDefault();
    };
    var eventHandler = { target: __findEventTarget(target), allowsDeferredCalls: false, eventTypeString: eventTypeString, callbackfunc: callbackfunc, handlerFunc: focusEventHandlerFunc, useCapture: useCapture };
    JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_blur_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    __registerFocusEventCallback(target, userData, useCapture, callbackfunc, 12, "blur", targetThread);
    return 0;
}
function _emscripten_set_element_css_size(target, width, height) {
    target = target ? __findEventTarget(target) : Module["canvas"];
    if (!target) return -4;
    target.style.width = width + "px";
    target.style.height = height + "px";
    return 0;
}
function _emscripten_set_focus_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    __registerFocusEventCallback(target, userData, useCapture, callbackfunc, 13, "focus", targetThread);
    return 0;
}
function __fillFullscreenChangeEventData(eventStruct, e) {
    var fullscreenElement = document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
    var isFullscreen = !!fullscreenElement;
    HEAP32[eventStruct >> 2] = isFullscreen;
    HEAP32[(eventStruct + 4) >> 2] = JSEvents.fullscreenEnabled();
    var reportedElement = isFullscreen ? fullscreenElement : JSEvents.previousFullscreenElement;
    var nodeName = JSEvents.getNodeNameForTarget(reportedElement);
    var id = reportedElement && reportedElement.id ? reportedElement.id : "";
    stringToUTF8(nodeName, eventStruct + 8, 128);
    stringToUTF8(id, eventStruct + 136, 128);
    HEAP32[(eventStruct + 264) >> 2] = reportedElement ? reportedElement.clientWidth : 0;
    HEAP32[(eventStruct + 268) >> 2] = reportedElement ? reportedElement.clientHeight : 0;
    HEAP32[(eventStruct + 272) >> 2] = screen.width;
    HEAP32[(eventStruct + 276) >> 2] = screen.height;
    if (isFullscreen) {
        JSEvents.previousFullscreenElement = fullscreenElement;
    }
}
function __registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
    if (!JSEvents.fullscreenChangeEvent) JSEvents.fullscreenChangeEvent = _malloc(280);
    var fullscreenChangeEventhandlerFunc = function (ev) {
        var e = ev || event;
        var fullscreenChangeEvent = JSEvents.fullscreenChangeEvent;
        __fillFullscreenChangeEventData(fullscreenChangeEvent, e);
        if (dynCall_iiii(callbackfunc, eventTypeId, fullscreenChangeEvent, userData)) e.preventDefault();
    };
    var eventHandler = { target: target, allowsDeferredCalls: false, eventTypeString: eventTypeString, callbackfunc: callbackfunc, handlerFunc: fullscreenChangeEventhandlerFunc, useCapture: useCapture };
    JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_fullscreenchange_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    if (!JSEvents.fullscreenEnabled()) return -1;
    target = target ? __findEventTarget(target) : __specialEventTargets[1];
    if (!target) return -4;
    __registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, 19, "fullscreenchange", targetThread);
    __registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, 19, "mozfullscreenchange", targetThread);
    __registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, 19, "webkitfullscreenchange", targetThread);
    __registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, 19, "msfullscreenchange", targetThread);
    return 0;
}
function __registerGamepadEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
    if (!JSEvents.gamepadEvent) JSEvents.gamepadEvent = _malloc(1432);
    var gamepadEventHandlerFunc = function (ev) {
        var e = ev || event;
        var gamepadEvent = JSEvents.gamepadEvent;
        __fillGamepadEventData(gamepadEvent, e["gamepad"]);
        if (dynCall_iiii(callbackfunc, eventTypeId, gamepadEvent, userData)) e.preventDefault();
    };
    var eventHandler = { target: __findEventTarget(target), allowsDeferredCalls: true, eventTypeString: eventTypeString, callbackfunc: callbackfunc, handlerFunc: gamepadEventHandlerFunc, useCapture: useCapture };
    JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_gamepadconnected_callback_on_thread(userData, useCapture, callbackfunc, targetThread) {
    if (!navigator.getGamepads && !navigator.webkitGetGamepads) return -1;
    __registerGamepadEventCallback(2, userData, useCapture, callbackfunc, 26, "gamepadconnected", targetThread);
    return 0;
}
function _emscripten_set_gamepaddisconnected_callback_on_thread(userData, useCapture, callbackfunc, targetThread) {
    if (!navigator.getGamepads && !navigator.webkitGetGamepads) return -1;
    __registerGamepadEventCallback(2, userData, useCapture, callbackfunc, 27, "gamepaddisconnected", targetThread);
    return 0;
}
function __registerKeyEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
    if (!JSEvents.keyEvent) JSEvents.keyEvent = _malloc(164);
    var keyEventHandlerFunc = function (ev) {
        var e = ev || event;
        var keyEventData = JSEvents.keyEvent;
        stringToUTF8(e.key ? e.key : "", keyEventData + 0, 32);
        stringToUTF8(e.code ? e.code : "", keyEventData + 32, 32);
        HEAP32[(keyEventData + 64) >> 2] = e.location;
        HEAP32[(keyEventData + 68) >> 2] = e.ctrlKey;
        HEAP32[(keyEventData + 72) >> 2] = e.shiftKey;
        HEAP32[(keyEventData + 76) >> 2] = e.altKey;
        HEAP32[(keyEventData + 80) >> 2] = e.metaKey;
        HEAP32[(keyEventData + 84) >> 2] = e.repeat;
        stringToUTF8(e.locale ? e.locale : "", keyEventData + 88, 32);
        stringToUTF8(e.char ? e.char : "", keyEventData + 120, 32);
        HEAP32[(keyEventData + 152) >> 2] = e.charCode;
        HEAP32[(keyEventData + 156) >> 2] = e.keyCode;
        HEAP32[(keyEventData + 160) >> 2] = e.which;
        if (dynCall_iiii(callbackfunc, eventTypeId, keyEventData, userData)) e.preventDefault();
    };
    var eventHandler = {
        target: __findEventTarget(target),
        allowsDeferredCalls: JSEvents.isInternetExplorer() ? false : true,
        eventTypeString: eventTypeString,
        callbackfunc: callbackfunc,
        handlerFunc: keyEventHandlerFunc,
        useCapture: useCapture,
    };
    JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_keydown_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    __registerKeyEventCallback(target, userData, useCapture, callbackfunc, 2, "keydown", targetThread);
    return 0;
}
function _emscripten_set_keypress_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    __registerKeyEventCallback(target, userData, useCapture, callbackfunc, 1, "keypress", targetThread);
    return 0;
}
function _emscripten_set_keyup_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    __registerKeyEventCallback(target, userData, useCapture, callbackfunc, 3, "keyup", targetThread);
    return 0;
}
function _emscripten_set_main_loop_arg(func, arg, fps, simulateInfiniteLoop) {
    _emscripten_set_main_loop(func, fps, simulateInfiniteLoop, arg);
}
function __fillMouseEventData(eventStruct, e, target) {
    HEAPF64[eventStruct >> 3] = JSEvents.tick();
    HEAP32[(eventStruct + 8) >> 2] = e.screenX;
    HEAP32[(eventStruct + 12) >> 2] = e.screenY;
    HEAP32[(eventStruct + 16) >> 2] = e.clientX;
    HEAP32[(eventStruct + 20) >> 2] = e.clientY;
    HEAP32[(eventStruct + 24) >> 2] = e.ctrlKey;
    HEAP32[(eventStruct + 28) >> 2] = e.shiftKey;
    HEAP32[(eventStruct + 32) >> 2] = e.altKey;
    HEAP32[(eventStruct + 36) >> 2] = e.metaKey;
    HEAP16[(eventStruct + 40) >> 1] = e.button;
    HEAP16[(eventStruct + 42) >> 1] = e.buttons;
    HEAP32[(eventStruct + 44) >> 2] = e["movementX"] || e["mozMovementX"] || e["webkitMovementX"] || e.screenX - JSEvents.previousScreenX;
    HEAP32[(eventStruct + 48) >> 2] = e["movementY"] || e["mozMovementY"] || e["webkitMovementY"] || e.screenY - JSEvents.previousScreenY;
    if (Module["canvas"]) {
        var rect = Module["canvas"].getBoundingClientRect();
        HEAP32[(eventStruct + 60) >> 2] = e.clientX - rect.left;
        HEAP32[(eventStruct + 64) >> 2] = e.clientY - rect.top;
    } else {
        HEAP32[(eventStruct + 60) >> 2] = 0;
        HEAP32[(eventStruct + 64) >> 2] = 0;
    }
    if (target) {
        var rect = JSEvents.getBoundingClientRectOrZeros(target);
        HEAP32[(eventStruct + 52) >> 2] = e.clientX - rect.left;
        HEAP32[(eventStruct + 56) >> 2] = e.clientY - rect.top;
    } else {
        HEAP32[(eventStruct + 52) >> 2] = 0;
        HEAP32[(eventStruct + 56) >> 2] = 0;
    }
    if (e.type !== "wheel" && e.type !== "mousewheel") {
        JSEvents.previousScreenX = e.screenX;
        JSEvents.previousScreenY = e.screenY;
    }
}
function __registerMouseEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
    if (!JSEvents.mouseEvent) JSEvents.mouseEvent = _malloc(72);
    target = __findEventTarget(target);
    var mouseEventHandlerFunc = function (ev) {
        var e = ev || event;
        __fillMouseEventData(JSEvents.mouseEvent, e, target);
        if (dynCall_iiii(callbackfunc, eventTypeId, JSEvents.mouseEvent, userData)) e.preventDefault();
    };
    var eventHandler = {
        target: target,
        allowsDeferredCalls: eventTypeString != "mousemove" && eventTypeString != "mouseenter" && eventTypeString != "mouseleave",
        eventTypeString: eventTypeString,
        callbackfunc: callbackfunc,
        handlerFunc: mouseEventHandlerFunc,
        useCapture: useCapture,
    };
    if (JSEvents.isInternetExplorer() && eventTypeString == "mousedown") eventHandler.allowsDeferredCalls = false;
    JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_mousedown_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    __registerMouseEventCallback(target, userData, useCapture, callbackfunc, 5, "mousedown", targetThread);
    return 0;
}
function _emscripten_set_mouseenter_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    __registerMouseEventCallback(target, userData, useCapture, callbackfunc, 33, "mouseenter", targetThread);
    return 0;
}
function _emscripten_set_mouseleave_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    __registerMouseEventCallback(target, userData, useCapture, callbackfunc, 34, "mouseleave", targetThread);
    return 0;
}
function _emscripten_set_mousemove_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    __registerMouseEventCallback(target, userData, useCapture, callbackfunc, 8, "mousemove", targetThread);
    return 0;
}
function _emscripten_set_mouseup_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    __registerMouseEventCallback(target, userData, useCapture, callbackfunc, 6, "mouseup", targetThread);
    return 0;
}
function __fillPointerlockChangeEventData(eventStruct, e) {
    var pointerLockElement = document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement || document.msPointerLockElement;
    var isPointerlocked = !!pointerLockElement;
    HEAP32[eventStruct >> 2] = isPointerlocked;
    var nodeName = JSEvents.getNodeNameForTarget(pointerLockElement);
    var id = pointerLockElement && pointerLockElement.id ? pointerLockElement.id : "";
    stringToUTF8(nodeName, eventStruct + 4, 128);
    stringToUTF8(id, eventStruct + 132, 128);
}
function __registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
    if (!JSEvents.pointerlockChangeEvent) JSEvents.pointerlockChangeEvent = _malloc(260);
    var pointerlockChangeEventHandlerFunc = function (ev) {
        var e = ev || event;
        var pointerlockChangeEvent = JSEvents.pointerlockChangeEvent;
        __fillPointerlockChangeEventData(pointerlockChangeEvent, e);
        if (dynCall_iiii(callbackfunc, eventTypeId, pointerlockChangeEvent, userData)) e.preventDefault();
    };
    var eventHandler = { target: target, allowsDeferredCalls: false, eventTypeString: eventTypeString, callbackfunc: callbackfunc, handlerFunc: pointerlockChangeEventHandlerFunc, useCapture: useCapture };
    JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_pointerlockchange_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    if (!document || !document.body || (!document.body.requestPointerLock && !document.body.mozRequestPointerLock && !document.body.webkitRequestPointerLock && !document.body.msRequestPointerLock)) {
        return -1;
    }
    target = target ? __findEventTarget(target) : __specialEventTargets[1];
    if (!target) return -4;
    __registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "pointerlockchange", targetThread);
    __registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "mozpointerlockchange", targetThread);
    __registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "webkitpointerlockchange", targetThread);
    __registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "mspointerlockchange", targetThread);
    return 0;
}
function __registerUiEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
    if (!JSEvents.uiEvent) JSEvents.uiEvent = _malloc(36);
    if (eventTypeString == "scroll" && !target) {
        target = document;
    } else {
        target = __findEventTarget(target);
    }
    var uiEventHandlerFunc = function (ev) {
        var e = ev || event;
        if (e.target != target) {
            return;
        }
        var scrollPos = JSEvents.pageScrollPos();
        var uiEvent = JSEvents.uiEvent;
        HEAP32[uiEvent >> 2] = e.detail;
        HEAP32[(uiEvent + 4) >> 2] = document.body.clientWidth;
        HEAP32[(uiEvent + 8) >> 2] = document.body.clientHeight;
        HEAP32[(uiEvent + 12) >> 2] = innerWidth;
        HEAP32[(uiEvent + 16) >> 2] = innerHeight;
        HEAP32[(uiEvent + 20) >> 2] = outerWidth;
        HEAP32[(uiEvent + 24) >> 2] = outerHeight;
        HEAP32[(uiEvent + 28) >> 2] = scrollPos[0];
        HEAP32[(uiEvent + 32) >> 2] = scrollPos[1];
        if (dynCall_iiii(callbackfunc, eventTypeId, uiEvent, userData)) e.preventDefault();
    };
    var eventHandler = { target: target, allowsDeferredCalls: false, eventTypeString: eventTypeString, callbackfunc: callbackfunc, handlerFunc: uiEventHandlerFunc, useCapture: useCapture };
    JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_resize_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    __registerUiEventCallback(target, userData, useCapture, callbackfunc, 10, "resize", targetThread);
    return 0;
}
function __registerTouchEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
    if (!JSEvents.touchEvent) JSEvents.touchEvent = _malloc(1684);
    target = __findEventTarget(target);
    var touchEventHandlerFunc = function (ev) {
        var e = ev || event;
        var touches = {};
        for (var i = 0; i < e.touches.length; ++i) {
            var touch = e.touches[i];
            touch.changed = false;
            touches[touch.identifier] = touch;
        }
        for (var i = 0; i < e.changedTouches.length; ++i) {
            var touch = e.changedTouches[i];
            touches[touch.identifier] = touch;
            touch.changed = true;
        }
        for (var i = 0; i < e.targetTouches.length; ++i) {
            var touch = e.targetTouches[i];
            touches[touch.identifier].onTarget = true;
        }
        var touchEvent = JSEvents.touchEvent;
        var ptr = touchEvent;
        HEAP32[(ptr + 4) >> 2] = e.ctrlKey;
        HEAP32[(ptr + 8) >> 2] = e.shiftKey;
        HEAP32[(ptr + 12) >> 2] = e.altKey;
        HEAP32[(ptr + 16) >> 2] = e.metaKey;
        ptr += 20;
        var canvasRect = Module["canvas"] ? Module["canvas"].getBoundingClientRect() : undefined;
        var targetRect = JSEvents.getBoundingClientRectOrZeros(target);
        var numTouches = 0;
        for (var i in touches) {
            var t = touches[i];
            HEAP32[ptr >> 2] = t.identifier;
            HEAP32[(ptr + 4) >> 2] = t.screenX;
            HEAP32[(ptr + 8) >> 2] = t.screenY;
            HEAP32[(ptr + 12) >> 2] = t.clientX;
            HEAP32[(ptr + 16) >> 2] = t.clientY;
            HEAP32[(ptr + 20) >> 2] = t.pageX;
            HEAP32[(ptr + 24) >> 2] = t.pageY;
            HEAP32[(ptr + 28) >> 2] = t.changed;
            HEAP32[(ptr + 32) >> 2] = t.onTarget;
            if (canvasRect) {
                HEAP32[(ptr + 44) >> 2] = t.clientX - canvasRect.left;
                HEAP32[(ptr + 48) >> 2] = t.clientY - canvasRect.top;
            } else {
                HEAP32[(ptr + 44) >> 2] = 0;
                HEAP32[(ptr + 48) >> 2] = 0;
            }
            HEAP32[(ptr + 36) >> 2] = t.clientX - targetRect.left;
            HEAP32[(ptr + 40) >> 2] = t.clientY - targetRect.top;
            ptr += 52;
            if (++numTouches >= 32) {
                break;
            }
        }
        HEAP32[touchEvent >> 2] = numTouches;
        if (dynCall_iiii(callbackfunc, eventTypeId, touchEvent, userData)) e.preventDefault();
    };
    var eventHandler = {
        target: target,
        allowsDeferredCalls: eventTypeString == "touchstart" || eventTypeString == "touchend",
        eventTypeString: eventTypeString,
        callbackfunc: callbackfunc,
        handlerFunc: touchEventHandlerFunc,
        useCapture: useCapture,
    };
    JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_touchcancel_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    __registerTouchEventCallback(target, userData, useCapture, callbackfunc, 25, "touchcancel", targetThread);
    return 0;
}
function _emscripten_set_touchend_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    __registerTouchEventCallback(target, userData, useCapture, callbackfunc, 23, "touchend", targetThread);
    return 0;
}
function _emscripten_set_touchmove_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    __registerTouchEventCallback(target, userData, useCapture, callbackfunc, 24, "touchmove", targetThread);
    return 0;
}
function _emscripten_set_touchstart_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    __registerTouchEventCallback(target, userData, useCapture, callbackfunc, 22, "touchstart", targetThread);
    return 0;
}
function __fillVisibilityChangeEventData(eventStruct, e) {
    var visibilityStates = ["hidden", "visible", "prerender", "unloaded"];
    var visibilityState = visibilityStates.indexOf(document.visibilityState);
    HEAP32[eventStruct >> 2] = document.hidden;
    HEAP32[(eventStruct + 4) >> 2] = visibilityState;
}
function __registerVisibilityChangeEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
    if (!JSEvents.visibilityChangeEvent) JSEvents.visibilityChangeEvent = _malloc(8);
    var visibilityChangeEventHandlerFunc = function (ev) {
        var e = ev || event;
        var visibilityChangeEvent = JSEvents.visibilityChangeEvent;
        __fillVisibilityChangeEventData(visibilityChangeEvent, e);
        if (dynCall_iiii(callbackfunc, eventTypeId, visibilityChangeEvent, userData)) e.preventDefault();
    };
    var eventHandler = { target: target, allowsDeferredCalls: false, eventTypeString: eventTypeString, callbackfunc: callbackfunc, handlerFunc: visibilityChangeEventHandlerFunc, useCapture: useCapture };
    JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_visibilitychange_callback_on_thread(userData, useCapture, callbackfunc, targetThread) {
    __registerVisibilityChangeEventCallback(__specialEventTargets[1], userData, useCapture, callbackfunc, 21, "visibilitychange", targetThread);
    return 0;
}
function __registerWheelEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
    if (!JSEvents.wheelEvent) JSEvents.wheelEvent = _malloc(104);
    var wheelHandlerFunc = function (ev) {
        var e = ev || event;
        var wheelEvent = JSEvents.wheelEvent;
        __fillMouseEventData(wheelEvent, e, target);
        HEAPF64[(wheelEvent + 72) >> 3] = e["deltaX"];
        HEAPF64[(wheelEvent + 80) >> 3] = e["deltaY"];
        HEAPF64[(wheelEvent + 88) >> 3] = e["deltaZ"];
        HEAP32[(wheelEvent + 96) >> 2] = e["deltaMode"];
        if (dynCall_iiii(callbackfunc, eventTypeId, wheelEvent, userData)) e.preventDefault();
    };
    var mouseWheelHandlerFunc = function (ev) {
        var e = ev || event;
        __fillMouseEventData(JSEvents.wheelEvent, e, target);
        HEAPF64[(JSEvents.wheelEvent + 72) >> 3] = e["wheelDeltaX"] || 0;
        HEAPF64[(JSEvents.wheelEvent + 80) >> 3] = -(e["wheelDeltaY"] || e["wheelDelta"]);
        HEAPF64[(JSEvents.wheelEvent + 88) >> 3] = 0;
        HEAP32[(JSEvents.wheelEvent + 96) >> 2] = 0;
        var shouldCancel = dynCall_iiii(callbackfunc, eventTypeId, JSEvents.wheelEvent, userData);
        if (shouldCancel) {
            e.preventDefault();
        }
    };
    var eventHandler = { target: target, allowsDeferredCalls: true, eventTypeString: eventTypeString, callbackfunc: callbackfunc, handlerFunc: eventTypeString == "wheel" ? wheelHandlerFunc : mouseWheelHandlerFunc, useCapture: useCapture };
    JSEvents.registerOrRemoveHandler(eventHandler);
}
function _emscripten_set_wheel_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
    target = __findEventTarget(target);
    if (typeof target.onwheel !== "undefined") {
        __registerWheelEventCallback(target, userData, useCapture, callbackfunc, 9, "wheel", targetThread);
        return 0;
    } else if (typeof target.onmousewheel !== "undefined") {
        __registerWheelEventCallback(target, userData, useCapture, callbackfunc, 9, "mousewheel", targetThread);
        return 0;
    } else {
        return -1;
    }
}
function _emscripten_sleep(ms) {
    EmterpreterAsync.handle(function (resume) {
        setTimeout(function () {
            resume();
        }, ms);
    });
}
function _emscripten_sleep_with_yield(ms) {
    EmterpreterAsync.handle(function (resume) {
        Browser.safeSetTimeout(resume, ms);
    }, true);
}
function _endpwent() {
    throw "endpwent: TODO";
}
function _execl() {
    ___setErrNo(8);
    return -1;
}
function _execv() {
    return _execl.apply(null, arguments);
}
function _execve() {
    return _execl.apply(null, arguments);
}
var _fabs = Math_abs;
function _fork() {
    ___setErrNo(11);
    return -1;
}
function _fpathconf(fildes, name) {
    switch (name) {
        case 0:
            return 32e3;
        case 1:
        case 2:
        case 3:
            return 255;
        case 4:
        case 5:
        case 16:
        case 17:
        case 18:
            return 4096;
        case 6:
        case 7:
        case 20:
            return 1;
        case 8:
            return 0;
        case 9:
        case 10:
        case 11:
        case 12:
        case 14:
        case 15:
        case 19:
            return -1;
        case 13:
            return 64;
    }
    ___setErrNo(22);
    return -1;
}
function _ftime(p) {
    var millis = Date.now();
    HEAP32[p >> 2] = (millis / 1e3) | 0;
    HEAP16[(p + 4) >> 1] = millis % 1e3;
    HEAP16[(p + 6) >> 1] = 0;
    HEAP16[(p + 8) >> 1] = 0;
    return 0;
}
var GAI_ERRNO_MESSAGES = {};
function _gai_strerror(val) {
    var buflen = 256;
    if (!_gai_strerror.buffer) {
        _gai_strerror.buffer = _malloc(buflen);
        GAI_ERRNO_MESSAGES["0"] = "Success";
        GAI_ERRNO_MESSAGES["" + -1] = "Invalid value for 'ai_flags' field";
        GAI_ERRNO_MESSAGES["" + -2] = "NAME or SERVICE is unknown";
        GAI_ERRNO_MESSAGES["" + -3] = "Temporary failure in name resolution";
        GAI_ERRNO_MESSAGES["" + -4] = "Non-recoverable failure in name res";
        GAI_ERRNO_MESSAGES["" + -6] = "'ai_family' not supported";
        GAI_ERRNO_MESSAGES["" + -7] = "'ai_socktype' not supported";
        GAI_ERRNO_MESSAGES["" + -8] = "SERVICE not supported for 'ai_socktype'";
        GAI_ERRNO_MESSAGES["" + -10] = "Memory allocation failure";
        GAI_ERRNO_MESSAGES["" + -11] = "System error returned in 'errno'";
        GAI_ERRNO_MESSAGES["" + -12] = "Argument buffer overflow";
    }
    var msg = "Unknown error";
    if (val in GAI_ERRNO_MESSAGES) {
        if (GAI_ERRNO_MESSAGES[val].length > buflen - 1) {
            msg = "Message too long";
        } else {
            msg = GAI_ERRNO_MESSAGES[val];
        }
    }
    writeAsciiToMemory(msg, _gai_strerror.buffer);
    return _gai_strerror.buffer;
}
function _getaddrinfo(node, service, hint, out) {
    var addr = 0;
    var port = 0;
    var flags = 0;
    var family = 0;
    var type = 0;
    var proto = 0;
    var ai;
    function allocaddrinfo(family, type, proto, canon, addr, port) {
        var sa, salen, ai;
        var res;
        salen = family === 10 ? 28 : 16;
        addr = family === 10 ? __inet_ntop6_raw(addr) : __inet_ntop4_raw(addr);
        sa = _malloc(salen);
        res = __write_sockaddr(sa, family, addr, port);
        assert(!res.errno);
        ai = _malloc(32);
        HEAP32[(ai + 4) >> 2] = family;
        HEAP32[(ai + 8) >> 2] = type;
        HEAP32[(ai + 12) >> 2] = proto;
        HEAP32[(ai + 24) >> 2] = canon;
        HEAP32[(ai + 20) >> 2] = sa;
        if (family === 10) {
            HEAP32[(ai + 16) >> 2] = 28;
        } else {
            HEAP32[(ai + 16) >> 2] = 16;
        }
        HEAP32[(ai + 28) >> 2] = 0;
        return ai;
    }
    if (hint) {
        flags = HEAP32[hint >> 2];
        family = HEAP32[(hint + 4) >> 2];
        type = HEAP32[(hint + 8) >> 2];
        proto = HEAP32[(hint + 12) >> 2];
    }
    if (type && !proto) {
        proto = type === 2 ? 17 : 6;
    }
    if (!type && proto) {
        type = proto === 17 ? 2 : 1;
    }
    if (proto === 0) {
        proto = 6;
    }
    if (type === 0) {
        type = 1;
    }
    if (!node && !service) {
        return -2;
    }
    if (flags & ~(1 | 2 | 4 | 1024 | 8 | 16 | 32)) {
        return -1;
    }
    if (hint !== 0 && HEAP32[hint >> 2] & 2 && !node) {
        return -1;
    }
    if (flags & 32) {
        return -2;
    }
    if (type !== 0 && type !== 1 && type !== 2) {
        return -7;
    }
    if (family !== 0 && family !== 2 && family !== 10) {
        return -6;
    }
    if (service) {
        service = UTF8ToString(service);
        port = parseInt(service, 10);
        if (isNaN(port)) {
            if (flags & 1024) {
                return -2;
            }
            return -8;
        }
    }
    if (!node) {
        if (family === 0) {
            family = 2;
        }
        if ((flags & 1) === 0) {
            if (family === 2) {
                addr = _htonl(2130706433);
            } else {
                addr = [0, 0, 0, 1];
            }
        }
        ai = allocaddrinfo(family, type, proto, null, addr, port);
        HEAP32[out >> 2] = ai;
        return 0;
    }
    node = UTF8ToString(node);
    addr = __inet_pton4_raw(node);
    if (addr !== null) {
        if (family === 0 || family === 2) {
            family = 2;
        } else if (family === 10 && flags & 8) {
            addr = [0, 0, _htonl(65535), addr];
            family = 10;
        } else {
            return -2;
        }
    } else {
        addr = __inet_pton6_raw(node);
        if (addr !== null) {
            if (family === 0 || family === 10) {
                family = 10;
            } else {
                return -2;
            }
        }
    }
    if (addr != null) {
        ai = allocaddrinfo(family, type, proto, node, addr, port);
        HEAP32[out >> 2] = ai;
        return 0;
    }
    if (flags & 4) {
        return -2;
    }
    node = DNS.lookup_name(node);
    addr = __inet_pton4_raw(node);
    if (family === 0) {
        family = 2;
    } else if (family === 10) {
        addr = [0, 0, _htonl(65535), addr];
    }
    ai = allocaddrinfo(family, type, proto, null, addr, port);
    HEAP32[out >> 2] = ai;
    return 0;
}
function _getenv(name) {
    if (name === 0) return 0;
    name = UTF8ToString(name);
    if (!ENV.hasOwnProperty(name)) return 0;
    if (_getenv.ret) _free(_getenv.ret);
    _getenv.ret = allocateUTF8(ENV[name]);
    return _getenv.ret;
}
function _gethostbyname(name) {
    name = UTF8ToString(name);
    var ret = _malloc(20);
    var nameBuf = _malloc(name.length + 1);
    stringToUTF8(name, nameBuf, name.length + 1);
    HEAP32[ret >> 2] = nameBuf;
    var aliasesBuf = _malloc(4);
    HEAP32[aliasesBuf >> 2] = 0;
    HEAP32[(ret + 4) >> 2] = aliasesBuf;
    var afinet = 2;
    HEAP32[(ret + 8) >> 2] = afinet;
    HEAP32[(ret + 12) >> 2] = 4;
    var addrListBuf = _malloc(12);
    HEAP32[addrListBuf >> 2] = addrListBuf + 8;
    HEAP32[(addrListBuf + 4) >> 2] = 0;
    HEAP32[(addrListBuf + 8) >> 2] = __inet_pton4_raw(DNS.lookup_name(name));
    HEAP32[(ret + 16) >> 2] = addrListBuf;
    return ret;
}
function _gethostbyaddr(addr, addrlen, type) {
    if (type !== 2) {
        ___setErrNo(97);
        return null;
    }
    addr = HEAP32[addr >> 2];
    var host = __inet_ntop4_raw(addr);
    var lookup = DNS.lookup_addr(host);
    if (lookup) {
        host = lookup;
    }
    var hostp = allocate(intArrayFromString(host), "i8", ALLOC_STACK);
    return _gethostbyname(hostp);
}
function _getloadavg(loadavg, nelem) {
    var limit = Math.min(nelem, 3);
    var doubleSize = 8;
    for (var i = 0; i < limit; i++) {
        HEAPF64[(loadavg + i * doubleSize) >> 3] = 0.1;
    }
    return limit;
}
function _getnameinfo(sa, salen, node, nodelen, serv, servlen, flags) {
    var info = __read_sockaddr(sa, salen);
    if (info.errno) {
        return -6;
    }
    var port = info.port;
    var addr = info.addr;
    var overflowed = false;
    if (node && nodelen) {
        var lookup;
        if (flags & 1 || !(lookup = DNS.lookup_addr(addr))) {
            if (flags & 8) {
                return -2;
            }
        } else {
            addr = lookup;
        }
        var numBytesWrittenExclNull = stringToUTF8(addr, node, nodelen);
        if (numBytesWrittenExclNull + 1 >= nodelen) {
            overflowed = true;
        }
    }
    if (serv && servlen) {
        port = "" + port;
        var numBytesWrittenExclNull = stringToUTF8(port, serv, servlen);
        if (numBytesWrittenExclNull + 1 >= servlen) {
            overflowed = true;
        }
    }
    if (overflowed) {
        return -12;
    }
    return 0;
}
var Protocols = { list: [], map: {} };
function _setprotoent(stayopen) {
    function allocprotoent(name, proto, aliases) {
        var nameBuf = _malloc(name.length + 1);
        writeAsciiToMemory(name, nameBuf);
        var j = 0;
        var length = aliases.length;
        var aliasListBuf = _malloc((length + 1) * 4);
        for (var i = 0; i < length; i++, j += 4) {
            var alias = aliases[i];
            var aliasBuf = _malloc(alias.length + 1);
            writeAsciiToMemory(alias, aliasBuf);
            HEAP32[(aliasListBuf + j) >> 2] = aliasBuf;
        }
        HEAP32[(aliasListBuf + j) >> 2] = 0;
        var pe = _malloc(12);
        HEAP32[pe >> 2] = nameBuf;
        HEAP32[(pe + 4) >> 2] = aliasListBuf;
        HEAP32[(pe + 8) >> 2] = proto;
        return pe;
    }
    var list = Protocols.list;
    var map = Protocols.map;
    if (list.length === 0) {
        var entry = allocprotoent("tcp", 6, ["TCP"]);
        list.push(entry);
        map["tcp"] = map["6"] = entry;
        entry = allocprotoent("udp", 17, ["UDP"]);
        list.push(entry);
        map["udp"] = map["17"] = entry;
    }
    _setprotoent.index = 0;
}
function _getprotobyname(name) {
    name = UTF8ToString(name);
    _setprotoent(true);
    var result = Protocols.map[name];
    return result;
}
function _getpwent() {
    throw "getpwent: TODO";
}
function _getpwnam() {
    throw "getpwnam: TODO";
}
function _getpwuid(uid) {
    return 0;
}
function _gettimeofday(ptr) {
    var now = Date.now();
    HEAP32[ptr >> 2] = (now / 1e3) | 0;
    HEAP32[(ptr + 4) >> 2] = ((now % 1e3) * 1e3) | 0;
    return 0;
}
function _glActiveTexture(x0) {
    GLctx["activeTexture"](x0);
}
function _glAttachShader(program, shader) {
    GLctx.attachShader(GL.programs[program], GL.shaders[shader]);
}
function _glBindFramebuffer(target, framebuffer) {
    GLctx.bindFramebuffer(target, GL.framebuffers[framebuffer]);
}
function _glBindRenderbuffer(target, renderbuffer) {
    GLctx.bindRenderbuffer(target, GL.renderbuffers[renderbuffer]);
}
function _glBindTexture(target, texture) {
    GLctx.bindTexture(target, GL.textures[texture]);
}
function _glBlendFunc(x0, x1) {
    GLctx["blendFunc"](x0, x1);
}
function _glClear(x0) {
    GLctx["clear"](x0);
}
function _glClearColor(x0, x1, x2, x3) {
    GLctx["clearColor"](x0, x1, x2, x3);
}
function _glCompileShader(shader) {
    GLctx.compileShader(GL.shaders[shader]);
}
function _glCopyTexImage2D(x0, x1, x2, x3, x4, x5, x6, x7) {
    GLctx["copyTexImage2D"](x0, x1, x2, x3, x4, x5, x6, x7);
}
function _glCopyTexSubImage2D(x0, x1, x2, x3, x4, x5, x6, x7) {
    GLctx["copyTexSubImage2D"](x0, x1, x2, x3, x4, x5, x6, x7);
}
function _glCreateProgram() {
    var id = GL.getNewId(GL.programs);
    var program = GLctx.createProgram();
    program.name = id;
    GL.programs[id] = program;
    return id;
}
function _glCreateShader(shaderType) {
    var id = GL.getNewId(GL.shaders);
    GL.shaders[id] = GLctx.createShader(shaderType);
    return id;
}
function _glDeleteFramebuffers(n, framebuffers) {
    for (var i = 0; i < n; ++i) {
        var id = HEAP32[(framebuffers + i * 4) >> 2];
        var framebuffer = GL.framebuffers[id];
        if (!framebuffer) continue;
        GLctx.deleteFramebuffer(framebuffer);
        framebuffer.name = 0;
        GL.framebuffers[id] = null;
    }
}
function _glDeleteProgram(id) {
    if (!id) return;
    var program = GL.programs[id];
    if (!program) {
        GL.recordError(1281);
        return;
    }
    GLctx.deleteProgram(program);
    program.name = 0;
    GL.programs[id] = null;
    GL.programInfos[id] = null;
}
function _glDeleteRenderbuffers(n, renderbuffers) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[(renderbuffers + i * 4) >> 2];
        var renderbuffer = GL.renderbuffers[id];
        if (!renderbuffer) continue;
        GLctx.deleteRenderbuffer(renderbuffer);
        renderbuffer.name = 0;
        GL.renderbuffers[id] = null;
    }
}
function _glDeleteShader(id) {
    if (!id) return;
    var shader = GL.shaders[id];
    if (!shader) {
        GL.recordError(1281);
        return;
    }
    GLctx.deleteShader(shader);
    GL.shaders[id] = null;
}
function _glDeleteTextures(n, textures) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[(textures + i * 4) >> 2];
        var texture = GL.textures[id];
        if (!texture) continue;
        GLctx.deleteTexture(texture);
        texture.name = 0;
        GL.textures[id] = null;
    }
}
function _glDisable(x0) {
    GLctx["disable"](x0);
}
function _glDisableVertexAttribArray(index) {
    var cb = GL.currentContext.clientBuffers[index];
    cb.enabled = false;
    GLctx.disableVertexAttribArray(index);
}
function _glDrawArrays(mode, first, count) {
    GL.preDrawHandleClientVertexAttribBindings(first + count);
    GLctx.drawArrays(mode, first, count);
    GL.postDrawHandleClientVertexAttribBindings();
}
function _glEnable(x0) {
    GLctx["enable"](x0);
}
function _glEnableVertexAttribArray(index) {
    var cb = GL.currentContext.clientBuffers[index];
    cb.enabled = true;
    GLctx.enableVertexAttribArray(index);
}
function _glFinish() {
    GLctx["finish"]();
}
function _glFramebufferRenderbuffer(target, attachment, renderbuffertarget, renderbuffer) {
    GLctx.framebufferRenderbuffer(target, attachment, renderbuffertarget, GL.renderbuffers[renderbuffer]);
}
function _glFramebufferTexture2D(target, attachment, textarget, texture, level) {
    GLctx.framebufferTexture2D(target, attachment, textarget, GL.textures[texture], level);
}
function _glGenFramebuffers(n, ids) {
    __glGenObject(n, ids, "createFramebuffer", GL.framebuffers);
}
function _glGenRenderbuffers(n, renderbuffers) {
    __glGenObject(n, renderbuffers, "createRenderbuffer", GL.renderbuffers);
}
function _glGenTextures(n, textures) {
    __glGenObject(n, textures, "createTexture", GL.textures);
}
function _glGetAttribLocation(program, name) {
    return GLctx.getAttribLocation(GL.programs[program], UTF8ToString(name));
}
function _glGetError() {
    var error = GLctx.getError() || GL.lastError;
    GL.lastError = 0;
    return error;
}
function _glGetIntegerv(name_, p) {
    emscriptenWebGLGet(name_, p, 0);
}
function _glGetProgramInfoLog(program, maxLength, length, infoLog) {
    var log = GLctx.getProgramInfoLog(GL.programs[program]);
    if (log === null) log = "(unknown error)";
    var numBytesWrittenExclNull = maxLength > 0 && infoLog ? stringToUTF8(log, infoLog, maxLength) : 0;
    if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
}
function _glGetProgramiv(program, pname, p) {
    if (!p) {
        GL.recordError(1281);
        return;
    }
    if (program >= GL.counter) {
        GL.recordError(1281);
        return;
    }
    var ptable = GL.programInfos[program];
    if (!ptable) {
        GL.recordError(1282);
        return;
    }
    if (pname == 35716) {
        var log = GLctx.getProgramInfoLog(GL.programs[program]);
        if (log === null) log = "(unknown error)";
        HEAP32[p >> 2] = log.length + 1;
    } else if (pname == 35719) {
        HEAP32[p >> 2] = ptable.maxUniformLength;
    } else if (pname == 35722) {
        if (ptable.maxAttributeLength == -1) {
            program = GL.programs[program];
            var numAttribs = GLctx.getProgramParameter(program, 35721);
            ptable.maxAttributeLength = 0;
            for (var i = 0; i < numAttribs; ++i) {
                var activeAttrib = GLctx.getActiveAttrib(program, i);
                ptable.maxAttributeLength = Math.max(ptable.maxAttributeLength, activeAttrib.name.length + 1);
            }
        }
        HEAP32[p >> 2] = ptable.maxAttributeLength;
    } else if (pname == 35381) {
        if (ptable.maxUniformBlockNameLength == -1) {
            program = GL.programs[program];
            var numBlocks = GLctx.getProgramParameter(program, 35382);
            ptable.maxUniformBlockNameLength = 0;
            for (var i = 0; i < numBlocks; ++i) {
                var activeBlockName = GLctx.getActiveUniformBlockName(program, i);
                ptable.maxUniformBlockNameLength = Math.max(ptable.maxUniformBlockNameLength, activeBlockName.length + 1);
            }
        }
        HEAP32[p >> 2] = ptable.maxUniformBlockNameLength;
    } else {
        HEAP32[p >> 2] = GLctx.getProgramParameter(GL.programs[program], pname);
    }
}
function _glGetShaderInfoLog(shader, maxLength, length, infoLog) {
    var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
    if (log === null) log = "(unknown error)";
    var numBytesWrittenExclNull = maxLength > 0 && infoLog ? stringToUTF8(log, infoLog, maxLength) : 0;
    if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
}
function _glGetShaderiv(shader, pname, p) {
    if (!p) {
        GL.recordError(1281);
        return;
    }
    if (pname == 35716) {
        var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
        if (log === null) log = "(unknown error)";
        HEAP32[p >> 2] = log.length + 1;
    } else if (pname == 35720) {
        var source = GLctx.getShaderSource(GL.shaders[shader]);
        var sourceLength = source === null || source.length == 0 ? 0 : source.length + 1;
        HEAP32[p >> 2] = sourceLength;
    } else {
        HEAP32[p >> 2] = GLctx.getShaderParameter(GL.shaders[shader], pname);
    }
}
function _glGetString(name_) {
    if (GL.stringCache[name_]) return GL.stringCache[name_];
    var ret;
    switch (name_) {
        case 7939:
            var exts = GLctx.getSupportedExtensions() || [];
            exts = exts.concat(
                exts.map(function (e) {
                    return "GL_" + e;
                })
            );
            ret = stringToNewUTF8(exts.join(" "));
            break;
        case 7936:
        case 7937:
        case 37445:
        case 37446:
            var s = GLctx.getParameter(name_);
            if (!s) {
                GL.recordError(1280);
            }
            ret = stringToNewUTF8(s);
            break;
        case 7938:
            var glVersion = GLctx.getParameter(GLctx.VERSION);
            {
                glVersion = "OpenGL ES 2.0 (" + glVersion + ")";
            }
            ret = stringToNewUTF8(glVersion);
            break;
        case 35724:
            var glslVersion = GLctx.getParameter(GLctx.SHADING_LANGUAGE_VERSION);
            var ver_re = /^WebGL GLSL ES ([0-9]\.[0-9][0-9]?)(?:$| .*)/;
            var ver_num = glslVersion.match(ver_re);
            if (ver_num !== null) {
                if (ver_num[1].length == 3) ver_num[1] = ver_num[1] + "0";
                glslVersion = "OpenGL ES GLSL ES " + ver_num[1] + " (" + glslVersion + ")";
            }
            ret = stringToNewUTF8(glslVersion);
            break;
        default:
            GL.recordError(1280);
            return 0;
    }
    GL.stringCache[name_] = ret;
    return ret;
}
function _glGetUniformLocation(program, name) {
    name = UTF8ToString(name);
    var arrayIndex = 0;
    if (name[name.length - 1] == "]") {
        var leftBrace = name.lastIndexOf("[");
        arrayIndex = name[leftBrace + 1] != "]" ? parseInt(name.slice(leftBrace + 1)) : 0;
        name = name.slice(0, leftBrace);
    }
    var uniformInfo = GL.programInfos[program] && GL.programInfos[program].uniforms[name];
    if (uniformInfo && arrayIndex >= 0 && arrayIndex < uniformInfo[0]) {
        return uniformInfo[1] + arrayIndex;
    } else {
        return -1;
    }
}
function _glLinkProgram(program) {
    GLctx.linkProgram(GL.programs[program]);
    GL.populateUniformTable(program);
}
function _glReadPixels(x, y, width, height, format, type, pixels) {
    var pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, format);
    if (!pixelData) {
        GL.recordError(1280);
        return;
    }
    GLctx.readPixels(x, y, width, height, format, type, pixelData);
}
function _glRenderbufferStorage(x0, x1, x2, x3) {
    GLctx["renderbufferStorage"](x0, x1, x2, x3);
}
function _glScissor(x0, x1, x2, x3) {
    GLctx["scissor"](x0, x1, x2, x3);
}
function _glShaderSource(shader, count, string, length) {
    var source = GL.getSource(shader, count, string, length);
    GLctx.shaderSource(GL.shaders[shader], source);
}
function _glTexImage2D(target, level, internalFormat, width, height, border, format, type, pixels) {
    GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels ? emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) : null);
}
function _glTexParameteri(x0, x1, x2) {
    GLctx["texParameteri"](x0, x1, x2);
}
function _glTexSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels) {
    var pixelData = null;
    if (pixels) pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, 0);
    GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixelData);
}
function _glUniform1f(location, v0) {
    GLctx.uniform1f(GL.uniforms[location], v0);
}
function _glUniform1i(location, v0) {
    GLctx.uniform1i(GL.uniforms[location], v0);
}
function _glUniform2f(location, v0, v1) {
    GLctx.uniform2f(GL.uniforms[location], v0, v1);
}
function _glUniform4f(location, v0, v1, v2, v3) {
    GLctx.uniform4f(GL.uniforms[location], v0, v1, v2, v3);
}
function _glUniformMatrix4fv(location, count, transpose, value) {
    if (16 * count <= GL.MINI_TEMP_BUFFER_SIZE) {
        var view = GL.miniTempBufferViews[16 * count - 1];
        for (var i = 0; i < 16 * count; i += 16) {
            view[i] = HEAPF32[(value + 4 * i) >> 2];
            view[i + 1] = HEAPF32[(value + (4 * i + 4)) >> 2];
            view[i + 2] = HEAPF32[(value + (4 * i + 8)) >> 2];
            view[i + 3] = HEAPF32[(value + (4 * i + 12)) >> 2];
            view[i + 4] = HEAPF32[(value + (4 * i + 16)) >> 2];
            view[i + 5] = HEAPF32[(value + (4 * i + 20)) >> 2];
            view[i + 6] = HEAPF32[(value + (4 * i + 24)) >> 2];
            view[i + 7] = HEAPF32[(value + (4 * i + 28)) >> 2];
            view[i + 8] = HEAPF32[(value + (4 * i + 32)) >> 2];
            view[i + 9] = HEAPF32[(value + (4 * i + 36)) >> 2];
            view[i + 10] = HEAPF32[(value + (4 * i + 40)) >> 2];
            view[i + 11] = HEAPF32[(value + (4 * i + 44)) >> 2];
            view[i + 12] = HEAPF32[(value + (4 * i + 48)) >> 2];
            view[i + 13] = HEAPF32[(value + (4 * i + 52)) >> 2];
            view[i + 14] = HEAPF32[(value + (4 * i + 56)) >> 2];
            view[i + 15] = HEAPF32[(value + (4 * i + 60)) >> 2];
        }
    } else {
        var view = HEAPF32.subarray(value >> 2, (value + count * 64) >> 2);
    }
    GLctx.uniformMatrix4fv(GL.uniforms[location], !!transpose, view);
}
function _glUseProgram(program) {
    GLctx.useProgram(GL.programs[program]);
}
function _glVertexAttribPointer(index, size, type, normalized, stride, ptr) {
    var cb = GL.currentContext.clientBuffers[index];
    if (!GL.currArrayBuffer) {
        cb.size = size;
        cb.type = type;
        cb.normalized = normalized;
        cb.stride = stride;
        cb.ptr = ptr;
        cb.clientside = true;
        cb.vertexAttribPointerAdaptor = function (index, size, type, normalized, stride, ptr) {
            this.vertexAttribPointer(index, size, type, normalized, stride, ptr);
        };
        return;
    }
    cb.clientside = false;
    GLctx.vertexAttribPointer(index, size, type, !!normalized, stride, ptr);
}
function _glViewport(x0, x1, x2, x3) {
    GLctx["viewport"](x0, x1, x2, x3);
}
function _gmtime_r(time, tmPtr) {
    var date = new Date(HEAP32[time >> 2] * 1e3);
    HEAP32[tmPtr >> 2] = date.getUTCSeconds();
    HEAP32[(tmPtr + 4) >> 2] = date.getUTCMinutes();
    HEAP32[(tmPtr + 8) >> 2] = date.getUTCHours();
    HEAP32[(tmPtr + 12) >> 2] = date.getUTCDate();
    HEAP32[(tmPtr + 16) >> 2] = date.getUTCMonth();
    HEAP32[(tmPtr + 20) >> 2] = date.getUTCFullYear() - 1900;
    HEAP32[(tmPtr + 24) >> 2] = date.getUTCDay();
    HEAP32[(tmPtr + 36) >> 2] = 0;
    HEAP32[(tmPtr + 32) >> 2] = 0;
    var start = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
    var yday = ((date.getTime() - start) / (1e3 * 60 * 60 * 24)) | 0;
    HEAP32[(tmPtr + 28) >> 2] = yday;
    HEAP32[(tmPtr + 40) >> 2] = ___tm_timezone;
    return tmPtr;
}
function _gmtime(time) {
    return _gmtime_r(time, ___tm_current);
}
function _kill(pid, sig) {
    ___setErrNo(ERRNO_CODES.EPERM);
    return -1;
}
function _killpg() {
    ___setErrNo(ERRNO_CODES.EPERM);
    return -1;
}
function _llvm_copysign_f64(x, y) {
    return y < 0 || (y === 0 && 1 / y < 0) ? -Math_abs(x) : Math_abs(x);
}
function _llvm_exp2_f32(x) {
    return Math.pow(2, x);
}
function _llvm_exp2_f64(a0) {
    return _llvm_exp2_f32(a0);
}
function _llvm_log10_f32(x) {
    return Math.log(x) / Math.LN10;
}
function _llvm_log10_f64(a0) {
    return _llvm_log10_f32(a0);
}
function _llvm_stackrestore(p) {
    var self = _llvm_stacksave;
    var ret = self.LLVM_SAVEDSTACKS[p];
    self.LLVM_SAVEDSTACKS.splice(p, 1);
    stackRestore(ret);
}
function _llvm_stacksave() {
    var self = _llvm_stacksave;
    if (!self.LLVM_SAVEDSTACKS) {
        self.LLVM_SAVEDSTACKS = [];
    }
    self.LLVM_SAVEDSTACKS.push(stackSave());
    return self.LLVM_SAVEDSTACKS.length - 1;
}
function _llvm_trap() {
    abort("trap!");
}
var _llvm_trunc_f64 = Math_trunc;
function _localtime(time) {
    return _localtime_r(time, ___tm_current);
}
function _emscripten_memcpy_big(dest, src, num) {
    HEAPU8.set(HEAPU8.subarray(src, src + num), dest);
}
function _usleep(useconds) {
    var msec = useconds / 1e3;
    if ((ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && self["performance"] && self["performance"]["now"]) {
        var start = self["performance"]["now"]();
        while (self["performance"]["now"]() - start < msec) {}
    } else {
        var start = Date.now();
        while (Date.now() - start < msec) {}
    }
    return 0;
}
function _nanosleep(rqtp, rmtp) {
    if (rqtp === 0) {
        ___setErrNo(22);
        return -1;
    }
    var seconds = HEAP32[rqtp >> 2];
    var nanoseconds = HEAP32[(rqtp + 4) >> 2];
    if (nanoseconds < 0 || nanoseconds > 999999999 || seconds < 0) {
        ___setErrNo(22);
        return -1;
    }
    if (rmtp !== 0) {
        HEAP32[rmtp >> 2] = 0;
        HEAP32[(rmtp + 4) >> 2] = 0;
    }
    return _usleep(seconds * 1e6 + nanoseconds / 1e3);
}
function _pathconf() {
    return _fpathconf.apply(null, arguments);
}
function _pthread_cond_destroy() {
    return 0;
}
function _pthread_cond_init() {
    return 0;
}
function _pthread_cond_signal() {
    return 0;
}
function _pthread_cond_wait() {
    return 0;
}
function _pthread_create() {
    return 11;
}
function _pthread_join() {}
function _pthread_setcancelstate() {
    return 0;
}
function _pthread_sigmask() {
    return 0;
}
function _putenv(string) {
    if (string === 0) {
        ___setErrNo(22);
        return -1;
    }
    string = UTF8ToString(string);
    var splitPoint = string.indexOf("=");
    if (string === "" || string.indexOf("=") === -1) {
        ___setErrNo(22);
        return -1;
    }
    var name = string.slice(0, splitPoint);
    var value = string.slice(splitPoint + 1);
    if (!(name in ENV) || ENV[name] !== value) {
        ENV[name] = value;
        ___buildEnvironment(__get_environ());
    }
    return 0;
}
function abortOnCannotGrowMemory(requestedSize) {
    abort("OOM");
}
function emscripten_realloc_buffer(size) {
    try {
        wasmMemory.grow((size - buffer.byteLength + 65535) >> 16);
        updateGlobalBufferAndViews(wasmMemory.buffer);
        return 1;
    } catch (e) {}
}
function _emscripten_resize_heap(requestedSize) {
    var oldSize = _emscripten_get_heap_size();
    var PAGE_MULTIPLE = 65536;
    var LIMIT = 2147483648 - PAGE_MULTIPLE;
    if (requestedSize > LIMIT) {
        return false;
    }
    var MIN_TOTAL_MEMORY = 16777216;
    var newSize = Math.max(oldSize, MIN_TOTAL_MEMORY);
    while (newSize < requestedSize) {
        if (newSize <= 536870912) {
            newSize = alignUp(2 * newSize, PAGE_MULTIPLE);
        } else {
            newSize = Math.min(alignUp((3 * newSize + 2147483648) / 4, PAGE_MULTIPLE), LIMIT);
        }
    }
    var replacement = emscripten_realloc_buffer(newSize);
    if (!replacement) {
        return false;
    }
    return true;
}
function _setenv(envname, envval, overwrite) {
    if (envname === 0) {
        ___setErrNo(22);
        return -1;
    }
    var name = UTF8ToString(envname);
    var val = UTF8ToString(envval);
    if (name === "" || name.indexOf("=") !== -1) {
        ___setErrNo(22);
        return -1;
    }
    if (ENV.hasOwnProperty(name) && !overwrite) return 0;
    ENV[name] = val;
    ___buildEnvironment(__get_environ());
    return 0;
}
function _sysconf(name) {
    switch (name) {
        case 30:
            return PAGE_SIZE;
        case 85:
            var maxHeapSize = 2 * 1024 * 1024 * 1024 - 65536;
            return maxHeapSize / PAGE_SIZE;
        case 132:
        case 133:
        case 12:
        case 137:
        case 138:
        case 15:
        case 235:
        case 16:
        case 17:
        case 18:
        case 19:
        case 20:
        case 149:
        case 13:
        case 10:
        case 236:
        case 153:
        case 9:
        case 21:
        case 22:
        case 159:
        case 154:
        case 14:
        case 77:
        case 78:
        case 139:
        case 80:
        case 81:
        case 82:
        case 68:
        case 67:
        case 164:
        case 11:
        case 29:
        case 47:
        case 48:
        case 95:
        case 52:
        case 51:
        case 46:
            return 200809;
        case 79:
            return 0;
        case 27:
        case 246:
        case 127:
        case 128:
        case 23:
        case 24:
        case 160:
        case 161:
        case 181:
        case 182:
        case 242:
        case 183:
        case 184:
        case 243:
        case 244:
        case 245:
        case 165:
        case 178:
        case 179:
        case 49:
        case 50:
        case 168:
        case 169:
        case 175:
        case 170:
        case 171:
        case 172:
        case 97:
        case 76:
        case 32:
        case 173:
        case 35:
            return -1;
        case 176:
        case 177:
        case 7:
        case 155:
        case 8:
        case 157:
        case 125:
        case 126:
        case 92:
        case 93:
        case 129:
        case 130:
        case 131:
        case 94:
        case 91:
            return 1;
        case 74:
        case 60:
        case 69:
        case 70:
        case 4:
            return 1024;
        case 31:
        case 42:
        case 72:
            return 32;
        case 87:
        case 26:
        case 33:
            return 2147483647;
        case 34:
        case 1:
            return 47839;
        case 38:
        case 36:
            return 99;
        case 43:
        case 37:
            return 2048;
        case 0:
            return 2097152;
        case 3:
            return 65536;
        case 28:
            return 32768;
        case 44:
            return 32767;
        case 75:
            return 16384;
        case 39:
            return 1e3;
        case 89:
            return 700;
        case 71:
            return 256;
        case 40:
            return 255;
        case 2:
            return 100;
        case 180:
            return 64;
        case 25:
            return 20;
        case 5:
            return 16;
        case 6:
            return 6;
        case 73:
            return 4;
        case 84: {
            if (typeof navigator === "object") return navigator["hardwareConcurrency"] || 1;
            return 1;
        }
    }
    ___setErrNo(22);
    return -1;
}
function _setgroups(ngroups, gidset) {
    if (ngroups < 1 || ngroups > _sysconf(3)) {
        ___setErrNo(22);
        return -1;
    } else {
        ___setErrNo(1);
        return -1;
    }
}
function _setpwent() {
    throw "setpwent: TODO";
}
function _sigaction(signum, act, oldact) {
    return 0;
}
function _sigemptyset(set) {
    HEAP32[set >> 2] = 0;
    return 0;
}
function _sigfillset(set) {
    HEAP32[set >> 2] = -1 >>> 0;
    return 0;
}
var __sigalrm_handler = 0;
function _signal(sig, func) {
    if (sig == 14) {
        __sigalrm_handler = func;
    } else {
    }
    return 0;
}
function __isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
function __arraySum(array, index) {
    var sum = 0;
    for (var i = 0; i <= index; sum += array[i++]);
    return sum;
}
var __MONTH_DAYS_LEAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var __MONTH_DAYS_REGULAR = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function __addDays(date, days) {
    var newDate = new Date(date.getTime());
    while (days > 0) {
        var leap = __isLeapYear(newDate.getFullYear());
        var currentMonth = newDate.getMonth();
        var daysInCurrentMonth = (leap ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR)[currentMonth];
        if (days > daysInCurrentMonth - newDate.getDate()) {
            days -= daysInCurrentMonth - newDate.getDate() + 1;
            newDate.setDate(1);
            if (currentMonth < 11) {
                newDate.setMonth(currentMonth + 1);
            } else {
                newDate.setMonth(0);
                newDate.setFullYear(newDate.getFullYear() + 1);
            }
        } else {
            newDate.setDate(newDate.getDate() + days);
            return newDate;
        }
    }
    return newDate;
}
function _strftime(s, maxsize, format, tm) {
    var tm_zone = HEAP32[(tm + 40) >> 2];
    var date = {
        tm_sec: HEAP32[tm >> 2],
        tm_min: HEAP32[(tm + 4) >> 2],
        tm_hour: HEAP32[(tm + 8) >> 2],
        tm_mday: HEAP32[(tm + 12) >> 2],
        tm_mon: HEAP32[(tm + 16) >> 2],
        tm_year: HEAP32[(tm + 20) >> 2],
        tm_wday: HEAP32[(tm + 24) >> 2],
        tm_yday: HEAP32[(tm + 28) >> 2],
        tm_isdst: HEAP32[(tm + 32) >> 2],
        tm_gmtoff: HEAP32[(tm + 36) >> 2],
        tm_zone: tm_zone ? UTF8ToString(tm_zone) : "",
    };
    var pattern = UTF8ToString(format);
    var EXPANSION_RULES_1 = {
        "%c": "%a %b %d %H:%M:%S %Y",
        "%D": "%m/%d/%y",
        "%F": "%Y-%m-%d",
        "%h": "%b",
        "%r": "%I:%M:%S %p",
        "%R": "%H:%M",
        "%T": "%H:%M:%S",
        "%x": "%m/%d/%y",
        "%X": "%H:%M:%S",
        "%Ec": "%c",
        "%EC": "%C",
        "%Ex": "%m/%d/%y",
        "%EX": "%H:%M:%S",
        "%Ey": "%y",
        "%EY": "%Y",
        "%Od": "%d",
        "%Oe": "%e",
        "%OH": "%H",
        "%OI": "%I",
        "%Om": "%m",
        "%OM": "%M",
        "%OS": "%S",
        "%Ou": "%u",
        "%OU": "%U",
        "%OV": "%V",
        "%Ow": "%w",
        "%OW": "%W",
        "%Oy": "%y",
    };
    for (var rule in EXPANSION_RULES_1) {
        pattern = pattern.replace(new RegExp(rule, "g"), EXPANSION_RULES_1[rule]);
    }
    var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    function leadingSomething(value, digits, character) {
        var str = typeof value === "number" ? value.toString() : value || "";
        while (str.length < digits) {
            str = character[0] + str;
        }
        return str;
    }
    function leadingNulls(value, digits) {
        return leadingSomething(value, digits, "0");
    }
    function compareByDay(date1, date2) {
        function sgn(value) {
            return value < 0 ? -1 : value > 0 ? 1 : 0;
        }
        var compare;
        if ((compare = sgn(date1.getFullYear() - date2.getFullYear())) === 0) {
            if ((compare = sgn(date1.getMonth() - date2.getMonth())) === 0) {
                compare = sgn(date1.getDate() - date2.getDate());
            }
        }
        return compare;
    }
    function getFirstWeekStartDate(janFourth) {
        switch (janFourth.getDay()) {
            case 0:
                return new Date(janFourth.getFullYear() - 1, 11, 29);
            case 1:
                return janFourth;
            case 2:
                return new Date(janFourth.getFullYear(), 0, 3);
            case 3:
                return new Date(janFourth.getFullYear(), 0, 2);
            case 4:
                return new Date(janFourth.getFullYear(), 0, 1);
            case 5:
                return new Date(janFourth.getFullYear() - 1, 11, 31);
            case 6:
                return new Date(janFourth.getFullYear() - 1, 11, 30);
        }
    }
    function getWeekBasedYear(date) {
        var thisDate = __addDays(new Date(date.tm_year + 1900, 0, 1), date.tm_yday);
        var janFourthThisYear = new Date(thisDate.getFullYear(), 0, 4);
        var janFourthNextYear = new Date(thisDate.getFullYear() + 1, 0, 4);
        var firstWeekStartThisYear = getFirstWeekStartDate(janFourthThisYear);
        var firstWeekStartNextYear = getFirstWeekStartDate(janFourthNextYear);
        if (compareByDay(firstWeekStartThisYear, thisDate) <= 0) {
            if (compareByDay(firstWeekStartNextYear, thisDate) <= 0) {
                return thisDate.getFullYear() + 1;
            } else {
                return thisDate.getFullYear();
            }
        } else {
            return thisDate.getFullYear() - 1;
        }
    }
    var EXPANSION_RULES_2 = {
        "%a": function (date) {
            return WEEKDAYS[date.tm_wday].substring(0, 3);
        },
        "%A": function (date) {
            return WEEKDAYS[date.tm_wday];
        },
        "%b": function (date) {
            return MONTHS[date.tm_mon].substring(0, 3);
        },
        "%B": function (date) {
            return MONTHS[date.tm_mon];
        },
        "%C": function (date) {
            var year = date.tm_year + 1900;
            return leadingNulls((year / 100) | 0, 2);
        },
        "%d": function (date) {
            return leadingNulls(date.tm_mday, 2);
        },
        "%e": function (date) {
            return leadingSomething(date.tm_mday, 2, " ");
        },
        "%g": function (date) {
            return getWeekBasedYear(date).toString().substring(2);
        },
        "%G": function (date) {
            return getWeekBasedYear(date);
        },
        "%H": function (date) {
            return leadingNulls(date.tm_hour, 2);
        },
        "%I": function (date) {
            var twelveHour = date.tm_hour;
            if (twelveHour == 0) twelveHour = 12;
            else if (twelveHour > 12) twelveHour -= 12;
            return leadingNulls(twelveHour, 2);
        },
        "%j": function (date) {
            return leadingNulls(date.tm_mday + __arraySum(__isLeapYear(date.tm_year + 1900) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR, date.tm_mon - 1), 3);
        },
        "%m": function (date) {
            return leadingNulls(date.tm_mon + 1, 2);
        },
        "%M": function (date) {
            return leadingNulls(date.tm_min, 2);
        },
        "%n": function () {
            return "\n";
        },
        "%p": function (date) {
            if (date.tm_hour >= 0 && date.tm_hour < 12) {
                return "AM";
            } else {
                return "PM";
            }
        },
        "%S": function (date) {
            return leadingNulls(date.tm_sec, 2);
        },
        "%t": function () {
            return "\t";
        },
        "%u": function (date) {
            return date.tm_wday || 7;
        },
        "%U": function (date) {
            var janFirst = new Date(date.tm_year + 1900, 0, 1);
            var firstSunday = janFirst.getDay() === 0 ? janFirst : __addDays(janFirst, 7 - janFirst.getDay());
            var endDate = new Date(date.tm_year + 1900, date.tm_mon, date.tm_mday);
            if (compareByDay(firstSunday, endDate) < 0) {
                var februaryFirstUntilEndMonth = __arraySum(__isLeapYear(endDate.getFullYear()) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR, endDate.getMonth() - 1) - 31;
                var firstSundayUntilEndJanuary = 31 - firstSunday.getDate();
                var days = firstSundayUntilEndJanuary + februaryFirstUntilEndMonth + endDate.getDate();
                return leadingNulls(Math.ceil(days / 7), 2);
            }
            return compareByDay(firstSunday, janFirst) === 0 ? "01" : "00";
        },
        "%V": function (date) {
            var janFourthThisYear = new Date(date.tm_year + 1900, 0, 4);
            var janFourthNextYear = new Date(date.tm_year + 1901, 0, 4);
            var firstWeekStartThisYear = getFirstWeekStartDate(janFourthThisYear);
            var firstWeekStartNextYear = getFirstWeekStartDate(janFourthNextYear);
            var endDate = __addDays(new Date(date.tm_year + 1900, 0, 1), date.tm_yday);
            if (compareByDay(endDate, firstWeekStartThisYear) < 0) {
                return "53";
            }
            if (compareByDay(firstWeekStartNextYear, endDate) <= 0) {
                return "01";
            }
            var daysDifference;
            if (firstWeekStartThisYear.getFullYear() < date.tm_year + 1900) {
                daysDifference = date.tm_yday + 32 - firstWeekStartThisYear.getDate();
            } else {
                daysDifference = date.tm_yday + 1 - firstWeekStartThisYear.getDate();
            }
            return leadingNulls(Math.ceil(daysDifference / 7), 2);
        },
        "%w": function (date) {
            return date.tm_wday;
        },
        "%W": function (date) {
            var janFirst = new Date(date.tm_year, 0, 1);
            var firstMonday = janFirst.getDay() === 1 ? janFirst : __addDays(janFirst, janFirst.getDay() === 0 ? 1 : 7 - janFirst.getDay() + 1);
            var endDate = new Date(date.tm_year + 1900, date.tm_mon, date.tm_mday);
            if (compareByDay(firstMonday, endDate) < 0) {
                var februaryFirstUntilEndMonth = __arraySum(__isLeapYear(endDate.getFullYear()) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR, endDate.getMonth() - 1) - 31;
                var firstMondayUntilEndJanuary = 31 - firstMonday.getDate();
                var days = firstMondayUntilEndJanuary + februaryFirstUntilEndMonth + endDate.getDate();
                return leadingNulls(Math.ceil(days / 7), 2);
            }
            return compareByDay(firstMonday, janFirst) === 0 ? "01" : "00";
        },
        "%y": function (date) {
            return (date.tm_year + 1900).toString().substring(2);
        },
        "%Y": function (date) {
            return date.tm_year + 1900;
        },
        "%z": function (date) {
            var off = date.tm_gmtoff;
            var ahead = off >= 0;
            off = Math.abs(off) / 60;
            off = (off / 60) * 100 + (off % 60);
            return (ahead ? "+" : "-") + String("0000" + off).slice(-4);
        },
        "%Z": function (date) {
            return date.tm_zone;
        },
        "%%": function () {
            return "%";
        },
    };
    for (var rule in EXPANSION_RULES_2) {
        if (pattern.indexOf(rule) >= 0) {
            pattern = pattern.replace(new RegExp(rule, "g"), EXPANSION_RULES_2[rule](date));
        }
    }
    var bytes = intArrayFromString(pattern, false);
    if (bytes.length > maxsize) {
        return 0;
    }
    writeArrayToMemory(bytes, s);
    return bytes.length - 1;
}
function _system(command) {
    ___setErrNo(11);
    return -1;
}
function _time(ptr) {
    var ret = (Date.now() / 1e3) | 0;
    if (ptr) {
        HEAP32[ptr >> 2] = ret;
    }
    return ret;
}
function _times(buffer) {
    if (buffer !== 0) {
        _memset(buffer, 0, 16);
    }
    return 0;
}
function _unsetenv(name) {
    if (name === 0) {
        ___setErrNo(22);
        return -1;
    }
    name = UTF8ToString(name);
    if (name === "" || name.indexOf("=") !== -1) {
        ___setErrNo(22);
        return -1;
    }
    if (ENV.hasOwnProperty(name)) {
        delete ENV[name];
        ___buildEnvironment(__get_environ());
    }
    return 0;
}
function _utime(path, times) {
    var time;
    if (times) {
        var offset = 4;
        time = HEAP32[(times + offset) >> 2];
        time *= 1e3;
    } else {
        time = Date.now();
    }
    path = UTF8ToString(path);
    try {
        FS.utime(path, time, time);
        return 0;
    } catch (e) {
        FS.handleFSError(e);
        return -1;
    }
}
function _utimes(path, times) {
    var time;
    if (times) {
        var offset = 8 + 0;
        time = HEAP32[(times + offset) >> 2] * 1e3;
        offset = 8 + 4;
        time += HEAP32[(times + offset) >> 2] / 1e3;
    } else {
        time = Date.now();
    }
    path = UTF8ToString(path);
    try {
        FS.utime(path, time, time);
        return 0;
    } catch (e) {
        FS.handleFSError(e);
        return -1;
    }
}
function _wait(stat_loc) {
    ___setErrNo(10);
    return -1;
}
function _wait3() {
    return _wait.apply(null, arguments);
}
function _wait4() {
    return _wait.apply(null, arguments);
}
function _waitpid() {
    return _wait.apply(null, arguments);
}
if (typeof dateNow !== "undefined") {
    _emscripten_get_now = dateNow;
} else if (typeof performance === "object" && performance && typeof performance["now"] === "function") {
    _emscripten_get_now = function () {
        return performance["now"]();
    };
} else {
    _emscripten_get_now = Date.now;
}
FS.staticInit();
Module["FS_createFolder"] = FS.createFolder;
Module["FS_createPath"] = FS.createPath;
Module["FS_createDataFile"] = FS.createDataFile;
Module["FS_createPreloadedFile"] = FS.createPreloadedFile;
Module["FS_createLazyFile"] = FS.createLazyFile;
Module["FS_createLink"] = FS.createLink;
Module["FS_createDevice"] = FS.createDevice;
Module["FS_unlink"] = FS.unlink;
Module["requestFullScreen"] = function Module_requestFullScreen(lockPointer, resizeCanvas, vrDevice) {
    err("Module.requestFullScreen is deprecated. Please call Module.requestFullscreen instead.");
    Module["requestFullScreen"] = Module["requestFullscreen"];
    Browser.requestFullScreen(lockPointer, resizeCanvas, vrDevice);
};
Module["requestFullscreen"] = function Module_requestFullscreen(lockPointer, resizeCanvas, vrDevice) {
    Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice);
};
Module["requestAnimationFrame"] = function Module_requestAnimationFrame(func) {
    Browser.requestAnimationFrame(func);
};
Module["setCanvasSize"] = function Module_setCanvasSize(width, height, noUpdates) {
    Browser.setCanvasSize(width, height, noUpdates);
};
Module["pauseMainLoop"] = function Module_pauseMainLoop() {
    Browser.mainLoop.pause();
};
Module["resumeMainLoop"] = function Module_resumeMainLoop() {
    Browser.mainLoop.resume();
};
Module["getUserMedia"] = function Module_getUserMedia() {
    Browser.getUserMedia();
};
Module["createContext"] = function Module_createContext(canvas, useWebGL, setInModule, webGLContextAttributes) {
    return Browser.createContext(canvas, useWebGL, setInModule, webGLContextAttributes);
};
var GLctx;
GL.init();
for (var i = 0; i < 32; i++) __tempFixedLengthArray.push(new Array(i));
var ASSERTIONS = false;
function intArrayFromString(stringy, dontAddNull, length) {
    var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
    var u8array = new Array(len);
    var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
    if (dontAddNull) u8array.length = numBytesWritten;
    return u8array;
}
function invoke_i(index) {
    var sp = stackSave();
    try {
        return dynCall_i(index);
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0 && e !== "longjmp") throw e;
        _setThrew(1, 0);
    }
}
function invoke_ii(index, a1) {
    var sp = stackSave();
    try {
        return dynCall_ii(index, a1);
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0 && e !== "longjmp") throw e;
        _setThrew(1, 0);
    }
}
function invoke_iii(index, a1, a2) {
    var sp = stackSave();
    try {
        return dynCall_iii(index, a1, a2);
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0 && e !== "longjmp") throw e;
        _setThrew(1, 0);
    }
}
function invoke_iiii(index, a1, a2, a3) {
    var sp = stackSave();
    try {
        return dynCall_iiii(index, a1, a2, a3);
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0 && e !== "longjmp") throw e;
        _setThrew(1, 0);
    }
}
function invoke_iiiii(index, a1, a2, a3, a4) {
    var sp = stackSave();
    try {
        return dynCall_iiiii(index, a1, a2, a3, a4);
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0 && e !== "longjmp") throw e;
        _setThrew(1, 0);
    }
}
function invoke_iiiiii(index, a1, a2, a3, a4, a5) {
    var sp = stackSave();
    try {
        return dynCall_iiiiii(index, a1, a2, a3, a4, a5);
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0 && e !== "longjmp") throw e;
        _setThrew(1, 0);
    }
}
function invoke_iiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
    var sp = stackSave();
    try {
        return dynCall_iiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8);
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0 && e !== "longjmp") throw e;
        _setThrew(1, 0);
    }
}
function invoke_iiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
    var sp = stackSave();
    try {
        return dynCall_iiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9);
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0 && e !== "longjmp") throw e;
        _setThrew(1, 0);
    }
}
function invoke_vi(index, a1) {
    var sp = stackSave();
    try {
        dynCall_vi(index, a1);
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0 && e !== "longjmp") throw e;
        _setThrew(1, 0);
    }
}
function invoke_vii(index, a1, a2) {
    var sp = stackSave();
    try {
        dynCall_vii(index, a1, a2);
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0 && e !== "longjmp") throw e;
        _setThrew(1, 0);
    }
}
function invoke_viii(index, a1, a2, a3) {
    var sp = stackSave();
    try {
        dynCall_viii(index, a1, a2, a3);
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0 && e !== "longjmp") throw e;
        _setThrew(1, 0);
    }
}
function invoke_viiii(index, a1, a2, a3, a4) {
    var sp = stackSave();
    try {
        dynCall_viiii(index, a1, a2, a3, a4);
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0 && e !== "longjmp") throw e;
        _setThrew(1, 0);
    }
}
function invoke_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
    var sp = stackSave();
    try {
        dynCall_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9);
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0 && e !== "longjmp") throw e;
        _setThrew(1, 0);
    }
}
function dynCall_X(index) {
    index = index | 0;
    return mftCall_X(index);
}
function dynCall_dd(index, a1) {
    index = index | 0;
    a1 = +a1;
    return +mftCall_dd(index, +a1);
}
function dynCall_ddd(index, a1, a2) {
    index = index | 0;
    a1 = +a1;
    a2 = +a2;
    return +mftCall_ddd(index, +a1, +a2);
}
function dynCall_did(index, a1, a2) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = +a2;
    return +mftCall_did(index, a1 | 0, +a2);
}
function dynCall_didd(index, a1, a2, a3) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = +a2;
    a3 = +a3;
    return +mftCall_didd(index, a1 | 0, +a2, +a3);
}
function dynCall_fiii(index, a1, a2, a3) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    return Math_fround(mftCall_fiii(index, a1 | 0, a2 | 0, a3 | 0));
}
function dynCall_i(index) {
    index = index | 0;
    return mftCall_i(index) | 0;
}
function dynCall_iffff(index, a1, a2, a3, a4) {
    index = index | 0;
    a1 = Math_fround(a1);
    a2 = Math_fround(a2);
    a3 = Math_fround(a3);
    a4 = Math_fround(a4);
    return mftCall_iffff(index, Math_fround(a1), Math_fround(a2), Math_fround(a3), Math_fround(a4)) | 0;
}
function dynCall_ii(index, a1) {
    index = index | 0;
    a1 = a1 | 0;
    return mftCall_ii(index, a1 | 0) | 0;
}
function dynCall_iiddiddiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = +a2;
    a3 = +a3;
    a4 = a4 | 0;
    a5 = +a5;
    a6 = +a6;
    a7 = a7 | 0;
    a8 = a8 | 0;
    a9 = a9 | 0;
    return mftCall_iiddiddiii(index, a1 | 0, +a2, +a3, a4 | 0, +a5, +a6, a7 | 0, a8 | 0, a9 | 0) | 0;
}
function dynCall_iidiiii(index, a1, a2, a3, a4, a5, a6) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = +a2;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = a5 | 0;
    a6 = a6 | 0;
    return mftCall_iidiiii(index, a1 | 0, +a2, a3 | 0, a4 | 0, a5 | 0, a6 | 0) | 0;
}
function dynCall_iif(index, a1, a2) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = Math_fround(a2);
    return mftCall_iif(index, a1 | 0, Math_fround(a2)) | 0;
}
function dynCall_iiff(index, a1, a2, a3) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = Math_fround(a2);
    a3 = Math_fround(a3);
    return mftCall_iiff(index, a1 | 0, Math_fround(a2), Math_fround(a3)) | 0;
}
function dynCall_iiffff(index, a1, a2, a3, a4, a5) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = Math_fround(a2);
    a3 = Math_fround(a3);
    a4 = Math_fround(a4);
    a5 = Math_fround(a5);
    return mftCall_iiffff(index, a1 | 0, Math_fround(a2), Math_fround(a3), Math_fround(a4), Math_fround(a5)) | 0;
}
function dynCall_iii(index, a1, a2) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    return mftCall_iii(index, a1 | 0, a2 | 0) | 0;
}
function dynCall_iiiddidddiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = +a3;
    a4 = +a4;
    a5 = a5 | 0;
    a6 = +a6;
    a7 = +a7;
    a8 = +a8;
    a9 = a9 | 0;
    a10 = a10 | 0;
    a11 = a11 | 0;
    return mftCall_iiiddidddiii(index, a1 | 0, a2 | 0, +a3, +a4, a5 | 0, +a6, +a7, +a8, a9 | 0, a10 | 0, a11 | 0) | 0;
}
function dynCall_iiii(index, a1, a2, a3) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    return mftCall_iiii(index, a1 | 0, a2 | 0, a3 | 0) | 0;
}
function dynCall_iiiiddddiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = +a4;
    a5 = +a5;
    a6 = +a6;
    a7 = +a7;
    a8 = a8 | 0;
    a9 = a9 | 0;
    a10 = a10 | 0;
    a11 = a11 | 0;
    return mftCall_iiiiddddiiii(index, a1 | 0, a2 | 0, a3 | 0, +a4, +a5, +a6, +a7, a8 | 0, a9 | 0, a10 | 0, a11 | 0) | 0;
}
function dynCall_iiiiddi(index, a1, a2, a3, a4, a5, a6) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = +a4;
    a5 = +a5;
    a6 = a6 | 0;
    return mftCall_iiiiddi(index, a1 | 0, a2 | 0, a3 | 0, +a4, +a5, a6 | 0) | 0;
}
function dynCall_iiiiddidddiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = +a4;
    a5 = +a5;
    a6 = a6 | 0;
    a7 = +a7;
    a8 = +a8;
    a9 = +a9;
    a10 = a10 | 0;
    a11 = a11 | 0;
    a12 = a12 | 0;
    a13 = a13 | 0;
    return mftCall_iiiiddidddiiii(index, a1 | 0, a2 | 0, a3 | 0, +a4, +a5, a6 | 0, +a7, +a8, +a9, a10 | 0, a11 | 0, a12 | 0, a13 | 0) | 0;
}
function dynCall_iiiii(index, a1, a2, a3, a4) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    return mftCall_iiiii(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0) | 0;
}
function dynCall_iiiiidii(index, a1, a2, a3, a4, a5, a6, a7) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = +a5;
    a6 = a6 | 0;
    a7 = a7 | 0;
    return mftCall_iiiiidii(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, +a5, a6 | 0, a7 | 0) | 0;
}
function dynCall_iiiiii(index, a1, a2, a3, a4, a5) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = a5 | 0;
    return mftCall_iiiiii(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0) | 0;
}
function dynCall_iiiiiii(index, a1, a2, a3, a4, a5, a6) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = a5 | 0;
    a6 = a6 | 0;
    return mftCall_iiiiiii(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0) | 0;
}
function dynCall_iiiiiiidiiddi(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = a5 | 0;
    a6 = a6 | 0;
    a7 = +a7;
    a8 = a8 | 0;
    a9 = a9 | 0;
    a10 = +a10;
    a11 = +a11;
    a12 = a12 | 0;
    return mftCall_iiiiiiidiiddi(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0, +a7, a8 | 0, a9 | 0, +a10, +a11, a12 | 0) | 0;
}
function dynCall_iiiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = a5 | 0;
    a6 = a6 | 0;
    a7 = a7 | 0;
    return mftCall_iiiiiiii(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0, a7 | 0) | 0;
}
function dynCall_iiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = a5 | 0;
    a6 = a6 | 0;
    a7 = a7 | 0;
    a8 = a8 | 0;
    return mftCall_iiiiiiiii(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0, a7 | 0, a8 | 0) | 0;
}
function dynCall_iiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = a5 | 0;
    a6 = a6 | 0;
    a7 = a7 | 0;
    a8 = a8 | 0;
    a9 = a9 | 0;
    return mftCall_iiiiiiiiii(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0, a7 | 0, a8 | 0, a9 | 0) | 0;
}
function dynCall_v(index) {
    index = index | 0;
    mftCall_v(index);
}
function dynCall_vf(index, a1) {
    index = index | 0;
    a1 = Math_fround(a1);
    mftCall_vf(index, Math_fround(a1));
}
function dynCall_vff(index, a1, a2) {
    index = index | 0;
    a1 = Math_fround(a1);
    a2 = Math_fround(a2);
    mftCall_vff(index, Math_fround(a1), Math_fround(a2));
}
function dynCall_vffff(index, a1, a2, a3, a4) {
    index = index | 0;
    a1 = Math_fround(a1);
    a2 = Math_fround(a2);
    a3 = Math_fround(a3);
    a4 = Math_fround(a4);
    mftCall_vffff(index, Math_fround(a1), Math_fround(a2), Math_fround(a3), Math_fround(a4));
}
function dynCall_vfi(index, a1, a2) {
    index = index | 0;
    a1 = Math_fround(a1);
    a2 = a2 | 0;
    mftCall_vfi(index, Math_fround(a1), a2 | 0);
}
function dynCall_vi(index, a1) {
    index = index | 0;
    a1 = a1 | 0;
    mftCall_vi(index, a1 | 0);
}
function dynCall_vid(index, a1, a2) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = +a2;
    mftCall_vid(index, a1 | 0, +a2);
}
function dynCall_vidddd(index, a1, a2, a3, a4, a5) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = +a2;
    a3 = +a3;
    a4 = +a4;
    a5 = +a5;
    mftCall_vidddd(index, a1 | 0, +a2, +a3, +a4, +a5);
}
function dynCall_vidddddd(index, a1, a2, a3, a4, a5, a6, a7) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = +a2;
    a3 = +a3;
    a4 = +a4;
    a5 = +a5;
    a6 = +a6;
    a7 = +a7;
    mftCall_vidddddd(index, a1 | 0, +a2, +a3, +a4, +a5, +a6, +a7);
}
function dynCall_vidi(index, a1, a2, a3) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = +a2;
    a3 = a3 | 0;
    mftCall_vidi(index, a1 | 0, +a2, a3 | 0);
}
function dynCall_vif(index, a1, a2) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = Math_fround(a2);
    mftCall_vif(index, a1 | 0, Math_fround(a2));
}
function dynCall_viff(index, a1, a2, a3) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = Math_fround(a2);
    a3 = Math_fround(a3);
    mftCall_viff(index, a1 | 0, Math_fround(a2), Math_fround(a3));
}
function dynCall_vifff(index, a1, a2, a3, a4) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = Math_fround(a2);
    a3 = Math_fround(a3);
    a4 = Math_fround(a4);
    mftCall_vifff(index, a1 | 0, Math_fround(a2), Math_fround(a3), Math_fround(a4));
}
function dynCall_viffff(index, a1, a2, a3, a4, a5) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = Math_fround(a2);
    a3 = Math_fround(a3);
    a4 = Math_fround(a4);
    a5 = Math_fround(a5);
    mftCall_viffff(index, a1 | 0, Math_fround(a2), Math_fround(a3), Math_fround(a4), Math_fround(a5));
}
function dynCall_vii(index, a1, a2) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    mftCall_vii(index, a1 | 0, a2 | 0);
}
function dynCall_viidi(index, a1, a2, a3, a4) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = +a3;
    a4 = a4 | 0;
    mftCall_viidi(index, a1 | 0, a2 | 0, +a3, a4 | 0);
}
function dynCall_viif(index, a1, a2, a3) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = Math_fround(a3);
    mftCall_viif(index, a1 | 0, a2 | 0, Math_fround(a3));
}
function dynCall_viifi(index, a1, a2, a3, a4) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = Math_fround(a3);
    a4 = a4 | 0;
    mftCall_viifi(index, a1 | 0, a2 | 0, Math_fround(a3), a4 | 0);
}
function dynCall_viii(index, a1, a2, a3) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    mftCall_viii(index, a1 | 0, a2 | 0, a3 | 0);
}
function dynCall_viiiffff(index, a1, a2, a3, a4, a5, a6, a7) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = Math_fround(a4);
    a5 = Math_fround(a5);
    a6 = Math_fround(a6);
    a7 = Math_fround(a7);
    mftCall_viiiffff(index, a1 | 0, a2 | 0, a3 | 0, Math_fround(a4), Math_fround(a5), Math_fround(a6), Math_fround(a7));
}
function dynCall_viiii(index, a1, a2, a3, a4) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    mftCall_viiii(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0);
}
function dynCall_viiiif(index, a1, a2, a3, a4, a5) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = Math_fround(a5);
    mftCall_viiiif(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, Math_fround(a5));
}
function dynCall_viiiiffff(index, a1, a2, a3, a4, a5, a6, a7, a8) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = Math_fround(a5);
    a6 = Math_fround(a6);
    a7 = Math_fround(a7);
    a8 = Math_fround(a8);
    mftCall_viiiiffff(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, Math_fround(a5), Math_fround(a6), Math_fround(a7), Math_fround(a8));
}
function dynCall_viiiii(index, a1, a2, a3, a4, a5) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = a5 | 0;
    mftCall_viiiii(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0);
}
function dynCall_viiiiiffff(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = a5 | 0;
    a6 = Math_fround(a6);
    a7 = Math_fround(a7);
    a8 = Math_fround(a8);
    a9 = Math_fround(a9);
    mftCall_viiiiiffff(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, Math_fround(a6), Math_fround(a7), Math_fround(a8), Math_fround(a9));
}
function dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = a5 | 0;
    a6 = a6 | 0;
    mftCall_viiiiii(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0);
}
function dynCall_viiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = a5 | 0;
    a6 = a6 | 0;
    a7 = a7 | 0;
    mftCall_viiiiiii(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0, a7 | 0);
}
function dynCall_viiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = a5 | 0;
    a6 = a6 | 0;
    a7 = a7 | 0;
    a8 = a8 | 0;
    mftCall_viiiiiiii(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0, a7 | 0, a8 | 0);
}
function dynCall_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = a5 | 0;
    a6 = a6 | 0;
    a7 = a7 | 0;
    a8 = a8 | 0;
    a9 = a9 | 0;
    mftCall_viiiiiiiii(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0, a7 | 0, a8 | 0, a9 | 0);
}
function dynCall_viiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = a5 | 0;
    a6 = a6 | 0;
    a7 = a7 | 0;
    a8 = a8 | 0;
    a9 = a9 | 0;
    a10 = a10 | 0;
    mftCall_viiiiiiiiii(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0, a7 | 0, a8 | 0, a9 | 0, a10 | 0);
}
function dynCall_viiiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = a5 | 0;
    a6 = a6 | 0;
    a7 = a7 | 0;
    a8 = a8 | 0;
    a9 = a9 | 0;
    a10 = a10 | 0;
    a11 = a11 | 0;
    mftCall_viiiiiiiiiii(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0, a7 | 0, a8 | 0, a9 | 0, a10 | 0, a11 | 0);
}
function dynCall_viiiiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12) {
    index = index | 0;
    a1 = a1 | 0;
    a2 = a2 | 0;
    a3 = a3 | 0;
    a4 = a4 | 0;
    a5 = a5 | 0;
    a6 = a6 | 0;
    a7 = a7 | 0;
    a8 = a8 | 0;
    a9 = a9 | 0;
    a10 = a10 | 0;
    a11 = a11 | 0;
    a12 = a12 | 0;
    mftCall_viiiiiiiiiiii(index, a1 | 0, a2 | 0, a3 | 0, a4 | 0, a5 | 0, a6 | 0, a7 | 0, a8 | 0, a9 | 0, a10 | 0, a11 | 0, a12 | 0);
}
var asmGlobalArg = {};
var asmLibraryArg = {
    abort: abort,
    setTempRet0: setTempRet0,
    getTempRet0: getTempRet0,
    abortStackOverflowEmterpreter: abortStackOverflowEmterpreter,
    invoke_i: invoke_i,
    invoke_ii: invoke_ii,
    invoke_iii: invoke_iii,
    invoke_iiii: invoke_iiii,
    invoke_iiiii: invoke_iiiii,
    invoke_iiiiii: invoke_iiiiii,
    invoke_iiiiiiiii: invoke_iiiiiiiii,
    invoke_iiiiiiiiii: invoke_iiiiiiiiii,
    invoke_vi: invoke_vi,
    invoke_vii: invoke_vii,
    invoke_viii: invoke_viii,
    invoke_viiii: invoke_viiii,
    invoke_viiiiiiiii: invoke_viiiiiiiii,
    _JSEvents_requestFullscreen: _JSEvents_requestFullscreen,
    _JSEvents_resizeCanvasForFullscreen: _JSEvents_resizeCanvasForFullscreen,
    ___assert_fail: ___assert_fail,
    ___buildEnvironment: ___buildEnvironment,
    ___clock_gettime: ___clock_gettime,
    ___lock: ___lock,
    ___map_file: ___map_file,
    ___setErrNo: ___setErrNo,
    ___syscall10: ___syscall10,
    ___syscall102: ___syscall102,
    ___syscall118: ___syscall118,
    ___syscall12: ___syscall12,
    ___syscall122: ___syscall122,
    ___syscall132: ___syscall132,
    ___syscall133: ___syscall133,
    ___syscall14: ___syscall14,
    ___syscall140: ___syscall140,
    ___syscall142: ___syscall142,
    ___syscall145: ___syscall145,
    ___syscall147: ___syscall147,
    ___syscall148: ___syscall148,
    ___syscall15: ___syscall15,
    ___syscall168: ___syscall168,
    ___syscall183: ___syscall183,
    ___syscall194: ___syscall194,
    ___syscall195: ___syscall195,
    ___syscall196: ___syscall196,
    ___syscall197: ___syscall197,
    ___syscall198: ___syscall198,
    ___syscall199: ___syscall199,
    ___syscall20: ___syscall20,
    ___syscall200: ___syscall200,
    ___syscall201: ___syscall201,
    ___syscall202: ___syscall202,
    ___syscall205: ___syscall205,
    ___syscall207: ___syscall207,
    ___syscall209: ___syscall209,
    ___syscall211: ___syscall211,
    ___syscall212: ___syscall212,
    ___syscall220: ___syscall220,
    ___syscall221: ___syscall221,
    ___syscall268: ___syscall268,
    ___syscall269: ___syscall269,
    ___syscall295: ___syscall295,
    ___syscall3: ___syscall3,
    ___syscall300: ___syscall300,
    ___syscall306: ___syscall306,
    ___syscall33: ___syscall33,
    ___syscall331: ___syscall331,
    ___syscall34: ___syscall34,
    ___syscall38: ___syscall38,
    ___syscall39: ___syscall39,
    ___syscall4: ___syscall4,
    ___syscall40: ___syscall40,
    ___syscall41: ___syscall41,
    ___syscall42: ___syscall42,
    ___syscall5: ___syscall5,
    ___syscall54: ___syscall54,
    ___syscall57: ___syscall57,
    ___syscall6: ___syscall6,
    ___syscall60: ___syscall60,
    ___syscall63: ___syscall63,
    ___syscall64: ___syscall64,
    ___syscall66: ___syscall66,
    ___syscall83: ___syscall83,
    ___syscall85: ___syscall85,
    ___syscall9: ___syscall9,
    ___syscall91: ___syscall91,
    ___syscall94: ___syscall94,
    ___unlock: ___unlock,
    ___wait: ___wait,
    ___wasi_fd_write: ___wasi_fd_write,
    __addDays: __addDays,
    __arraySum: __arraySum,
    __battery: __battery,
    __computeUnpackAlignedImageSize: __computeUnpackAlignedImageSize,
    __emscripten_do_request_fullscreen: __emscripten_do_request_fullscreen,
    __emscripten_syscall_munmap: __emscripten_syscall_munmap,
    __exit: __exit,
    __fillBatteryEventData: __fillBatteryEventData,
    __fillFullscreenChangeEventData: __fillFullscreenChangeEventData,
    __fillGamepadEventData: __fillGamepadEventData,
    __fillMouseEventData: __fillMouseEventData,
    __fillPointerlockChangeEventData: __fillPointerlockChangeEventData,
    __fillVisibilityChangeEventData: __fillVisibilityChangeEventData,
    __findCanvasEventTarget: __findCanvasEventTarget,
    __findEventTarget: __findEventTarget,
    __get_canvas_element_size: __get_canvas_element_size,
    __glGenObject: __glGenObject,
    __inet_ntop4_raw: __inet_ntop4_raw,
    __inet_ntop6_raw: __inet_ntop6_raw,
    __inet_pton4_raw: __inet_pton4_raw,
    __inet_pton6_raw: __inet_pton6_raw,
    __isLeapYear: __isLeapYear,
    __read_sockaddr: __read_sockaddr,
    __registerBeforeUnloadEventCallback: __registerBeforeUnloadEventCallback,
    __registerFocusEventCallback: __registerFocusEventCallback,
    __registerFullscreenChangeEventCallback: __registerFullscreenChangeEventCallback,
    __registerGamepadEventCallback: __registerGamepadEventCallback,
    __registerKeyEventCallback: __registerKeyEventCallback,
    __registerMouseEventCallback: __registerMouseEventCallback,
    __registerPointerlockChangeEventCallback: __registerPointerlockChangeEventCallback,
    __registerRestoreOldStyle: __registerRestoreOldStyle,
    __registerTouchEventCallback: __registerTouchEventCallback,
    __registerUiEventCallback: __registerUiEventCallback,
    __registerVisibilityChangeEventCallback: __registerVisibilityChangeEventCallback,
    __registerWheelEventCallback: __registerWheelEventCallback,
    __requestPointerLock: __requestPointerLock,
    __setLetterbox: __setLetterbox,
    __set_canvas_element_size: __set_canvas_element_size,
    __write_sockaddr: __write_sockaddr,
    _abort: _abort,
    _arc4random: _arc4random,
    _asctime: _asctime,
    _asctime_r: _asctime_r,
    _chroot: _chroot,
    _clock: _clock,
    _clock_gettime: _clock_gettime,
    _confstr: _confstr,
    _ctime: _ctime,
    _ctime_r: _ctime_r,
    _dlclose: _dlclose,
    _dlerror: _dlerror,
    _dlopen: _dlopen,
    _dlsym: _dlsym,
    _eglBindAPI: _eglBindAPI,
    _eglChooseConfig: _eglChooseConfig,
    _eglCreateContext: _eglCreateContext,
    _eglCreateWindowSurface: _eglCreateWindowSurface,
    _eglDestroyContext: _eglDestroyContext,
    _eglDestroySurface: _eglDestroySurface,
    _eglGetConfigAttrib: _eglGetConfigAttrib,
    _eglGetDisplay: _eglGetDisplay,
    _eglGetError: _eglGetError,
    _eglGetProcAddress: _eglGetProcAddress,
    _eglInitialize: _eglInitialize,
    _eglMakeCurrent: _eglMakeCurrent,
    _eglQueryString: _eglQueryString,
    _eglSwapBuffers: _eglSwapBuffers,
    _eglSwapInterval: _eglSwapInterval,
    _eglTerminate: _eglTerminate,
    _eglWaitClient: _eglWaitClient,
    _eglWaitGL: _eglWaitGL,
    _eglWaitNative: _eglWaitNative,
    _emscripten_asm_const_i: _emscripten_asm_const_i,
    _emscripten_asm_const_ii: _emscripten_asm_const_ii,
    _emscripten_asm_const_iii: _emscripten_asm_const_iii,
    _emscripten_asm_const_iiii: _emscripten_asm_const_iiii,
    _emscripten_asm_const_iiiii: _emscripten_asm_const_iiiii,
    _emscripten_asm_const_iiiiii: _emscripten_asm_const_iiiiii,
    _emscripten_async_call: _emscripten_async_call,
    _emscripten_exit_fullscreen: _emscripten_exit_fullscreen,
    _emscripten_exit_pointerlock: _emscripten_exit_pointerlock,
    _emscripten_exit_with_live_runtime: _emscripten_exit_with_live_runtime,
    _emscripten_get_battery_status: _emscripten_get_battery_status,
    _emscripten_get_canvas_element_size: _emscripten_get_canvas_element_size,
    _emscripten_get_device_pixel_ratio: _emscripten_get_device_pixel_ratio,
    _emscripten_get_element_css_size: _emscripten_get_element_css_size,
    _emscripten_get_gamepad_status: _emscripten_get_gamepad_status,
    _emscripten_get_heap_size: _emscripten_get_heap_size,
    _emscripten_get_now: _emscripten_get_now,
    _emscripten_get_now_is_monotonic: _emscripten_get_now_is_monotonic,
    _emscripten_get_num_gamepads: _emscripten_get_num_gamepads,
    _emscripten_glActiveTexture: _emscripten_glActiveTexture,
    _emscripten_glAttachShader: _emscripten_glAttachShader,
    _emscripten_glBeginQueryEXT: _emscripten_glBeginQueryEXT,
    _emscripten_glBindAttribLocation: _emscripten_glBindAttribLocation,
    _emscripten_glBindBuffer: _emscripten_glBindBuffer,
    _emscripten_glBindFramebuffer: _emscripten_glBindFramebuffer,
    _emscripten_glBindRenderbuffer: _emscripten_glBindRenderbuffer,
    _emscripten_glBindTexture: _emscripten_glBindTexture,
    _emscripten_glBindVertexArrayOES: _emscripten_glBindVertexArrayOES,
    _emscripten_glBlendColor: _emscripten_glBlendColor,
    _emscripten_glBlendEquation: _emscripten_glBlendEquation,
    _emscripten_glBlendEquationSeparate: _emscripten_glBlendEquationSeparate,
    _emscripten_glBlendFunc: _emscripten_glBlendFunc,
    _emscripten_glBlendFuncSeparate: _emscripten_glBlendFuncSeparate,
    _emscripten_glBufferData: _emscripten_glBufferData,
    _emscripten_glBufferSubData: _emscripten_glBufferSubData,
    _emscripten_glCheckFramebufferStatus: _emscripten_glCheckFramebufferStatus,
    _emscripten_glClear: _emscripten_glClear,
    _emscripten_glClearColor: _emscripten_glClearColor,
    _emscripten_glClearDepthf: _emscripten_glClearDepthf,
    _emscripten_glClearStencil: _emscripten_glClearStencil,
    _emscripten_glColorMask: _emscripten_glColorMask,
    _emscripten_glCompileShader: _emscripten_glCompileShader,
    _emscripten_glCompressedTexImage2D: _emscripten_glCompressedTexImage2D,
    _emscripten_glCompressedTexSubImage2D: _emscripten_glCompressedTexSubImage2D,
    _emscripten_glCopyTexImage2D: _emscripten_glCopyTexImage2D,
    _emscripten_glCopyTexSubImage2D: _emscripten_glCopyTexSubImage2D,
    _emscripten_glCreateProgram: _emscripten_glCreateProgram,
    _emscripten_glCreateShader: _emscripten_glCreateShader,
    _emscripten_glCullFace: _emscripten_glCullFace,
    _emscripten_glDeleteBuffers: _emscripten_glDeleteBuffers,
    _emscripten_glDeleteFramebuffers: _emscripten_glDeleteFramebuffers,
    _emscripten_glDeleteProgram: _emscripten_glDeleteProgram,
    _emscripten_glDeleteQueriesEXT: _emscripten_glDeleteQueriesEXT,
    _emscripten_glDeleteRenderbuffers: _emscripten_glDeleteRenderbuffers,
    _emscripten_glDeleteShader: _emscripten_glDeleteShader,
    _emscripten_glDeleteTextures: _emscripten_glDeleteTextures,
    _emscripten_glDeleteVertexArraysOES: _emscripten_glDeleteVertexArraysOES,
    _emscripten_glDepthFunc: _emscripten_glDepthFunc,
    _emscripten_glDepthMask: _emscripten_glDepthMask,
    _emscripten_glDepthRangef: _emscripten_glDepthRangef,
    _emscripten_glDetachShader: _emscripten_glDetachShader,
    _emscripten_glDisable: _emscripten_glDisable,
    _emscripten_glDisableVertexAttribArray: _emscripten_glDisableVertexAttribArray,
    _emscripten_glDrawArrays: _emscripten_glDrawArrays,
    _emscripten_glDrawArraysInstancedANGLE: _emscripten_glDrawArraysInstancedANGLE,
    _emscripten_glDrawBuffersWEBGL: _emscripten_glDrawBuffersWEBGL,
    _emscripten_glDrawElements: _emscripten_glDrawElements,
    _emscripten_glDrawElementsInstancedANGLE: _emscripten_glDrawElementsInstancedANGLE,
    _emscripten_glEnable: _emscripten_glEnable,
    _emscripten_glEnableVertexAttribArray: _emscripten_glEnableVertexAttribArray,
    _emscripten_glEndQueryEXT: _emscripten_glEndQueryEXT,
    _emscripten_glFinish: _emscripten_glFinish,
    _emscripten_glFlush: _emscripten_glFlush,
    _emscripten_glFramebufferRenderbuffer: _emscripten_glFramebufferRenderbuffer,
    _emscripten_glFramebufferTexture2D: _emscripten_glFramebufferTexture2D,
    _emscripten_glFrontFace: _emscripten_glFrontFace,
    _emscripten_glGenBuffers: _emscripten_glGenBuffers,
    _emscripten_glGenFramebuffers: _emscripten_glGenFramebuffers,
    _emscripten_glGenQueriesEXT: _emscripten_glGenQueriesEXT,
    _emscripten_glGenRenderbuffers: _emscripten_glGenRenderbuffers,
    _emscripten_glGenTextures: _emscripten_glGenTextures,
    _emscripten_glGenVertexArraysOES: _emscripten_glGenVertexArraysOES,
    _emscripten_glGenerateMipmap: _emscripten_glGenerateMipmap,
    _emscripten_glGetActiveAttrib: _emscripten_glGetActiveAttrib,
    _emscripten_glGetActiveUniform: _emscripten_glGetActiveUniform,
    _emscripten_glGetAttachedShaders: _emscripten_glGetAttachedShaders,
    _emscripten_glGetAttribLocation: _emscripten_glGetAttribLocation,
    _emscripten_glGetBooleanv: _emscripten_glGetBooleanv,
    _emscripten_glGetBufferParameteriv: _emscripten_glGetBufferParameteriv,
    _emscripten_glGetError: _emscripten_glGetError,
    _emscripten_glGetFloatv: _emscripten_glGetFloatv,
    _emscripten_glGetFramebufferAttachmentParameteriv: _emscripten_glGetFramebufferAttachmentParameteriv,
    _emscripten_glGetIntegerv: _emscripten_glGetIntegerv,
    _emscripten_glGetProgramInfoLog: _emscripten_glGetProgramInfoLog,
    _emscripten_glGetProgramiv: _emscripten_glGetProgramiv,
    _emscripten_glGetQueryObjecti64vEXT: _emscripten_glGetQueryObjecti64vEXT,
    _emscripten_glGetQueryObjectivEXT: _emscripten_glGetQueryObjectivEXT,
    _emscripten_glGetQueryObjectui64vEXT: _emscripten_glGetQueryObjectui64vEXT,
    _emscripten_glGetQueryObjectuivEXT: _emscripten_glGetQueryObjectuivEXT,
    _emscripten_glGetQueryivEXT: _emscripten_glGetQueryivEXT,
    _emscripten_glGetRenderbufferParameteriv: _emscripten_glGetRenderbufferParameteriv,
    _emscripten_glGetShaderInfoLog: _emscripten_glGetShaderInfoLog,
    _emscripten_glGetShaderPrecisionFormat: _emscripten_glGetShaderPrecisionFormat,
    _emscripten_glGetShaderSource: _emscripten_glGetShaderSource,
    _emscripten_glGetShaderiv: _emscripten_glGetShaderiv,
    _emscripten_glGetString: _emscripten_glGetString,
    _emscripten_glGetTexParameterfv: _emscripten_glGetTexParameterfv,
    _emscripten_glGetTexParameteriv: _emscripten_glGetTexParameteriv,
    _emscripten_glGetUniformLocation: _emscripten_glGetUniformLocation,
    _emscripten_glGetUniformfv: _emscripten_glGetUniformfv,
    _emscripten_glGetUniformiv: _emscripten_glGetUniformiv,
    _emscripten_glGetVertexAttribPointerv: _emscripten_glGetVertexAttribPointerv,
    _emscripten_glGetVertexAttribfv: _emscripten_glGetVertexAttribfv,
    _emscripten_glGetVertexAttribiv: _emscripten_glGetVertexAttribiv,
    _emscripten_glHint: _emscripten_glHint,
    _emscripten_glIsBuffer: _emscripten_glIsBuffer,
    _emscripten_glIsEnabled: _emscripten_glIsEnabled,
    _emscripten_glIsFramebuffer: _emscripten_glIsFramebuffer,
    _emscripten_glIsProgram: _emscripten_glIsProgram,
    _emscripten_glIsQueryEXT: _emscripten_glIsQueryEXT,
    _emscripten_glIsRenderbuffer: _emscripten_glIsRenderbuffer,
    _emscripten_glIsShader: _emscripten_glIsShader,
    _emscripten_glIsTexture: _emscripten_glIsTexture,
    _emscripten_glIsVertexArrayOES: _emscripten_glIsVertexArrayOES,
    _emscripten_glLineWidth: _emscripten_glLineWidth,
    _emscripten_glLinkProgram: _emscripten_glLinkProgram,
    _emscripten_glPixelStorei: _emscripten_glPixelStorei,
    _emscripten_glPolygonOffset: _emscripten_glPolygonOffset,
    _emscripten_glQueryCounterEXT: _emscripten_glQueryCounterEXT,
    _emscripten_glReadPixels: _emscripten_glReadPixels,
    _emscripten_glReleaseShaderCompiler: _emscripten_glReleaseShaderCompiler,
    _emscripten_glRenderbufferStorage: _emscripten_glRenderbufferStorage,
    _emscripten_glSampleCoverage: _emscripten_glSampleCoverage,
    _emscripten_glScissor: _emscripten_glScissor,
    _emscripten_glShaderBinary: _emscripten_glShaderBinary,
    _emscripten_glShaderSource: _emscripten_glShaderSource,
    _emscripten_glStencilFunc: _emscripten_glStencilFunc,
    _emscripten_glStencilFuncSeparate: _emscripten_glStencilFuncSeparate,
    _emscripten_glStencilMask: _emscripten_glStencilMask,
    _emscripten_glStencilMaskSeparate: _emscripten_glStencilMaskSeparate,
    _emscripten_glStencilOp: _emscripten_glStencilOp,
    _emscripten_glStencilOpSeparate: _emscripten_glStencilOpSeparate,
    _emscripten_glTexImage2D: _emscripten_glTexImage2D,
    _emscripten_glTexParameterf: _emscripten_glTexParameterf,
    _emscripten_glTexParameterfv: _emscripten_glTexParameterfv,
    _emscripten_glTexParameteri: _emscripten_glTexParameteri,
    _emscripten_glTexParameteriv: _emscripten_glTexParameteriv,
    _emscripten_glTexSubImage2D: _emscripten_glTexSubImage2D,
    _emscripten_glUniform1f: _emscripten_glUniform1f,
    _emscripten_glUniform1fv: _emscripten_glUniform1fv,
    _emscripten_glUniform1i: _emscripten_glUniform1i,
    _emscripten_glUniform1iv: _emscripten_glUniform1iv,
    _emscripten_glUniform2f: _emscripten_glUniform2f,
    _emscripten_glUniform2fv: _emscripten_glUniform2fv,
    _emscripten_glUniform2i: _emscripten_glUniform2i,
    _emscripten_glUniform2iv: _emscripten_glUniform2iv,
    _emscripten_glUniform3f: _emscripten_glUniform3f,
    _emscripten_glUniform3fv: _emscripten_glUniform3fv,
    _emscripten_glUniform3i: _emscripten_glUniform3i,
    _emscripten_glUniform3iv: _emscripten_glUniform3iv,
    _emscripten_glUniform4f: _emscripten_glUniform4f,
    _emscripten_glUniform4fv: _emscripten_glUniform4fv,
    _emscripten_glUniform4i: _emscripten_glUniform4i,
    _emscripten_glUniform4iv: _emscripten_glUniform4iv,
    _emscripten_glUniformMatrix2fv: _emscripten_glUniformMatrix2fv,
    _emscripten_glUniformMatrix3fv: _emscripten_glUniformMatrix3fv,
    _emscripten_glUniformMatrix4fv: _emscripten_glUniformMatrix4fv,
    _emscripten_glUseProgram: _emscripten_glUseProgram,
    _emscripten_glValidateProgram: _emscripten_glValidateProgram,
    _emscripten_glVertexAttrib1f: _emscripten_glVertexAttrib1f,
    _emscripten_glVertexAttrib1fv: _emscripten_glVertexAttrib1fv,
    _emscripten_glVertexAttrib2f: _emscripten_glVertexAttrib2f,
    _emscripten_glVertexAttrib2fv: _emscripten_glVertexAttrib2fv,
    _emscripten_glVertexAttrib3f: _emscripten_glVertexAttrib3f,
    _emscripten_glVertexAttrib3fv: _emscripten_glVertexAttrib3fv,
    _emscripten_glVertexAttrib4f: _emscripten_glVertexAttrib4f,
    _emscripten_glVertexAttrib4fv: _emscripten_glVertexAttrib4fv,
    _emscripten_glVertexAttribDivisorANGLE: _emscripten_glVertexAttribDivisorANGLE,
    _emscripten_glVertexAttribPointer: _emscripten_glVertexAttribPointer,
    _emscripten_glViewport: _emscripten_glViewport,
    _emscripten_longjmp: _emscripten_longjmp,
    _emscripten_memcpy_big: _emscripten_memcpy_big,
    _emscripten_request_fullscreen_strategy: _emscripten_request_fullscreen_strategy,
    _emscripten_request_pointerlock: _emscripten_request_pointerlock,
    _emscripten_resize_heap: _emscripten_resize_heap,
    _emscripten_run_script: _emscripten_run_script,
    _emscripten_run_script_int: _emscripten_run_script_int,
    _emscripten_run_script_string: _emscripten_run_script_string,
    _emscripten_sample_gamepad_data: _emscripten_sample_gamepad_data,
    _emscripten_set_beforeunload_callback_on_thread: _emscripten_set_beforeunload_callback_on_thread,
    _emscripten_set_blur_callback_on_thread: _emscripten_set_blur_callback_on_thread,
    _emscripten_set_canvas_element_size: _emscripten_set_canvas_element_size,
    _emscripten_set_element_css_size: _emscripten_set_element_css_size,
    _emscripten_set_focus_callback_on_thread: _emscripten_set_focus_callback_on_thread,
    _emscripten_set_fullscreenchange_callback_on_thread: _emscripten_set_fullscreenchange_callback_on_thread,
    _emscripten_set_gamepadconnected_callback_on_thread: _emscripten_set_gamepadconnected_callback_on_thread,
    _emscripten_set_gamepaddisconnected_callback_on_thread: _emscripten_set_gamepaddisconnected_callback_on_thread,
    _emscripten_set_keydown_callback_on_thread: _emscripten_set_keydown_callback_on_thread,
    _emscripten_set_keypress_callback_on_thread: _emscripten_set_keypress_callback_on_thread,
    _emscripten_set_keyup_callback_on_thread: _emscripten_set_keyup_callback_on_thread,
    _emscripten_set_main_loop: _emscripten_set_main_loop,
    _emscripten_set_main_loop_arg: _emscripten_set_main_loop_arg,
    _emscripten_set_main_loop_timing: _emscripten_set_main_loop_timing,
    _emscripten_set_mousedown_callback_on_thread: _emscripten_set_mousedown_callback_on_thread,
    _emscripten_set_mouseenter_callback_on_thread: _emscripten_set_mouseenter_callback_on_thread,
    _emscripten_set_mouseleave_callback_on_thread: _emscripten_set_mouseleave_callback_on_thread,
    _emscripten_set_mousemove_callback_on_thread: _emscripten_set_mousemove_callback_on_thread,
    _emscripten_set_mouseup_callback_on_thread: _emscripten_set_mouseup_callback_on_thread,
    _emscripten_set_pointerlockchange_callback_on_thread: _emscripten_set_pointerlockchange_callback_on_thread,
    _emscripten_set_resize_callback_on_thread: _emscripten_set_resize_callback_on_thread,
    _emscripten_set_touchcancel_callback_on_thread: _emscripten_set_touchcancel_callback_on_thread,
    _emscripten_set_touchend_callback_on_thread: _emscripten_set_touchend_callback_on_thread,
    _emscripten_set_touchmove_callback_on_thread: _emscripten_set_touchmove_callback_on_thread,
    _emscripten_set_touchstart_callback_on_thread: _emscripten_set_touchstart_callback_on_thread,
    _emscripten_set_visibilitychange_callback_on_thread: _emscripten_set_visibilitychange_callback_on_thread,
    _emscripten_set_wheel_callback_on_thread: _emscripten_set_wheel_callback_on_thread,
    _emscripten_sleep: _emscripten_sleep,
    _emscripten_sleep_with_yield: _emscripten_sleep_with_yield,
    _endpwent: _endpwent,
    _execl: _execl,
    _execv: _execv,
    _execve: _execve,
    _exit: _exit,
    _fabs: _fabs,
    _fd_write: _fd_write,
    _fork: _fork,
    _fpathconf: _fpathconf,
    _ftime: _ftime,
    _gai_strerror: _gai_strerror,
    _getaddrinfo: _getaddrinfo,
    _getenv: _getenv,
    _gethostbyaddr: _gethostbyaddr,
    _gethostbyname: _gethostbyname,
    _getloadavg: _getloadavg,
    _getnameinfo: _getnameinfo,
    _getprotobyname: _getprotobyname,
    _getpwent: _getpwent,
    _getpwnam: _getpwnam,
    _getpwuid: _getpwuid,
    _gettimeofday: _gettimeofday,
    _glActiveTexture: _glActiveTexture,
    _glAttachShader: _glAttachShader,
    _glBindFramebuffer: _glBindFramebuffer,
    _glBindRenderbuffer: _glBindRenderbuffer,
    _glBindTexture: _glBindTexture,
    _glBlendFunc: _glBlendFunc,
    _glClear: _glClear,
    _glClearColor: _glClearColor,
    _glCompileShader: _glCompileShader,
    _glCopyTexImage2D: _glCopyTexImage2D,
    _glCopyTexSubImage2D: _glCopyTexSubImage2D,
    _glCreateProgram: _glCreateProgram,
    _glCreateShader: _glCreateShader,
    _glDeleteFramebuffers: _glDeleteFramebuffers,
    _glDeleteProgram: _glDeleteProgram,
    _glDeleteRenderbuffers: _glDeleteRenderbuffers,
    _glDeleteShader: _glDeleteShader,
    _glDeleteTextures: _glDeleteTextures,
    _glDisable: _glDisable,
    _glDisableVertexAttribArray: _glDisableVertexAttribArray,
    _glDrawArrays: _glDrawArrays,
    _glEnable: _glEnable,
    _glEnableVertexAttribArray: _glEnableVertexAttribArray,
    _glFinish: _glFinish,
    _glFramebufferRenderbuffer: _glFramebufferRenderbuffer,
    _glFramebufferTexture2D: _glFramebufferTexture2D,
    _glGenFramebuffers: _glGenFramebuffers,
    _glGenRenderbuffers: _glGenRenderbuffers,
    _glGenTextures: _glGenTextures,
    _glGetAttribLocation: _glGetAttribLocation,
    _glGetError: _glGetError,
    _glGetIntegerv: _glGetIntegerv,
    _glGetProgramInfoLog: _glGetProgramInfoLog,
    _glGetProgramiv: _glGetProgramiv,
    _glGetShaderInfoLog: _glGetShaderInfoLog,
    _glGetShaderiv: _glGetShaderiv,
    _glGetString: _glGetString,
    _glGetUniformLocation: _glGetUniformLocation,
    _glLinkProgram: _glLinkProgram,
    _glReadPixels: _glReadPixels,
    _glRenderbufferStorage: _glRenderbufferStorage,
    _glScissor: _glScissor,
    _glShaderSource: _glShaderSource,
    _glTexImage2D: _glTexImage2D,
    _glTexParameteri: _glTexParameteri,
    _glTexSubImage2D: _glTexSubImage2D,
    _glUniform1f: _glUniform1f,
    _glUniform1i: _glUniform1i,
    _glUniform2f: _glUniform2f,
    _glUniform4f: _glUniform4f,
    _glUniformMatrix4fv: _glUniformMatrix4fv,
    _glUseProgram: _glUseProgram,
    _glVertexAttribPointer: _glVertexAttribPointer,
    _glViewport: _glViewport,
    _gmtime: _gmtime,
    _gmtime_r: _gmtime_r,
    _kill: _kill,
    _killpg: _killpg,
    _llvm_copysign_f64: _llvm_copysign_f64,
    _llvm_cttz_i32: _llvm_cttz_i32,
    _llvm_exp2_f32: _llvm_exp2_f32,
    _llvm_exp2_f64: _llvm_exp2_f64,
    _llvm_log10_f32: _llvm_log10_f32,
    _llvm_log10_f64: _llvm_log10_f64,
    _llvm_stackrestore: _llvm_stackrestore,
    _llvm_stacksave: _llvm_stacksave,
    _llvm_trap: _llvm_trap,
    _llvm_trunc_f64: _llvm_trunc_f64,
    _localtime: _localtime,
    _localtime_r: _localtime_r,
    _longjmp: _longjmp,
    _mktime: _mktime,
    _nanosleep: _nanosleep,
    _pathconf: _pathconf,
    _pthread_cond_destroy: _pthread_cond_destroy,
    _pthread_cond_init: _pthread_cond_init,
    _pthread_cond_signal: _pthread_cond_signal,
    _pthread_cond_wait: _pthread_cond_wait,
    _pthread_create: _pthread_create,
    _pthread_join: _pthread_join,
    _pthread_setcancelstate: _pthread_setcancelstate,
    _pthread_sigmask: _pthread_sigmask,
    _putenv: _putenv,
    _setenv: _setenv,
    _setgroups: _setgroups,
    _setprotoent: _setprotoent,
    _setpwent: _setpwent,
    _sigaction: _sigaction,
    _sigemptyset: _sigemptyset,
    _sigfillset: _sigfillset,
    _signal: _signal,
    _strftime: _strftime,
    _sysconf: _sysconf,
    _system: _system,
    _time: _time,
    _times: _times,
    _tzset: _tzset,
    _unsetenv: _unsetenv,
    _usleep: _usleep,
    _utime: _utime,
    _utimes: _utimes,
    _wait: _wait,
    _wait3: _wait3,
    _wait4: _wait4,
    _waitpid: _waitpid,
    abortOnCannotGrowMemory: abortOnCannotGrowMemory,
    demangle: demangle,
    demangleAll: demangleAll,
    emscriptenWebGLGet: emscriptenWebGLGet,
    emscriptenWebGLGetTexPixelData: emscriptenWebGLGetTexPixelData,
    emscriptenWebGLGetUniform: emscriptenWebGLGetUniform,
    emscriptenWebGLGetVertexAttrib: emscriptenWebGLGetVertexAttrib,
    emscripten_realloc_buffer: emscripten_realloc_buffer,
    jsStackTrace: jsStackTrace,
    stackTrace: stackTrace,
    stringToNewUTF8: stringToNewUTF8,
    tempDoublePtr: tempDoublePtr,
    DYNAMICTOP_PTR: DYNAMICTOP_PTR,
    EMTSTACKTOP: EMTSTACKTOP,
    EMT_STACK_MAX: EMT_STACK_MAX,
    eb: eb,
};
var asm = Module["asm"](asmGlobalArg, asmLibraryArg, buffer);
Module["asm"] = asm;
var _PyRun_SimpleString = (Module["_PyRun_SimpleString"] = function () {
    return Module["asm"]["_PyRun_SimpleString"].apply(null, arguments);
});
var _Py_Initialize = (Module["_Py_Initialize"] = function () {
    return Module["asm"]["_Py_Initialize"].apply(null, arguments);
});
var ___divdi3 = (Module["___divdi3"] = function () {
    return Module["asm"]["___divdi3"].apply(null, arguments);
});
var ___emscripten_environ_constructor = (Module["___emscripten_environ_constructor"] = function () {
    return Module["asm"]["___emscripten_environ_constructor"].apply(null, arguments);
});
var ___errno_location = (Module["___errno_location"] = function () {
    return Module["asm"]["___errno_location"].apply(null, arguments);
});
var ___muldi3 = (Module["___muldi3"] = function () {
    return Module["asm"]["___muldi3"].apply(null, arguments);
});
var ___remdi3 = (Module["___remdi3"] = function () {
    return Module["asm"]["___remdi3"].apply(null, arguments);
});
var ___udivdi3 = (Module["___udivdi3"] = function () {
    return Module["asm"]["___udivdi3"].apply(null, arguments);
});
var ___uremdi3 = (Module["___uremdi3"] = function () {
    return Module["asm"]["___uremdi3"].apply(null, arguments);
});
var __get_daylight = (Module["__get_daylight"] = function () {
    return Module["asm"]["__get_daylight"].apply(null, arguments);
});
var __get_environ = (Module["__get_environ"] = function () {
    return Module["asm"]["__get_environ"].apply(null, arguments);
});
var __get_timezone = (Module["__get_timezone"] = function () {
    return Module["asm"]["__get_timezone"].apply(null, arguments);
});
var __get_tzname = (Module["__get_tzname"] = function () {
    return Module["asm"]["__get_tzname"].apply(null, arguments);
});
var _bitshift64Ashr = (Module["_bitshift64Ashr"] = function () {
    return Module["asm"]["_bitshift64Ashr"].apply(null, arguments);
});
var _bitshift64Lshr = (Module["_bitshift64Lshr"] = function () {
    return Module["asm"]["_bitshift64Lshr"].apply(null, arguments);
});
var _bitshift64Shl = (Module["_bitshift64Shl"] = function () {
    return Module["asm"]["_bitshift64Shl"].apply(null, arguments);
});
var _emSavegamesExport = (Module["_emSavegamesExport"] = function () {
    return Module["asm"]["_emSavegamesExport"].apply(null, arguments);
});
var _emSavegamesImport = (Module["_emSavegamesImport"] = function () {
    return Module["asm"]["_emSavegamesImport"].apply(null, arguments);
});
var _emscripten_GetProcAddress = (Module["_emscripten_GetProcAddress"] = function () {
    return Module["asm"]["_emscripten_GetProcAddress"].apply(null, arguments);
});
var _emscripten_replace_memory = (Module["_emscripten_replace_memory"] = function () {
    return Module["asm"]["_emscripten_replace_memory"].apply(null, arguments);
});
var _fileno = (Module["_fileno"] = function () {
    return Module["asm"]["_fileno"].apply(null, arguments);
});
var _free = (Module["_free"] = function () {
    return Module["asm"]["_free"].apply(null, arguments);
});
var _htonl = (Module["_htonl"] = function () {
    return Module["asm"]["_htonl"].apply(null, arguments);
});
var _htons = (Module["_htons"] = function () {
    return Module["asm"]["_htons"].apply(null, arguments);
});
var _i64Add = (Module["_i64Add"] = function () {
    return Module["asm"]["_i64Add"].apply(null, arguments);
});
var _i64Subtract = (Module["_i64Subtract"] = function () {
    return Module["asm"]["_i64Subtract"].apply(null, arguments);
});
var _llvm_bswap_i16 = (Module["_llvm_bswap_i16"] = function () {
    return Module["asm"]["_llvm_bswap_i16"].apply(null, arguments);
});
var _llvm_bswap_i32 = (Module["_llvm_bswap_i32"] = function () {
    return Module["asm"]["_llvm_bswap_i32"].apply(null, arguments);
});
var _llvm_maxnum_f64 = (Module["_llvm_maxnum_f64"] = function () {
    return Module["asm"]["_llvm_maxnum_f64"].apply(null, arguments);
});
var _llvm_minnum_f64 = (Module["_llvm_minnum_f64"] = function () {
    return Module["asm"]["_llvm_minnum_f64"].apply(null, arguments);
});
var _llvm_rint_f64 = (Module["_llvm_rint_f64"] = function () {
    return Module["asm"]["_llvm_rint_f64"].apply(null, arguments);
});
var _llvm_round_f32 = (Module["_llvm_round_f32"] = function () {
    return Module["asm"]["_llvm_round_f32"].apply(null, arguments);
});
var _llvm_round_f64 = (Module["_llvm_round_f64"] = function () {
    return Module["asm"]["_llvm_round_f64"].apply(null, arguments);
});
var _main = (Module["_main"] = function () {
    return Module["asm"]["_main"].apply(null, arguments);
});
var _malloc = (Module["_malloc"] = function () {
    return Module["asm"]["_malloc"].apply(null, arguments);
});
var _memalign = (Module["_memalign"] = function () {
    return Module["asm"]["_memalign"].apply(null, arguments);
});
var _memcpy = (Module["_memcpy"] = function () {
    return Module["asm"]["_memcpy"].apply(null, arguments);
});
var _memmove = (Module["_memmove"] = function () {
    return Module["asm"]["_memmove"].apply(null, arguments);
});
var _memset = (Module["_memset"] = function () {
    return Module["asm"]["_memset"].apply(null, arguments);
});
var _ntohs = (Module["_ntohs"] = function () {
    return Module["asm"]["_ntohs"].apply(null, arguments);
});
var _pthread_cond_broadcast = (Module["_pthread_cond_broadcast"] = function () {
    return Module["asm"]["_pthread_cond_broadcast"].apply(null, arguments);
});
var _pyapp_runmain = (Module["_pyapp_runmain"] = function () {
    return Module["asm"]["_pyapp_runmain"].apply(null, arguments);
});
var _rand = (Module["_rand"] = function () {
    return Module["asm"]["_rand"].apply(null, arguments);
});
var _realloc = (Module["_realloc"] = function () {
    return Module["asm"]["_realloc"].apply(null, arguments);
});
var _rintf = (Module["_rintf"] = function () {
    return Module["asm"]["_rintf"].apply(null, arguments);
});
var _saveSetjmp = (Module["_saveSetjmp"] = function () {
    return Module["asm"]["_saveSetjmp"].apply(null, arguments);
});
var _sbrk = (Module["_sbrk"] = function () {
    return Module["asm"]["_sbrk"].apply(null, arguments);
});
var _setThrew = (Module["_setThrew"] = function () {
    return Module["asm"]["_setThrew"].apply(null, arguments);
});
var _strstr = (Module["_strstr"] = function () {
    return Module["asm"]["_strstr"].apply(null, arguments);
});
var _testSetjmp = (Module["_testSetjmp"] = function () {
    return Module["asm"]["_testSetjmp"].apply(null, arguments);
});
var emtStackRestore = (Module["emtStackRestore"] = function () {
    return Module["asm"]["emtStackRestore"].apply(null, arguments);
});
var emtStackSave = (Module["emtStackSave"] = function () {
    return Module["asm"]["emtStackSave"].apply(null, arguments);
});
var emterpret = (Module["emterpret"] = function () {
    return Module["asm"]["emterpret"].apply(null, arguments);
});
var establishStackSpace = (Module["establishStackSpace"] = function () {
    return Module["asm"]["establishStackSpace"].apply(null, arguments);
});
var getEmtStackMax = (Module["getEmtStackMax"] = function () {
    return Module["asm"]["getEmtStackMax"].apply(null, arguments);
});
var setAsyncState = (Module["setAsyncState"] = function () {
    return Module["asm"]["setAsyncState"].apply(null, arguments);
});
var setEmtStackMax = (Module["setEmtStackMax"] = function () {
    return Module["asm"]["setEmtStackMax"].apply(null, arguments);
});
var stackAlloc = (Module["stackAlloc"] = function () {
    return Module["asm"]["stackAlloc"].apply(null, arguments);
});
var stackRestore = (Module["stackRestore"] = function () {
    return Module["asm"]["stackRestore"].apply(null, arguments);
});
var stackSave = (Module["stackSave"] = function () {
    return Module["asm"]["stackSave"].apply(null, arguments);
});
var dynCall_X = (Module["dynCall_X"] = function () {
    return Module["asm"]["dynCall_X"].apply(null, arguments);
});
var dynCall_dd = (Module["dynCall_dd"] = function () {
    return Module["asm"]["dynCall_dd"].apply(null, arguments);
});
var dynCall_ddd = (Module["dynCall_ddd"] = function () {
    return Module["asm"]["dynCall_ddd"].apply(null, arguments);
});
var dynCall_did = (Module["dynCall_did"] = function () {
    return Module["asm"]["dynCall_did"].apply(null, arguments);
});
var dynCall_didd = (Module["dynCall_didd"] = function () {
    return Module["asm"]["dynCall_didd"].apply(null, arguments);
});
var dynCall_fiii = (Module["dynCall_fiii"] = function () {
    return Module["asm"]["dynCall_fiii"].apply(null, arguments);
});
var dynCall_i = (Module["dynCall_i"] = function () {
    return Module["asm"]["dynCall_i"].apply(null, arguments);
});
var dynCall_iffff = (Module["dynCall_iffff"] = function () {
    return Module["asm"]["dynCall_iffff"].apply(null, arguments);
});
var dynCall_ii = (Module["dynCall_ii"] = function () {
    return Module["asm"]["dynCall_ii"].apply(null, arguments);
});
var dynCall_iiddiddiii = (Module["dynCall_iiddiddiii"] = function () {
    return Module["asm"]["dynCall_iiddiddiii"].apply(null, arguments);
});
var dynCall_iidiiii = (Module["dynCall_iidiiii"] = function () {
    return Module["asm"]["dynCall_iidiiii"].apply(null, arguments);
});
var dynCall_iif = (Module["dynCall_iif"] = function () {
    return Module["asm"]["dynCall_iif"].apply(null, arguments);
});
var dynCall_iiff = (Module["dynCall_iiff"] = function () {
    return Module["asm"]["dynCall_iiff"].apply(null, arguments);
});
var dynCall_iiffff = (Module["dynCall_iiffff"] = function () {
    return Module["asm"]["dynCall_iiffff"].apply(null, arguments);
});
var dynCall_iii = (Module["dynCall_iii"] = function () {
    return Module["asm"]["dynCall_iii"].apply(null, arguments);
});
var dynCall_iiiddidddiii = (Module["dynCall_iiiddidddiii"] = function () {
    return Module["asm"]["dynCall_iiiddidddiii"].apply(null, arguments);
});
var dynCall_iiii = (Module["dynCall_iiii"] = function () {
    return Module["asm"]["dynCall_iiii"].apply(null, arguments);
});
var dynCall_iiiiddddiiii = (Module["dynCall_iiiiddddiiii"] = function () {
    return Module["asm"]["dynCall_iiiiddddiiii"].apply(null, arguments);
});
var dynCall_iiiiddi = (Module["dynCall_iiiiddi"] = function () {
    return Module["asm"]["dynCall_iiiiddi"].apply(null, arguments);
});
var dynCall_iiiiddidddiiii = (Module["dynCall_iiiiddidddiiii"] = function () {
    return Module["asm"]["dynCall_iiiiddidddiiii"].apply(null, arguments);
});
var dynCall_iiiii = (Module["dynCall_iiiii"] = function () {
    return Module["asm"]["dynCall_iiiii"].apply(null, arguments);
});
var dynCall_iiiiidii = (Module["dynCall_iiiiidii"] = function () {
    return Module["asm"]["dynCall_iiiiidii"].apply(null, arguments);
});
var dynCall_iiiiii = (Module["dynCall_iiiiii"] = function () {
    return Module["asm"]["dynCall_iiiiii"].apply(null, arguments);
});
var dynCall_iiiiiii = (Module["dynCall_iiiiiii"] = function () {
    return Module["asm"]["dynCall_iiiiiii"].apply(null, arguments);
});
var dynCall_iiiiiiidiiddi = (Module["dynCall_iiiiiiidiiddi"] = function () {
    return Module["asm"]["dynCall_iiiiiiidiiddi"].apply(null, arguments);
});
var dynCall_iiiiiiii = (Module["dynCall_iiiiiiii"] = function () {
    return Module["asm"]["dynCall_iiiiiiii"].apply(null, arguments);
});
var dynCall_iiiiiiiii = (Module["dynCall_iiiiiiiii"] = function () {
    return Module["asm"]["dynCall_iiiiiiiii"].apply(null, arguments);
});
var dynCall_iiiiiiiiii = (Module["dynCall_iiiiiiiiii"] = function () {
    return Module["asm"]["dynCall_iiiiiiiiii"].apply(null, arguments);
});
var dynCall_v = (Module["dynCall_v"] = function () {
    return Module["asm"]["dynCall_v"].apply(null, arguments);
});
var dynCall_vf = (Module["dynCall_vf"] = function () {
    return Module["asm"]["dynCall_vf"].apply(null, arguments);
});
var dynCall_vff = (Module["dynCall_vff"] = function () {
    return Module["asm"]["dynCall_vff"].apply(null, arguments);
});
var dynCall_vffff = (Module["dynCall_vffff"] = function () {
    return Module["asm"]["dynCall_vffff"].apply(null, arguments);
});
var dynCall_vfi = (Module["dynCall_vfi"] = function () {
    return Module["asm"]["dynCall_vfi"].apply(null, arguments);
});
var dynCall_vi = (Module["dynCall_vi"] = function () {
    return Module["asm"]["dynCall_vi"].apply(null, arguments);
});
var dynCall_vid = (Module["dynCall_vid"] = function () {
    return Module["asm"]["dynCall_vid"].apply(null, arguments);
});
var dynCall_vidddd = (Module["dynCall_vidddd"] = function () {
    return Module["asm"]["dynCall_vidddd"].apply(null, arguments);
});
var dynCall_vidddddd = (Module["dynCall_vidddddd"] = function () {
    return Module["asm"]["dynCall_vidddddd"].apply(null, arguments);
});
var dynCall_vidi = (Module["dynCall_vidi"] = function () {
    return Module["asm"]["dynCall_vidi"].apply(null, arguments);
});
var dynCall_vif = (Module["dynCall_vif"] = function () {
    return Module["asm"]["dynCall_vif"].apply(null, arguments);
});
var dynCall_viff = (Module["dynCall_viff"] = function () {
    return Module["asm"]["dynCall_viff"].apply(null, arguments);
});
var dynCall_vifff = (Module["dynCall_vifff"] = function () {
    return Module["asm"]["dynCall_vifff"].apply(null, arguments);
});
var dynCall_viffff = (Module["dynCall_viffff"] = function () {
    return Module["asm"]["dynCall_viffff"].apply(null, arguments);
});
var dynCall_vii = (Module["dynCall_vii"] = function () {
    return Module["asm"]["dynCall_vii"].apply(null, arguments);
});
var dynCall_viidi = (Module["dynCall_viidi"] = function () {
    return Module["asm"]["dynCall_viidi"].apply(null, arguments);
});
var dynCall_viif = (Module["dynCall_viif"] = function () {
    return Module["asm"]["dynCall_viif"].apply(null, arguments);
});
var dynCall_viifi = (Module["dynCall_viifi"] = function () {
    return Module["asm"]["dynCall_viifi"].apply(null, arguments);
});
var dynCall_viii = (Module["dynCall_viii"] = function () {
    return Module["asm"]["dynCall_viii"].apply(null, arguments);
});
var dynCall_viiiffff = (Module["dynCall_viiiffff"] = function () {
    return Module["asm"]["dynCall_viiiffff"].apply(null, arguments);
});
var dynCall_viiii = (Module["dynCall_viiii"] = function () {
    return Module["asm"]["dynCall_viiii"].apply(null, arguments);
});
var dynCall_viiiif = (Module["dynCall_viiiif"] = function () {
    return Module["asm"]["dynCall_viiiif"].apply(null, arguments);
});
var dynCall_viiiiffff = (Module["dynCall_viiiiffff"] = function () {
    return Module["asm"]["dynCall_viiiiffff"].apply(null, arguments);
});
var dynCall_viiiii = (Module["dynCall_viiiii"] = function () {
    return Module["asm"]["dynCall_viiiii"].apply(null, arguments);
});
var dynCall_viiiiiffff = (Module["dynCall_viiiiiffff"] = function () {
    return Module["asm"]["dynCall_viiiiiffff"].apply(null, arguments);
});
var dynCall_viiiiii = (Module["dynCall_viiiiii"] = function () {
    return Module["asm"]["dynCall_viiiiii"].apply(null, arguments);
});
var dynCall_viiiiiii = (Module["dynCall_viiiiiii"] = function () {
    return Module["asm"]["dynCall_viiiiiii"].apply(null, arguments);
});
var dynCall_viiiiiiii = (Module["dynCall_viiiiiiii"] = function () {
    return Module["asm"]["dynCall_viiiiiiii"].apply(null, arguments);
});
var dynCall_viiiiiiiii = (Module["dynCall_viiiiiiiii"] = function () {
    return Module["asm"]["dynCall_viiiiiiiii"].apply(null, arguments);
});
var dynCall_viiiiiiiiii = (Module["dynCall_viiiiiiiiii"] = function () {
    return Module["asm"]["dynCall_viiiiiiiiii"].apply(null, arguments);
});
var dynCall_viiiiiiiiiii = (Module["dynCall_viiiiiiiiiii"] = function () {
    return Module["asm"]["dynCall_viiiiiiiiiii"].apply(null, arguments);
});
var dynCall_viiiiiiiiiiii = (Module["dynCall_viiiiiiiiiiii"] = function () {
    return Module["asm"]["dynCall_viiiiiiiiiiii"].apply(null, arguments);
});
Module["dynCall_X"] = dynCall_X;
Module["dynCall_dd"] = dynCall_dd;
Module["dynCall_ddd"] = dynCall_ddd;
Module["dynCall_did"] = dynCall_did;
Module["dynCall_didd"] = dynCall_didd;
Module["dynCall_fiii"] = dynCall_fiii;
Module["dynCall_i"] = dynCall_i;
Module["dynCall_iffff"] = dynCall_iffff;
Module["dynCall_ii"] = dynCall_ii;
Module["dynCall_iiddiddiii"] = dynCall_iiddiddiii;
Module["dynCall_iidiiii"] = dynCall_iidiiii;
Module["dynCall_iif"] = dynCall_iif;
Module["dynCall_iiff"] = dynCall_iiff;
Module["dynCall_iiffff"] = dynCall_iiffff;
Module["dynCall_iii"] = dynCall_iii;
Module["dynCall_iiiddidddiii"] = dynCall_iiiddidddiii;
Module["dynCall_iiii"] = dynCall_iiii;
Module["dynCall_iiiiddddiiii"] = dynCall_iiiiddddiiii;
Module["dynCall_iiiiddi"] = dynCall_iiiiddi;
Module["dynCall_iiiiddidddiiii"] = dynCall_iiiiddidddiiii;
Module["dynCall_iiiii"] = dynCall_iiiii;
Module["dynCall_iiiiidii"] = dynCall_iiiiidii;
Module["dynCall_iiiiii"] = dynCall_iiiiii;
Module["dynCall_iiiiiii"] = dynCall_iiiiiii;
Module["dynCall_iiiiiiidiiddi"] = dynCall_iiiiiiidiiddi;
Module["dynCall_iiiiiiii"] = dynCall_iiiiiiii;
Module["dynCall_iiiiiiiii"] = dynCall_iiiiiiiii;
Module["dynCall_iiiiiiiiii"] = dynCall_iiiiiiiiii;
Module["dynCall_v"] = dynCall_v;
Module["dynCall_vf"] = dynCall_vf;
Module["dynCall_vff"] = dynCall_vff;
Module["dynCall_vffff"] = dynCall_vffff;
Module["dynCall_vfi"] = dynCall_vfi;
Module["dynCall_vi"] = dynCall_vi;
Module["dynCall_vid"] = dynCall_vid;
Module["dynCall_vidddd"] = dynCall_vidddd;
Module["dynCall_vidddddd"] = dynCall_vidddddd;
Module["dynCall_vidi"] = dynCall_vidi;
Module["dynCall_vif"] = dynCall_vif;
Module["dynCall_viff"] = dynCall_viff;
Module["dynCall_vifff"] = dynCall_vifff;
Module["dynCall_viffff"] = dynCall_viffff;
Module["dynCall_vii"] = dynCall_vii;
Module["dynCall_viidi"] = dynCall_viidi;
Module["dynCall_viif"] = dynCall_viif;
Module["dynCall_viifi"] = dynCall_viifi;
Module["dynCall_viii"] = dynCall_viii;
Module["dynCall_viiiffff"] = dynCall_viiiffff;
Module["dynCall_viiii"] = dynCall_viiii;
Module["dynCall_viiiif"] = dynCall_viiiif;
Module["dynCall_viiiiffff"] = dynCall_viiiiffff;
Module["dynCall_viiiii"] = dynCall_viiiii;
Module["dynCall_viiiiiffff"] = dynCall_viiiiiffff;
Module["dynCall_viiiiii"] = dynCall_viiiiii;
Module["dynCall_viiiiiii"] = dynCall_viiiiiii;
Module["dynCall_viiiiiiii"] = dynCall_viiiiiiii;
Module["dynCall_viiiiiiiii"] = dynCall_viiiiiiiii;
Module["dynCall_viiiiiiiiii"] = dynCall_viiiiiiiiii;
Module["dynCall_viiiiiiiiiii"] = dynCall_viiiiiiiiiii;
Module["dynCall_viiiiiiiiiiii"] = dynCall_viiiiiiiiiiii;
Module["asm"] = asm;
Module["ccall"] = ccall;
Module["cwrap"] = cwrap;
Module["getMemory"] = getMemory;
Module["addRunDependency"] = addRunDependency;
Module["removeRunDependency"] = removeRunDependency;
Module["FS_createFolder"] = FS.createFolder;
Module["FS_createPath"] = FS.createPath;
Module["FS_createDataFile"] = FS.createDataFile;
Module["FS_createPreloadedFile"] = FS.createPreloadedFile;
Module["FS_createLazyFile"] = FS.createLazyFile;
Module["FS_createLink"] = FS.createLink;
Module["FS_createDevice"] = FS.createDevice;
Module["FS_unlink"] = FS.unlink;
Module["calledRun"] = calledRun;
var calledRun;
function ExitStatus(status) {
    this.name = "ExitStatus";
    this.message = "Program terminated with exit(" + status + ")";
    this.status = status;
}
var calledMain = false;
dependenciesFulfilled = function runCaller() {
    if (!calledRun) run();
    if (!calledRun) dependenciesFulfilled = runCaller;
};
function callMain(args) {
    args = args || [];
    var argc = args.length + 1;
    var argv = stackAlloc((argc + 1) * 4);
    HEAP32[argv >> 2] = allocateUTF8OnStack(thisProgram);
    for (var i = 1; i < argc; i++) {
        HEAP32[(argv >> 2) + i] = allocateUTF8OnStack(args[i - 1]);
    }
    HEAP32[(argv >> 2) + argc] = 0;
    var initialEmtStackTop = Module["emtStackSave"]();
    try {
        var ret = Module["_main"](argc, argv);
        if (!noExitRuntime) {
            exit(ret, true);
        }
    } catch (e) {
        if (e instanceof ExitStatus) {
            return;
        } else if (e == "SimulateInfiniteLoop") {
            noExitRuntime = true;
            Module["emtStackRestore"](initialEmtStackTop);
            return;
        } else {
            var toLog = e;
            if (e && typeof e === "object" && e.stack) {
                toLog = [e, e.stack];
            }
            err("exception thrown: " + toLog);
            quit_(1, e);
        }
    } finally {
        calledMain = true;
    }
}
function run(args) {
    args = args || arguments_;
    if (runDependencies > 0) {
        return;
    }
    preRun();
    if (runDependencies > 0) return;
    function doRun() {
        if (calledRun) return;
        calledRun = true;
        Module["calledRun"] = true;
        if (ABORT) return;
        initRuntime();
        preMain();
        if (Module["onRuntimeInitialized"]) Module["onRuntimeInitialized"]();
        if (shouldRunNow) callMain(args);
        postRun();
    }
    if (Module["setStatus"]) {
        Module["setStatus"]("Running...");
        setTimeout(function () {
            setTimeout(function () {
                Module["setStatus"]("");
            }, 1);
            doRun();
        }, 1);
    } else {
        doRun();
    }
}
Module["run"] = run;
function exit(status, implicit) {
    if (implicit && noExitRuntime && status === 0) {
        return;
    }
    if (noExitRuntime) {
    } else {
        ABORT = true;
        EXITSTATUS = status;
        exitRuntime();
        if (Module["onExit"]) Module["onExit"](status);
    }
    quit_(status, new ExitStatus(status));
}
function abort(what) {
    if (Module["onAbort"]) {
        Module["onAbort"](what);
    }
    what += "";
    out(what);
    err(what);
    ABORT = true;
    EXITSTATUS = 1;
    throw "abort(" + what + "). Build with -s ASSERTIONS=1 for more info.";
}
Module["abort"] = abort;
if (Module["preInit"]) {
    if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
    while (Module["preInit"].length > 0) {
        Module["preInit"].pop()();
    }
}
var shouldRunNow = true;
if (Module["noInitialRun"]) shouldRunNow = false;
noExitRuntime = true;
run();
