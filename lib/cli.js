#!/usr/bin/env node

const fs = require("fs");
const readline = require("readline-sync");
const cli_parse = require(".\\cli-parse.js");
const MusicDownloader = require(".\\music-downloader.js");

// credentials
if (!fs.existsSync(`${__dirname}\\..\\_credentials_.json`)) {
    fs.writeFileSync(`${__dirname}\\..\\_credentials_.json`, JSON.stringify({"clientId":".","clientSecret":"."}));
}
var credentials = require(`${__dirname}\\..\\_credentials_.json`);
var downloader;

// set app credentials
var set = (argv) => {
    if (argv.clientId) {
        credentials.clientId = argv.clientId;
        console.log("Successfully set clientId");
    }
    if (argv.clientSecret) {
        credentials.clientSecret = argv.clientSecret;
        console.log("Successfully set clientSecret");
    }
    fs.writeFileSync(`${__dirname}\\..\\_credentials_.json`, JSON.stringify(credentials));
}

function removeDuplicates(arr) {
    return arr.filter((item,
        index) => arr.indexOf(item) === index);
}

// queue
const reauthorise = 50;
var downloaded = 0;
var length = 0;
var queue = [];
var urls = [];
var downloadQueue = () => {
    if (!queue[0]) return;

    let download = () => {
        downloader.downloadFromUrl(queue[0])
        .then((data) => {
            downloaded++;
            console.log(`${data} [${downloaded}/${length}]\n`);
            queue.shift();
            downloadQueue();
        }, (err) => {
            downloadQueue();
            console.log(err);
        });
    }

    if (downloaded !== 0 && downloaded % reauthorise === 0) {
        console.log("Reloading credentials\n");
        downloader = new MusicDownloader(credentials, process.cwd())
        .then((object) => {
            downloader = object;
            download();
        });
    } else {
        download();
    }
}
var loadQueue = () => {
    if (!urls[0]) {
        queue = removeDuplicates(queue);
        length = queue.length;
        downloadQueue();
        return;
    };
    let url = urls.shift(); 
    let split = url.split("/");
    if (split[0] === "https:") {
        if (types[split[3]]) {
            types[split[3]](url);
        }
    }
}

// download types
var types = {
    "track": (url) => {
        queue.push(url);
        length = queue.length;
        loadQueue();
    },
    "playlist": (url, options) => {
        let split = url.split("/");
        let id = split[4].split("?")[0];
        downloader.spotify.getPlaylistTracks(id, options).then((data) => {
            let offset = data.body.offset;
            let total = data.body.total;
            let limit = data.body.limit;
            let totalDownloaded = offset + limit;
            data.body.items.forEach(item => {
				if (item.track) {
                    if (item.track.id) {
                        queue.push(item.track.external_urls.spotify);
                    }
				}
            });
            length = queue.length;
            if (total > totalDownloaded) {
                // not all downloaded
                if (!options) options = {};
                options.offset = totalDownloaded;
                options.limit = limit;
                types["playlist"](url, options);
            } else {
                loadQueue();
            }
        });
    },
    "album": (url) => {
        let split = url.split("/");
        downloader.spotify.getAlbum(split[4]).then((data) => {
            data.body.tracks.items.forEach(track => {
                queue.push(track.external_urls.spotify);
            });
            length = queue.length;
            loadQueue();
        });
    }
}

// cli parser
var parser = cli_parse();
parser.then((data) => {
    if (data.cmd === "download") {
        downloader = new MusicDownloader(credentials, process.cwd())
        .then((object) => {
            downloader = object;
            var a = Number(readline.question("Number of URLs: "));
            for (let i = 0; i < a; ++i) {
                urls.push(readline.question(`URL ${i + 1}: `));
            }
            console.log("\n");
            loadQueue();
        });
    }
    if (data.cmd === "set") {
        set(data.argv);
    }
});