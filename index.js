const { StreamBuffer } = require('streambuf')

const EndianModes = {
    LE: 'LE',
    BE: 'BE'
}

const defaultEndianMode = EndianModes.LE
const defaultEndianModeLowerCase = defaultEndianMode.toLowerCase()

// Cache parsed dot-path parts to avoid repeated split() allocations
const _pathPartsCache = {}

const simpleTypes = new Set(['int16', 'int32', 'int64', 'uint16', 'uint32', 'uint64', 'float', 'double'])

const readHandlers = {
    uint8: sb => sb.readUInt8(),
    byte: sb => sb.readUInt8(),
    int8: sb => sb.readInt8(),
    sbyte: sb => sb.readInt8(),
    int16le: sb => sb.readInt16LE(),
    int32le: sb => sb.readInt32LE(),
    int64le: sb => sb.readBigInt64LE(),
    uint16le: sb => sb.readUInt16LE(),
    uint32le: sb => sb.readUInt32LE(),
    uint64le: sb => sb.readBigUInt64LE(),
    floatle: sb => sb.readFloatLE(),
    doublele: sb => sb.readDoubleLE(),
    int16be: sb => sb.readInt16BE(),
    int32be: sb => sb.readInt32BE(),
    int64be: sb => sb.readBigInt64BE(),
    uint16be: sb => sb.readUInt16BE(),
    uint32be: sb => sb.readUInt32BE(),
    uint64be: sb => sb.readBigUInt64BE(),
    floatbe: sb => sb.readFloatBE(),
    doublebe: sb => sb.readDoubleBE(),
    string0: sb => sb.readString0(),
    string7: sb => sb.readString7()
}

const writeHandlers = {
    uint8: (sb, v) => sb.writeUInt8(v),
    byte: (sb, v) => sb.writeUInt8(v),
    int8: (sb, v) => sb.writeInt8(v),
    sbyte: (sb, v) => sb.writeInt8(v),
    int16le: (sb, v) => sb.writeInt16LE(v),
    int32le: (sb, v) => sb.writeInt32LE(v),
    int64le: (sb, v) => sb.writeBigInt64LE(v),
    uint16le: (sb, v) => sb.writeUInt16LE(v),
    uint32le: (sb, v) => sb.writeUInt32LE(v),
    uint64le: (sb, v) => sb.writeBigUInt64LE(v),
    floatle: (sb, v) => sb.writeFloatLE(v),
    doublele: (sb, v) => sb.writeDoubleLE(v),
    int16be: (sb, v) => sb.writeInt16BE(v),
    int32be: (sb, v) => sb.writeInt32BE(v),
    int64be: (sb, v) => sb.writeBigInt64BE(v),
    uint16be: (sb, v) => sb.writeUInt16BE(v),
    uint32be: (sb, v) => sb.writeUInt32BE(v),
    uint64be: (sb, v) => sb.writeBigUInt64BE(v),
    floatbe: (sb, v) => sb.writeFloatBE(v),
    doublebe: (sb, v) => sb.writeDoubleBE(v),
    string0: (sb, v) => sb.writeString0(v),
    string7: (sb, v) => sb.writeString7(v)
}

const typeHandlerCache = new Map()

function _readType(originalDef, sb, path) {
    let def = originalDef
    let cached = typeHandlerCache.get(originalDef)
    if (cached) {
        return cached(sb)
    }
    if (simpleTypes.has(def)) def += defaultEndianModeLowerCase
    const fn = readHandlers[def]
    typeHandlerCache.set(originalDef, fn)
    if (fn) return fn(sb)
    if (def === 'string') throw new Error(`string may only be used as a $format`)
    if (def === 'buffer') throw new Error(`buffer may only be used as a $format`)
    throw new Error(`Unknown struct type: '${def}' for '${path}'`)
}

function _writeType(def, sb, val, path) {
    if (simpleTypes.has(def)) def += defaultEndianModeLowerCase
    const fn = writeHandlers[def]
    if (fn) {
        if ((def === 'string0' || def === 'string7') && typeof val !== 'string')
            throw new Error(`_write: string: ${val} is not a string (${path})`)
        fn(sb, val)
        return
    }
    if (def === 'string') throw new Error(`_write: string may only be used as a $format`)
    if (def === 'buffer') throw new Error(`_write: buffer may only be used as a $format`)
    throw new Error(`Unknown struct type: '${def}' for '${path}'`)
}

function resolvePath(obj, path) {
    if (!path.includes('.')) {
        return obj[path]
    }
    let result = obj
    let parts = _pathPartsCache[path]
    if (!parts) {
        parts = path.split('.')
        _pathPartsCache[path] = parts
    }
    for (const p of parts) result = result[p]
    return result
}

function _findInScopes(path, scopes) {
    const quickCheck = scopes[scopes.length - 1][path]
    if (quickCheck != null) {
        return quickCheck
    }
    let name = path
    let dotIndex = name.indexOf('.')
    if (dotIndex !== -1) {
        name = name.substr(0, dotIndex)
    }
    let scope = null
    for (let i = scopes.length - 1; i >= 0; i--) {
        const s = scopes[i]
        if (s[name] != null) {
            scope = s
            break
        }
    }
    if (scope) return resolvePath(scope, path)
    throw new Error(`'${name}' not found in scope.`)
}

function _resolve(q, scopes) {
    if (Number.isFinite(q)) {
        return q
    }
    if (typeof q === 'string') {
        return _findInScopes(q, scopes)
    }
    return null
}

const defCache = new WeakMap()
function _getCachedDef(def) {
    let cached = defCache.get(def)
    if (cached) return cached
    const keys = Object.keys(def)
    const handlers = {}
    for (const key of keys) {
        const child = def[key]
        if (typeof child === 'string') {
            let dtype = child
            if (dtype.startsWith('char_')) {
                let [_, lenStr] = dtype.split('_')
                let len = Math.max(1, Number(lenStr))
                handlers[key] = { kind: 'char', len }
                continue
            } else {
                handlers[key] = { kind: 'type', type: dtype }
            }
        }
    }
    cached = { keys, handlers }
    defCache.set(def, cached)
    return cached
}

function _readSwitch(def, sb, scopes, name) {
    let numCase = _resolve(def.$switch, scopes)
    if (Array.isArray(def.$cases)) {
        let newCases = {}
        def.$cases.forEach(c => (newCases[c.$case] = c))
        def.$cases = newCases
    }
    let foundCase = def.$cases[numCase]
    if (!foundCase) foundCase = def.$cases.default ?? def.$cases.null
    if (!foundCase) throw new Error(`$switch: case ${numCase} nor a default case found`)
    return _read(foundCase, sb, {}, scopes, name)
}

function _readForEach(def, sb, scopes, name) {
    const val = []
    let [listName, listAlias] = def.$foreach.split(' ')
    let list = _resolve(listName, scopes)
    if (!Array.isArray(list)) throw new Error(`$foreach: ${listName} must be an array.`)
    if (!listAlias) throw new Error(`$foreach: item alias is missing, e.g. 'a' in $foreach: "${listName} a"`)
    for (const element of list) {
        let itemScope = {}
        itemScope[listAlias] = element
        scopes.push(itemScope)
        let obj = _read(def.$format, sb, {}, scopes, name)
        val.push(obj)
        scopes.pop()
    }
    return val
}

function _readFormatObject(def, sb, scopes, name) {
    if (def.$value) {
        return _resolve(def.$value, scopes)
    } else if (def.$format === '$tell') {
        if (def.$tell == null) throw new Error(`$format: '$tell' must have a $tell property containing its type`) // for compatibility with _write
        return sb.tell()
    } else if (def.$repeat != null) {
        const val = []
        let numRepeat = _resolve(def.$repeat, scopes)
        for (let i = 0; i < numRepeat; i++) {
            let obj = _read(def.$format, sb, {}, scopes, name)
            val.push(obj)
        }
        return val
    } else if (def.$foreach) {
        return _readForEach(def, sb, scopes, name)
    } else if (def.$format === 'string') {
        let length = _resolve(def.$length, scopes)
        let encoding = def.$encoding
        return sb.readString(length, encoding)
    } else if (def.$format === 'buffer') {
        let length = _resolve(def.$length, scopes)
        if (!length) throw new Error("When $format = 'buffer', $length must be an integer greater than 0.")
        return sb.read(length).buffer
    }
    return _read(def.$format, sb, {}, scopes, name)
}

function _readObject(def, sb, scopes) {
    const val = {}
    const cached = _getCachedDef(def)
    for (const key of cached.keys) {
        const h = cached.handlers[key]
        if (h) {
            if (h.kind === 'type') {
                val[key] = _readType(h.type, sb, key)
                continue
            } else if (h.kind === 'char') {
                val[key] = sb.readString(h.len)
                continue
            }
        }
        val[key] = _read(def[key], sb, val, scopes, key)
    }
    return val
}

function _read(def, sb, struct, scopes, name) {
    scopes.push(struct)

    let val,
        ignore = false

    if (typeof def === 'string') {
        if (def.startsWith('char')) {
            let [_, lenStr] = def.split('_')
            let len = Math.max(1, Number(lenStr))
            val = sb.readString(len)
        } else {
            val = _readType(def, sb, name)
        }
    } else if (typeof def === 'object') {
        if (def.$ignore) {
            ignore = true
        }
        if (def.$goto != null) {
            let pos = Number(_resolve(def.$goto, scopes))
            sb.seek(pos)
        } else if (def.$skip != null) {
            let skip = Number(_resolve(def.$skip, scopes))
            sb.skip(skip)
        }
        if (def.$value != null && def.$format == null) {
            throw new Error(`$value must be used with $format`)
        }

        if (def.$format) {
            val = _readFormatObject(def, sb, scopes, name)
        } else if (def.$switch) {
            val = _readSwitch(def, sb, scopes, name)
        } else {
            val = _readObject(def, sb, scopes)
        }
    }

    // Remove current scope from stack, MAKE SURE there is only ONE return statement in this function!
    scopes.pop()

    if (ignore) {
        Object.defineProperty(struct, name, {
            value: val,
            enumerable: false
        })
    } else {
        struct[name] = val
    }

    return val
}

function fixStringLength(str, len) {
    str = str.slice(0, len)
    str = str.padEnd(len, '\x00')
    return str
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
    scopes.push(val)

    const resolve = q => {
        return _resolve(q, scopes)
    }

    if (typeof def === 'string') {
        if (def.startsWith('char')) {
            if (val == null) val = ''
            if (typeof val !== 'string') throw new Error(`_write: char_x: ${val} is not a string (${name})`)
            let [_, lenStr] = def.split('_')
            let len = Math.max(1, Number(lenStr))
            let str = fixStringLength(val, len)
            sb.writeString(str)
        } else {
            _writeType(def, sb, val, name)
        }
    } else if (typeof def === 'object') {
        if (def.$goto != null) {
            let pos = resolve(def.$goto)
            sb.seek(pos)
        }
        if (def.$skip != null) {
            let skip = resolve(def.$skip)
            sb.skip(skip)
        }
        if (def.$value != null && def.$format == null) {
            throw new Error(`_write: $value must be used with $format`)
        }

        if (def.$format) {
            if (def.$value) {
                val = resolve(def.$value)
                _write(def.$format, sb, val, scopes, name)
            } else if (def.$format === '$tell') {
                if (def.$tell == null)
                    throw new Error(`_write: $format: '$tell' must have a $tell property containing its type (${name})`)
                let pos = sb.tell()
                _write(def.$tell, sb, pos, scopes, name)
            } else if (def.$repeat != null) {
                let numRepeat = resolve(def.$repeat)
                for (let i = 0; i < numRepeat; i++) {
                    let item = val[i]
                    _write(def.$format, sb, item, scopes, name)
                }
            } else if (def.$foreach) {
                let [listName, listAlias] = def.$foreach.split(' ')
                let list = resolve(listName)
                if (!Array.isArray(list)) throw new Error(`$foreach: ${listName} must be an array.`)
                if (!listAlias)
                    throw new Error(`$foreach: item alias is missing, e.g. 'a' in $foreach: "${listName} a"`)

                for (let i = 0; i < list.length; i++) {
                    let element = list[i]
                    let itemScope = {}
                    itemScope[listAlias] = element
                    scopes.push(itemScope)
                    try {
                        _write(def.$format, sb, val[i], scopes, name)
                    } finally {
                        scopes.pop()
                    }
                }
            } else if (def.$format === 'string') {
                if (typeof val !== 'string' && val != null)
                    throw new Error(`_write: string: ${val} is not a string (${name})`)
                let length = resolve(def.$length)
                if (!length)
                    throw new Error("_write: when $format = 'string', $length must be an integer greater than 0.")
                let encoding = def.$encoding
                let str = val ?? ''
                if (length) {
                    str = fixStringLength(str, length)
                }
                sb.writeString(str, encoding)
            } else if (def.$format === 'buffer') {
                let length = resolve(def.$length)
                if (!length)
                    throw new Error("_write: when $format = 'buffer', $length must be an integer greater than 0.")
                sb.write(Buffer.from(val))
            } else {
                _write(def.$format, sb, val, scopes, name)
            }
        } else if (def.$switch) {
            let numCase = resolve(def.$switch)
            if (Array.isArray(def.$cases)) {
                let newCases = {}
                def.$cases.forEach(c => (newCases[c.$case] = c))
                def.$cases = newCases
            }
            let foundCase = def.$cases[numCase]
            if (!foundCase) foundCase = def.$cases.default ?? def.$cases.null
            if (!foundCase) throw new Error(`$switch: case ${numCase} nor a default case found`)
            _write(foundCase, sb, val, scopes, name)
        } else {
            if (val == null) throw new Error(`_write: Can not read properties from missing '${name}'`)
            Object.entries(def).forEach(e => {
                let [name, type] = e
                _write(type, sb, val[name], scopes, name)
            })
        }
    } else {
        throw new Error(`_write: Unknown def type: ${def} (${typeof def})`)
    }

    scopes.pop()
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
    }

    let sb = new StreamBuffer(buffer)
    sb.seek(options.offset)

    let result = _read(def, sb, {}, new Array())
    options.info.eof = sb.isEOF()
    options.info.pos = sb.tell()
    options.info.len = buffer.length
    return result
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
    }

    let sb = new StreamBuffer(buffer)
    sb.seek(options.offset)

    _write(def, sb, obj, new Array())

    // Return the number of bytes written
    return sb.tell()
}

function sizeOf(def, bufferSize = 4096) {
    let buffer = Buffer.alloc(bufferSize)
    let sb = new StreamBuffer(buffer)
    _read(def, sb, {}, new Array())
    return sb.tell()
}

module.exports = {
    EndianModes,

    readStruct,
    writeStruct,
    sizeOf
}
