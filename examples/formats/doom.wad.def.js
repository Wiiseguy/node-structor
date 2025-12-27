// Based on https://doomwiki.org/wiki/WAD

module.exports = {
    identification: 'char_4', // "IWAD" or "PWAD"
    numlumps: 'int32le',
    infotableofs: 'int32le',
    directory: {
        $goto: 'infotableofs',
        $repeat: 'numlumps',
        $format: {
            filepos: 'int32le',
            size: 'int32le',
            name: 'char_8'
        }
    }
}
