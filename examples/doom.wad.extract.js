// USAGE: node examples/doom.wad.extract.js [path/to/file.wad] or
//        node examples/doom.wad.extract.js and then enter path when prompted
const structor = require('../index.js')
const fs = require('node:fs')
const wadDef = require('./formats/doom.wad.def.js')

async function main() {
    let path = process.argv[2]
    if (path) path = path.trim()
    if (!path) {
        path = await new Promise(resolve => {
            process.stdout.write('Enter path to a Doom WAD file: ')
            process.stdin.once('data', data => {
                resolve(data.toString().trim())
            })
        })
    }
    const fileBuffer = fs.readFileSync(path)
    const wadContents = await structor.readStruct(wadDef, fileBuffer)
    console.table(wadContents.directory)
    console.log(
        `${path} - File size: ${fileBuffer.length} bytes - ${wadContents.identification} - lumps: ${wadContents.numlumps} (see table above)`
    )
    process.exit(0)
}

main()
