const { path } = require(`./filenames/ytdlp`);
const child_process = require('child_process');
const fs = require('fs');
const idGen = require(`../util/idGen`);

const time = require(`../util/time`);

module.exports = {
    listFormats: (url) => new Promise(async res => {
        console.log(`going to path ${path}; url "${url}"`)

        const proc = child_process.spawn(path, [url, `--dump-single-json`]);

        let data = ``;

        proc.stderr.on(`data`, d => console.log(d.toString().trim()))

        proc.stdout.on(`data`, d => {
            //console.log(`output`, d.toString())
            data += d.toString().trim();
        });

        proc.on(`error`, e => {
            console.log(e)
        })

        proc.on(`close`, code => {
            console.log(`listFormats closed with code ${code}`)
            const d = JSON.parse(data);
            //console.log(d)
            res(d)
        })
    }),
    getFilename: (url, format) => new Promise(async res => {
        const { outputFilename } = require(`../getConfig`)();

        const args = [`-f`, format, url, `-o`, outputFilename, `--get-filename`];

        const proc = child_process.spawn(path, args);

        let data = ``;

        proc.stderr.on(`data`, d => console.log(d.toString().trim()))

        proc.stdout.on(`data`, d => {
            //console.log(`output`, d.toString())
            data += d.toString().trim();
        });
        
        proc.on(`close`, code => {
            console.log(`getFilename closed with code ${code}`);
            console.log(data)
            res(data)
        })
    }),
    download: ({url, format, ext, filePath}, updateFunc) => new Promise(async res => {
        const temporaryFilename = `ezytdl-` + idGen(8);

        const { saveLocation, outputFilename } = require(`../getConfig`)();

        const ffmpegPath = require(`./filenames/ffmpeg`).path;

        console.log(saveLocation, filePath, outputFilename)

        const saveTo = (filePath || saveLocation) + (require('os').platform() == `win32` ? `\\` : `/`)
        
        const args = [`-f`, format, url, `-o`, saveTo + outputFilename + `.%(ext)s`, `--embed-thumbnail`, `--embed-metadata`, `--no-mtime`];

        if(fs.existsSync(ffmpegPath)) {
            args.push(`--ffmpeg-location`, ffmpegPath);
        } else {
            ext = null;
        }
        
        if(ext) {
            args[4] = args[4].replace(outputFilename, temporaryFilename);
            args.splice(5, 2)
        }
        
        console.log(`saveTo: ` + saveTo, `\n- ` + args.join(`\n- `))

        const proc = child_process.spawn(path, args);

        let obj = {};

        let update = (o) => {
            obj = Object.assign({}, obj, o);
            updateFunc(obj);
        };

        update({saveLocation, url, format, kill: () => {
            if(proc && proc.kill && typeof proc.kill == `function`) proc.kill()
        }, status: `Downloading...`})

        proc.stdout.on(`data`, data => {
            const string = data.toString();

            console.log(string.trim());

            if(string.includes(`Destination:`)) update({destinationFile: string.split(`Destination:`)[1].trim()})

            const percent = string.includes(`%`) ? string.split(`%`)[0].split(` `).slice(-1)[0] : null;
            if(percent) {
                const downloadSpeed = string.includes(`/s`) ? string.split(`/s`)[0].split(` `).slice(-1)[0] + `/s` : `-1B/s`;
                const eta = string.includes(`ETA`) ? string.split(`ETA`)[1].split(` `).slice(1).join(` `) : `00:00`;
                console.log(percent)
                update({percentNum: Number(percent), downloadSpeed, eta});
            }
        });

        proc.stderr.on(`data`, data => {
            const string = data.toString();

            console.log(string.trim())
        })
        
        proc.on(`close`, async code => {
            if(ext) {
                console.log(`Retrieving filename`);

                const ytdlFilename = await module.exports.getFilename(url, format);

                const previousFilename = obj.destinationFile ? `ezytdl` + obj.destinationFile.split(`ezytdl`).slice(-1)[0] : temporaryFilename;
                
                obj.destinationFile = ytdlFilename;

                console.log(`file extension was provided! continuing with ffmpeg...`, obj.destinationFile);

                update({status: `Converting to ${ext.toUpperCase()}...`, percentNum: 0, eta: `--`});

                const args2 = [`-y`, `-i`, saveTo + previousFilename, saveTo + ytdlFilename + `.${ext}`];

                console.log(`- ` + args2.join(`\n- `))

                const proc2 = child_process.spawn(ffmpegPath, args2);

                let duration = null;

                proc2.stderr.on(`data`, d => {
                    const data = `${d}`

                    console.log(`STDERR | ${data.trim()}`);
                    if(data.includes(`Duration:`)) {
                        duration = time(data.trim().split(`Duration:`)[1].trim().split(`,`)[0]).units.ms;
                        console.log(`duration: `, duration)
                    };

                    if(data.includes(`time=`)) {
                        const timestamp = time(data.trim().split(`time=`)[1].trim().split(` `)[0]).units.ms;
                        update({percentNum: (Math.round((timestamp / duration) * 1000))/10})
                    }

                    if(data.includes(`speed=`)) {
                        const speed = data.trim().split(`speed=`)[1].trim().split(` `)[0];
                        update({downloadSpeed: speed})
                    }
                });

                proc2.stdout.on(`data`, data => {
                    console.log(`STDOUT | ${data.toString().trim()}`)
                });

                proc2.on(`close`, () => {
                    console.log(`ffmpeg completed; deleting temporary file...`);
                    fs.unlinkSync(saveTo + previousFilename);
                    update({percentNum: 100, status: `Done!`, saveLocation: saveTo, destinationFile: saveTo + ytdlFilename + `.${ext}`, url, format});
                    res(obj)
                })
            } else {
                update({code, saveLocation, url, format, status: `Done!`})
                res(obj)
            }
        })
    })
}