const { StreamBuffer } = require('streambuf');

const EndianModes = {
    LE: 'LE',
    BE: 'BE'
};

const defaultEndianMode = EndianModes.LE;
const defaultEndianModeLowerCase = defaultEndianMode.toLowerCase();

function _readType(def, sb, path) {
    switch (def) {
        case 'int16':
        case 'int32':
        case 'int64':
        case 'uint16':
        case 'uint32':
        case 'uint64':
        case 'float':
        case 'double':
            def += defaultEndianModeLowerCase;
    }
    switch (def) {
        case 'uint8':
        case 'byte':
            return sb.readUInt8();
        case 'int8':
        case 'sbyte':
            return sb.readInt8();
        case 'int16le':
            return sb.readInt16LE();
        case 'int32le':
            return sb.readInt32LE();
        case 'int64le':
            return sb.readBigInt64LE();
        case 'uint16le':
            return sb.readUInt16LE();
        case 'uint32le':
            return sb.readUInt32LE();
        case 'uint64le':
            return sb.readBigUInt64LE();
        case 'floatle':
            return sb.readFloatLE();
        case 'doublele':
            return sb.readDoubleLE();
        case 'int16be':
            return sb.readInt16BE();
        case 'int32be':
            return sb.readInt32BE();
        case 'int64be':
            return sb.readBigInt64BE();
        case 'uint16be':
            return sb.readUInt16BE();
        case 'uint32be':
            return sb.readUInt32BE();
        case 'uint64be':
            return sb.readBigUInt64BE();
        case 'floatbe':
            return sb.readFloatBE();
        case 'doublebe':
            return sb.readDoubleBE();
        case 'string0':
            return sb.readString0();
        case 'string7':
            return sb.readString7();
        case 'string':
            throw new Error(`string may only be used as a $format`);
        case 'buffer':
            throw new Error(`buffer may only be used as a $format`);
        default:
            throw new Error(`Unknown struct type: '${def}' for '${path}'`);
    }
}

function _writeType(def, sb, val, path) {
    switch (def) {
        case 'int16':
        case 'int32':
        case 'int64':
        case 'uint16':
        case 'uint32':
        case 'uint64':
        case 'float':
        case 'double':
            def += defaultEndianModeLowerCase;
    }

    switch (def) {
        case 'uint8':
        case 'byte':
            sb.writeUInt8(val);
            break;
        case 'int8':
        case 'sbyte':
            sb.writeInt8(val);
            break;
        case 'int16le':
            sb.writeInt16LE(val);
            break;
        case 'int32le':
            sb.writeInt32LE(val);
            break;
        case 'int64le':
            sb.writeBigInt64LE(val);
            break;
        case 'uint16le':
            sb.writeUInt16LE(val);
            break;
        case 'uint32le':
            sb.writeUInt32LE(val);
            break;
        case 'uint64le':
            sb.writeBigUInt64LE(val);
            break;
        case 'floatle':
            sb.writeFloatLE(val);
            break;
        case 'doublele':
            sb.writeDoubleLE(val);
            break;
        case 'int16be':
            sb.writeInt16BE(val);
            break;
        case 'int32be':
            sb.writeInt32BE(val);
            break;
        case 'int64be':
            sb.writeBigInt64BE(val);
            break;
        case 'uint16be':
            sb.writeUInt16BE(val);
            break;
        case 'uint32be':
            sb.writeUInt32BE(val);
            break;
        case 'uint64be':
            sb.writeBigUInt64BE(val);
            break;
        case 'floatbe':
            sb.writeFloatBE(val);
            break;
        case 'doublebe':
            sb.writeDoubleBE(val);
            break;
        case 'string0':
            if (typeof val !== 'string') throw new Error(`_write: string: ${val} is not a string (${path})`);
            sb.writeString0(val);
            break;
        case 'string7':
            if (typeof val !== 'string') throw new Error(`_write: string: ${val} is not a string (${path})`);
            sb.writeString7(val);
            break;
        case 'string':
            throw new Error(`_write: string may only be used as a $format`);
        case 'buffer':
            throw new Error(`_write: buffer may only be used as a $format`);
        default:
            throw new Error(`Unknown struct type: '${def}' for '${path}'`);
    }
}

function resolvePath(obj, path) {
    if (!path.includes('.')) {
        return obj[path];
    }
    let result = obj;
    let parts = path.split('.');
    while (parts.length > 0) {
        let p = parts.shift();
        result = result[p];
    }
    return result;
}

function _findInScopes(path, scopes) {
    let name = path;
    let dotIndex = name.indexOf('.');
    if (dotIndex !== -1) {
        name = name.substr(0, dotIndex);
    }
    const scope = scopes.find(s => {
        return s != null && s[name] != null;
    });
    if (scope) {
        return resolvePath(scope, path);
    } else {
        throw new Error(`'${name}' not found in scope.`);
    }
}

function _resolve(q, scopes) {
    if (Number.isFinite(q)) {
        return q;
    }
    if (typeof q === 'string') {
        return _findInScopes(q, scopes);
    }
    return null;
}

function _read(def, sb, struct, scopes, name) {
    scopes.unshift(struct);

    let val,
        ignore = false;

    const resolve = q => {
        return _resolve(q, scopes);
    };

    if (typeof def === 'string') {
        if (def.startsWith('char')) {
            let [_, lenStr] = def.split('_');
            let len = Math.max(1, Number(lenStr));
            val = sb.readString(len);
        } else {
            val = _readType(def, sb, name);
        }
    } else if (typeof def === 'object') {
        if (def.$ignore) {
            ignore = true;
        }
        if (def.$goto != null) {
            let pos = Number(resolve(def.$goto));
            sb.seek(pos);
        } else if (def.$skip != null) {
            let skip = Number(resolve(def.$skip));
            sb.skip(skip);
        }
        if (def.$value != null && def.$format == null) {
            throw new Error(`$value must be used with $format`);
        }

        if (def.$format) {
            if (def.$value) {
                val = resolve(def.$value);
            } else if (def.$format === '$tell') {
                if (def.$tell == null)
                    throw new Error(`$format: '$tell' must have a $tell property containing its type`); // for compatibility with _write
                val = sb.tell();
            } else if (def.$repeat != null) {
                val = [];
                let numRepeat = resolve(def.$repeat);
                for (let i = 0; i < numRepeat; i++) {
                    let obj = _read(def.$format, sb, {}, scopes, name);
                    val.push(obj);
                }
            } else if (def.$foreach) {
                val = [];
                let [listName, listAlias] = def.$foreach.split(' ');
                let list = resolve(listName);
                if (!Array.isArray(list)) throw new Error(`$foreach: ${listName} must be an array.`);
                if (!listAlias)
                    throw new Error(`$foreach: item alias is missing, e.g. 'a' in $foreach: "${listName} a"`);

                for (const element of list) {
                    let itemScope = {};
                    itemScope[listAlias] = element;
                    let itemScopes = [...scopes, itemScope];
                    let obj = _read(def.$format, sb, {}, itemScopes, name);
                    val.push(obj);
                }
            } else if (def.$format === 'string') {
                let length = resolve(def.$length);
                let encoding = def.$encoding;
                val = sb.readString(length, encoding);
            } else if (def.$format === 'buffer') {
                let length = resolve(def.$length);
                if (!length) throw new Error("When $format = 'buffer', $length must be an integer greater than 0.");
                val = sb.read(length).buffer;
            } else {
                val = _read(def.$format, sb, {}, scopes, name);
            }
        } else if (def.$switch) {
            let numCase = resolve(def.$switch);
            if (Array.isArray(def.$cases)) {
                let newCases = {};
                def.$cases.forEach(c => (newCases[c.$case] = c));
                def.$cases = newCases;
            }
            let foundCase = def.$cases[numCase];
            if (!foundCase) foundCase = def.$cases.default ?? def.$cases.null;
            if (!foundCase) throw new Error(`$switch: case ${numCase} nor a default case found`);
            val = _read(foundCase, sb, {}, scopes, name);
        } else {
            val = {};
            Object.keys(def).forEach(key => {
                val[key] = _read(def[key], sb, val, scopes, key);
            });
        }
    }

    // Remove current scope from stack, MAKE SURE there is only ONE return statement in this function!
    scopes.shift();

    if (!ignore) {
        struct[name] = val;
    } else {
        Object.defineProperty(struct, name, {
            value: val,
            enumerable: false
        });
    }

    return val;
}

function fixStringLength(str, len) {
    str = str.slice(0, len);
    str = str.padEnd(len, '\x00');
    return str;
}

/**
 *
 * @param {*} def
 * @param {StreamBuffer} sb
 * @param {*} val
 * @param {*} scopes
 * @param {*} name
 */
function _write(def, sb, val, scopes, name) {
    scopes.unshift(val);
    
    const resolve = q => {
        return _resolve(q, scopes);
    };

    if (typeof def === 'string') {
        if (def.startsWith('char')) {
            if (val == null) val = '';
            if (typeof val !== 'string') throw new Error(`_write: char_x: ${val} is not a string (${name})`);
            let [_, lenStr] = def.split('_');
            let len = Math.max(1, Number(lenStr));
            let str = fixStringLength(val, len);
            sb.writeString(str);
        } else {
            _writeType(def, sb, val, name);
        }
    } else if (typeof def === 'object') {
        if (def.$goto != null) {
            let pos = resolve(def.$goto);
            sb.seek(pos);
        }
        if (def.$skip != null) {
            let skip = resolve(def.$skip);
            sb.skip(skip);
        }
        if (def.$value != null && def.$format == null) {
            throw new Error(`_write: $value must be used with $format`);
        }

        if (def.$format) {
            if (def.$value) {
                val = resolve(def.$value);
                _write(def.$format, sb, val, scopes, name);
            } else if (def.$format === '$tell') {
                if (def.$tell == null)
                    throw new Error(
                        `_write: $format: '$tell' must have a $tell property containing its type (${name})`
                    );
                let pos = sb.tell();
                _write(def.$tell, sb, pos, scopes, name);
            } else if (def.$repeat != null) {
                let numRepeat = resolve(def.$repeat);
                for (let i = 0; i < numRepeat; i++) {
                    let item = val[i];
                    _write(def.$format, sb, item, scopes, name);
                }
            } else if (def.$foreach) {
                let [listName, listAlias] = def.$foreach.split(' ');
                let list = resolve(listName);
                if (!Array.isArray(list)) throw new Error(`$foreach: ${listName} must be an array.`);
                if (!listAlias)
                    throw new Error(`$foreach: item alias is missing, e.g. 'a' in $foreach: "${listName} a"`);

                for (let i = 0; i < list.length; i++) {
                    let element = list[i];
                    let itemScope = {};
                    itemScope[listAlias] = element;
                    let itemScopes = [...scopes, itemScope];
                    _write(def.$format, sb, val[i], itemScopes, name);
                }
            } else if (def.$format === 'string') {
                if (typeof val !== 'string' && val != null)
                    throw new Error(`_write: string: ${val} is not a string (${name})`);
                let length = resolve(def.$length);
                if (!length)
                    throw new Error("_write: when $format = 'string', $length must be an integer greater than 0.");
                let encoding = def.$encoding;
                let str = val ?? '';
                if (length) {
                    // If the encoding is something like utf16le, we need to half the given length
                    if (encoding === 'utf16le') length /= 2;
                    str = fixStringLength(str, length);
                }
                sb.writeString(str, encoding);
            } else if (def.$format === 'buffer') {
                let length = resolve(def.$length);
                if (!length)
                    throw new Error("_write: when $format = 'buffer', $length must be an integer greater than 0.");
                sb.write(Buffer.from(val));
            } else {
                _write(def.$format, sb, val, scopes, name);
            }
        } else if (def.$switch) {
            let numCase = resolve(def.$switch);
            if (Array.isArray(def.$cases)) {
                let newCases = {};
                def.$cases.forEach(c => (newCases[c.$case] = c));
                def.$cases = newCases;
            }
            let foundCase = def.$cases[numCase];
            if (!foundCase) foundCase = def.$cases.default ?? def.$cases.null;
            if (!foundCase) throw new Error(`$switch: case ${numCase} nor a default case found`);
            _write(foundCase, sb, val, scopes, name);
        } else {
            if (val == null) throw new Error(`_write: Can not read properties from missing '${name}'`);
            Object.entries(def).forEach(e => {
                let [name, type] = e;
                _write(type, sb, val[name], scopes, name);
            });
        }
    } else {
        throw new Error(`_write: Unknown def type: ${def} (${typeof def})`);
    }

    scopes.shift();
}

/**
 * 
 * @param {StructorDefinition | string} def 
 * @param {StreamBuffer | Buffer} buffer 
 * @param { { offset?: number, info?: Record<string,object> }} [options]
 * @returns 
 */
function readStruct(def, buffer, options) {
    options = {
        offset: 0,
        info: {},
        ...options
    };

    let sb = new StreamBuffer(buffer);
    sb.seek(options.offset);

    let result = _read(def, sb, {}, []);
    options.info.eof = sb.isEOF();
    options.info.pos = sb.tell();
    options.info.len = buffer.length;
    return result;
}

/**
 * 
 * @param {any} obj 
 * @param {StructorDefinition | string} def 
 * @param {StreamBuffer | Buffer} buffer 
 * @param { { offset?: number, info?: Record<string,object> }} [options]
 * @returns 
 */
function writeStruct(obj, def, buffer, options) {
    options = {
        offset: 0,
        info: {},
        ...options
    };

    let sb = new StreamBuffer(buffer);
    sb.seek(options.offset);

    _write(def, sb, obj, []);

    // Return the number of bytes written
    return sb.tell();
}

function sizeOf(def, bufferSize = 4096) {
    let buffer = Buffer.alloc(bufferSize);
    let sb = new StreamBuffer(buffer);
    _read(def, sb, {}, []);
    return sb.tell();
}

module.exports = {
    EndianModes,

    readStruct,
    writeStruct,
    sizeOf
};
